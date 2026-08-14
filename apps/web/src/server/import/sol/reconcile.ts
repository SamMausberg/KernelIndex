// Reconciliation (§14.4): map discovered SOL data onto canonical identity,
// check the catalog for existing digests and slug conflicts, and assemble the
// publication bundle plus the reviewable dry-run report (§14.2). Names alone
// never merge identity; ambiguity becomes a review item, not an overwrite.
import { eq, inArray } from "drizzle-orm"
import type { DbHandle, ImportBundle } from "../../catalog/publication.ts"
import * as schema from "../../db/schema.ts"
import { specDigest } from "../../identity/digest.ts"
import type { SolImportData } from "./discover.ts"
import { snapshotRow } from "./fetch.ts"
import {
  caseFromEntry,
  implementationFromSolution,
  implementationFromSubmission,
  leaderboardEnvironment,
  leaderboardProtocol,
  operationFromDefinition,
  projectForUser,
  runFromSubmission,
  runFromTrace,
  solExecbenchProject,
  suiteFromEntries,
  traceEnvironment,
  traceProtocol,
} from "./normalize.ts"
import type { ImportIssue } from "./parse.ts"
import {
  LEADERBOARD_BASE,
  PARSER_VERSION,
  SOL_SOURCE,
  type SolSubmission,
} from "./types.ts"

export type ProposedObject = {
  entity: "operation" | "workload" | "implementation" | "run" | "project"
  name: string
  digest: string
  action: "insert" | "exists"
}

export type ImportReport = {
  source: string
  parserVersion: string
  discovered: {
    definitions: number
    workloadEntries: number
    submissions: number
    solutions: number
    traces: number
    snapshots: number
  }
  selectedSubmissions: number
  skippedSubmissions: {
    incorrect: number
    disqualified: number
    filtered: number
  }
  proposed: ProposedObject[]
  ambiguities: string[]
  issues: ImportIssue[]
  driftWarnings: string[]
  licenseWarnings: string[]
  plan: string
}

export type ReconcileOptions = {
  /** Best N correct submissions per kernel become records. */
  topPerKernel: number
  /** Restrict to one evaluation stack version (--source-revision). */
  stackVersion?: string
}

function selectSubmissions(
  all: SolSubmission[],
  options: ReconcileOptions,
  report: ImportReport,
): SolSubmission[] {
  const usable: SolSubmission[] = []
  for (const submission of all) {
    if (submission.is_disqualified) {
      report.skippedSubmissions.disqualified++
    } else if (
      submission.status !== "COMPLETED" ||
      submission.is_correct !== true
    ) {
      report.skippedSubmissions.incorrect++
    } else if (
      options.stackVersion !== undefined &&
      submission.evaluation_stack_version !== options.stackVersion
    ) {
      report.skippedSubmissions.filtered++
    } else if (
      typeof submission.latency_ms !== "number" ||
      submission.latency_ms <= 0
    ) {
      report.skippedSubmissions.incorrect++
    } else {
      usable.push(submission)
    }
  }
  return usable
    .sort((a, b) => (b.sol_score ?? 0) - (a.sol_score ?? 0))
    .slice(0, options.topPerKernel)
}

/** Look up which digests already exist so the report shows real actions. */
async function existingDigests(
  database: DbHandle,
  table:
    | typeof schema.operations.semanticDigest
    | typeof schema.workloads.workloadDigest
    | typeof schema.implementations.implementationDigest
    | typeof schema.benchmarkRuns.runDigest,
  digests: string[],
): Promise<Set<string>> {
  if (digests.length === 0) return new Set()
  const rows = await database
    .select({ digest: table })
    .from(table.table)
    .where(inArray(table, digests))
  return new Set(rows.map((row) => row.digest))
}

export async function reconcile(
  database: DbHandle,
  data: SolImportData,
  options: ReconcileOptions,
): Promise<{ bundle: ImportBundle; report: ImportReport }> {
  const report: ImportReport = {
    source: SOL_SOURCE.slug,
    parserVersion: PARSER_VERSION,
    discovered: {
      definitions: data.definitions.size,
      workloadEntries: [...data.workloadEntries.values()].reduce(
        (n, list) => n + list.length,
        0,
      ),
      submissions: [...data.submissions.values()].reduce(
        (n, list) => n + list.length,
        0,
      ),
      solutions: data.solutions.length,
      traces: data.traces.length,
      snapshots: data.snapshots.length,
    },
    selectedSubmissions: 0,
    skippedSubmissions: { incorrect: 0, disqualified: 0, filtered: 0 },
    proposed: [],
    ambiguities: [],
    issues: [...data.issues],
    driftWarnings: [...data.driftWarnings],
    licenseWarnings: [],
    plan: "",
  }

  const bundle: ImportBundle = {
    source: { ...SOL_SOURCE },
    snapshots: data.snapshots.map((snapshot) => snapshotRow(snapshot)),
    projects: [],
    operations: [],
    workloads: [],
    implementations: [],
    runs: [],
  }

  // Operations.
  const operationDigestByName = new Map<string, string>()
  for (const [name, definition] of data.definitions) {
    try {
      const operation = operationFromDefinition(
        definition,
        `${LEADERBOARD_BASE}/kernels`,
      )
      const digest = specDigest(operation.manifest)
      operationDigestByName.set(name, digest)
      bundle.operations.push(operation)
      const [slugRow] = await database
        .select({ semanticDigest: schema.operations.semanticDigest })
        .from(schema.operations)
        .where(eq(schema.operations.slug, operation.slug))
      if (slugRow && slugRow.semanticDigest !== digest) {
        report.ambiguities.push(
          `operation slug '${operation.slug}' already maps to ${slugRow.semanticDigest}; import proposes ${digest} — needs review`,
        )
      }
    } catch (error) {
      report.issues.push({
        locator: "normalize",
        item: name,
        problem: (error as Error).message,
      })
    }
  }

  // Workload cases and suites.
  const suiteDigestByName = new Map<string, string>()
  const caseDigestByUuid = new Map<string, string>()
  for (const [name, entries] of data.workloadEntries) {
    const definition = data.definitions.get(name)
    const operationDigest = operationDigestByName.get(name)
    if (!definition || !operationDigest) continue
    for (const entry of entries) {
      try {
        const manifest = caseFromEntry(definition, operationDigest, entry)
        caseDigestByUuid.set(entry.uuid, specDigest(manifest))
        bundle.workloads.push({ manifest, externalId: entry.uuid })
      } catch (error) {
        report.issues.push({
          locator: "normalize",
          item: `${name}/${entry.uuid}`,
          problem: (error as Error).message,
        })
      }
    }
    if ((data.submissions.get(name) ?? []).length > 0) {
      const suite = suiteFromEntries(definition, operationDigest, entries)
      suiteDigestByName.set(name, specDigest(suite))
      bundle.workloads.push({ manifest: suite, externalId: `${name}/suite` })
    }
  }

  // Example solutions: implementations with real pinned source.
  const implementationDigestBySolution = new Map<string, string>()
  if (data.solutions.length > 0) {
    const project = solExecbenchProject(
      "https://github.com/nvidia/sol-execbench",
    )
    bundle.projects.push({ manifest: project.manifest, slug: project.slug })
  }
  for (const entry of data.solutions) {
    const definition = data.definitions.get(entry.definitionName)
    const operationDigest = operationDigestByName.get(entry.definitionName)
    if (!definition || !operationDigest) {
      report.issues.push({
        locator: "normalize",
        item: entry.solution.name,
        problem: `solution references unknown definition '${entry.definitionName}'`,
      })
      continue
    }
    if (!/^[0-9a-f]{40}$/.test(entry.commit)) {
      report.issues.push({
        locator: "normalize",
        item: entry.solution.name,
        problem:
          "no pinned commit for the examples tree (set SOL_EXAMPLES_COMMIT); skipping to avoid an unpinned source claim",
      })
      continue
    }
    try {
      const implementation = implementationFromSolution({
        solution: entry.solution,
        definition,
        operationSpecDigest: operationDigest,
        repository: entry.repository,
        commit: entry.commit,
        examplePath: entry.examplePath,
      })
      implementationDigestBySolution.set(
        entry.solution.name,
        specDigest(implementation.manifest),
      )
      bundle.implementations.push(implementation)
    } catch (error) {
      report.issues.push({
        locator: "normalize",
        item: entry.solution.name,
        problem: (error as Error).message,
      })
    }
  }

  // Leaderboard submissions: implementations plus suite-aggregate runs.
  const seenProjects = new Set<string>()
  for (const [name, all] of data.submissions) {
    const definition = data.definitions.get(name)
    const operationDigest = operationDigestByName.get(name)
    const suiteDigest = suiteDigestByName.get(name)
    if (!definition || !operationDigest) continue
    if (!suiteDigest) {
      if (all.length > 0) {
        report.ambiguities.push(
          `kernel '${name}' has submissions but no workload suite; its records were skipped`,
        )
      }
      continue
    }
    const selected = selectSubmissions(all, options, report)
    report.selectedSubmissions += selected.length
    for (const submission of selected) {
      try {
        const stackVersion = submission.evaluation_stack_version ?? "unknown"
        const protocol = leaderboardProtocol(stackVersion)
        const environment = leaderboardEnvironment(
          submission.gpu_type,
          stackVersion,
        )
        const implementation = implementationFromSubmission(
          submission,
          definition,
          operationDigest,
        )
        const implementationDigest = specDigest(implementation.manifest)
        const project = projectForUser(submission.username)
        if (!seenProjects.has(project.slug)) {
          seenProjects.add(project.slug)
          bundle.projects.push({
            manifest: project.manifest,
            slug: project.slug,
          })
        }
        bundle.implementations.push(implementation)
        report.licenseWarnings.push(
          `submission ${submission.id} (${submission.username}): no public source or license; record is reported-only`,
        )
        bundle.runs.push(
          runFromSubmission({
            submission,
            implementationDigest,
            workloadDigest: suiteDigest,
            protocol,
            protocolDigest: specDigest(protocol),
            environment,
            environmentDigest: specDigest(environment),
          }),
        )
      } catch (error) {
        report.issues.push({
          locator: "normalize",
          item: `submission/${submission.id}`,
          problem: (error as Error).message,
        })
      }
    }
  }

  // Traces: exact per-case runs (the gold-record path).
  for (const trace of data.traces) {
    const definition = data.definitions.get(trace.definition)
    const operationDigest = operationDigestByName.get(trace.definition)
    if (!definition || !operationDigest) {
      report.issues.push({
        locator: "normalize",
        item: `trace/${trace.workload.uuid}`,
        problem: `trace references unknown definition '${trace.definition}'`,
      })
      continue
    }
    const implementationDigest = trace.solution
      ? implementationDigestBySolution.get(trace.solution)
      : undefined
    if (!implementationDigest) {
      report.ambiguities.push(
        `trace for '${trace.definition}' references solution '${trace.solution ?? "none"}' with no discovered implementation; skipped pending review`,
      )
      continue
    }
    try {
      let caseDigest = caseDigestByUuid.get(trace.workload.uuid)
      if (!caseDigest) {
        const manifest = caseFromEntry(
          definition,
          operationDigest,
          trace.workload,
        )
        caseDigest = specDigest(manifest)
        caseDigestByUuid.set(trace.workload.uuid, caseDigest)
        bundle.workloads.push({ manifest, externalId: trace.workload.uuid })
      }
      if (!trace.evaluation) throw new Error("trace has no evaluation")
      const protocol = traceProtocol()
      const environment = traceEnvironment(trace.evaluation.environment)
      bundle.runs.push(
        runFromTrace({
          trace,
          implementationDigest,
          workloadDigest: caseDigest,
          protocol,
          protocolDigest: specDigest(protocol),
          environment,
          environmentDigest: specDigest(environment),
        }),
      )
    } catch (error) {
      report.issues.push({
        locator: "normalize",
        item: `trace/${trace.workload.uuid}`,
        problem: (error as Error).message,
      })
    }
  }

  // Compare proposed digests against the live catalog for the report.
  const opDigests = bundle.operations.map((entry) => specDigest(entry.manifest))
  const workloadDigests = bundle.workloads.map((entry) =>
    specDigest(entry.manifest),
  )
  const implementationDigests = bundle.implementations.map((entry) =>
    specDigest(entry.manifest),
  )
  const runDigests = bundle.runs.map((entry) => specDigest(entry.manifest))
  const [
    existingOps,
    existingWorkloads,
    existingImplementations,
    existingRuns,
  ] = await Promise.all([
    existingDigests(database, schema.operations.semanticDigest, opDigests),
    existingDigests(database, schema.workloads.workloadDigest, workloadDigests),
    existingDigests(
      database,
      schema.implementations.implementationDigest,
      implementationDigests,
    ),
    existingDigests(database, schema.benchmarkRuns.runDigest, runDigests),
  ])
  for (const [index, entry] of bundle.operations.entries()) {
    report.proposed.push({
      entity: "operation",
      name: entry.slug,
      digest: opDigests[index],
      action: existingOps.has(opDigests[index]) ? "exists" : "insert",
    })
  }
  for (const [index, entry] of bundle.workloads.entries()) {
    report.proposed.push({
      entity: "workload",
      name: entry.manifest.metadata.name,
      digest: workloadDigests[index],
      action: existingWorkloads.has(workloadDigests[index])
        ? "exists"
        : "insert",
    })
  }
  for (const [index, entry] of bundle.implementations.entries()) {
    report.proposed.push({
      entity: "implementation",
      name: entry.slug,
      digest: implementationDigests[index],
      action: existingImplementations.has(implementationDigests[index])
        ? "exists"
        : "insert",
    })
  }
  for (const [index, entry] of bundle.runs.entries()) {
    report.proposed.push({
      entity: "run",
      name: entry.manifest.metadata.name,
      digest: runDigests[index],
      action: existingRuns.has(runDigests[index]) ? "exists" : "insert",
    })
  }

  const inserts = report.proposed.filter(
    (object) => object.action === "insert",
  ).length
  report.plan = `publish ${inserts} new objects (${report.proposed.length - inserts} already present) into source '${SOL_SOURCE.slug}' via the idempotent publication transaction`
  return { bundle, report }
}
