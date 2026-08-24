// Reconciliation (§14.4): map discovered SOL data onto canonical identity,
// check the catalog for existing digests and slug conflicts, and assemble the
// publication bundle plus the reviewable dry-run report (§14.2). Names alone
// never merge identity; ambiguity becomes a review item, not an overwrite.
import { eq } from "drizzle-orm"
import type { DbHandle, ImportBundle } from "../../catalog/publication.ts"
import * as schema from "../../db/schema.ts"
import { specDigest } from "../../identity/digest.ts"
import { snapshotRow } from "../fetch.ts"
import { type ProposedObject, proposedObjects } from "../report.ts"
import type { SolImportData } from "./discover.ts"
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
  workloadEntryKey,
} from "./normalize.ts"
import type { ImportIssue } from "./parse.ts"
import {
  LEADERBOARD_BASE,
  PARSER_NAME,
  PARSER_VERSION,
  SOL_SOURCE,
  type SolSubmission,
} from "./types.ts"

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
    reviewedImplausible: number
  }
  /** Proposed operations per family — the tranche-review summary (§14.8). */
  operationsByFamily: Record<string, number>
  proposed: ProposedObject[]
  ambiguities: string[]
  issues: ImportIssue[]
  driftWarnings: string[]
  licenseWarnings: string[]
  plan: string
}

export type ReconcileOptions = {
  /** Distinct submitters kept per kernel; null keeps every submitter. */
  topPerKernel: number | null
  /** Restrict to one evaluation stack version (--source-revision). */
  stackVersion?: string
}

/** Reviewed §14.8 verdicts: submissions confirmed to beat a per-case
 * speed-of-light bound stay excluded as implausible. The rationale lives
 * here so the audit trail is in git; remove an entry to re-open review. */
const REVIEWED_IMPLAUSIBLE = new Map<number, string>([
  [
    36950,
    "2026-08-18: 1.913 ms on 012_moe_expert_batched_execution_with_capacity_factor beats the 1.974 ms minimum per-case SOL bound",
  ],
  [
    6549,
    "2026-08-24: 1.715685 ms on 012_moe_expert_batched_execution_with_capacity_factor beats the 1.97381363 ms minimum per-case SOL bound — same kernel and same class as 36950",
  ],
  [
    16818,
    "2026-08-24: 0.001805 ms on 002_fp8_attention_qkv_projection is 11x under the 0.01979811 ms minimum per-case SOL bound; no measurement of this computation can be that fast",
  ],
])

function selectSubmissions(
  all: SolSubmission[],
  options: ReconcileOptions,
  report: ImportReport,
  solBoundMs: number | null,
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
    } else if (solBoundMs !== null && submission.latency_ms < solBoundMs) {
      // §14.8: suspicious or impossible performance goes to review, and a
      // bogus leader must not silently pull a slower entry into the top N.
      // A reviewed verdict keeps the exclusion without re-flagging weekly.
      if (REVIEWED_IMPLAUSIBLE.has(submission.id)) {
        report.skippedSubmissions.reviewedImplausible++
      } else {
        report.ambiguities.push(
          `submission ${submission.id} (${submission.username}) on '${submission.kernel_name}' reports ${submission.latency_ms} ms, beating the minimum per-case speed-of-light bound ${solBoundMs} ms; skipped pending review`,
        )
      }
    } else {
      usable.push(submission)
    }
  }
  // Breadth before depth: a kernel's records are its distinct submitters'
  // personal bests, then the next-best attempts if room remains. Ranking the
  // raw list instead would let one prolific submitter fill the whole quota.
  const ranked = usable.sort((a, b) => (b.sol_score ?? 0) - (a.sol_score ?? 0))
  // Username is the submitter's identity everywhere else in this importer
  // (it is what projectForUser resolves), so it is the grouping key here.
  const seen = new Set<string>()
  const bests: SolSubmission[] = []
  const rest: SolSubmission[] = []
  for (const submission of ranked) {
    if (seen.has(submission.username)) rest.push(submission)
    else {
      seen.add(submission.username)
      bests.push(submission)
    }
  }
  const selected = [...bests, ...rest]
  return options.topPerKernel === null
    ? selected
    : selected.slice(0, options.topPerKernel)
}

/**
 * Minimum per-case speed-of-light latency in ms; null when any case lacks a
 * bound. The upstream suite aggregate's weighting is not published, so only
 * the minimum is a valid bound: no average of per-case latencies, however
 * weighted, can beat the fastest case's physical limit.
 */
function suiteSolBound(
  definition: { sol_is_dummy?: boolean | null },
  entries: { sol_ms?: number | null | undefined }[],
): number | null {
  if (definition.sol_is_dummy || entries.length === 0) return null
  let minimum = Number.POSITIVE_INFINITY
  for (const entry of entries) {
    if (typeof entry.sol_ms !== "number" || entry.sol_ms <= 0) return null
    minimum = Math.min(minimum, entry.sol_ms)
  }
  return minimum
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
    skippedSubmissions: {
      incorrect: 0,
      disqualified: 0,
      filtered: 0,
      reviewedImplausible: 0,
    },
    operationsByFamily: {},
    proposed: [],
    ambiguities: [],
    issues: [...data.issues],
    driftWarnings: [...data.driftWarnings],
    licenseWarnings: [],
    plan: "",
  }

  const bundle: ImportBundle = {
    source: { ...SOL_SOURCE },
    snapshots: data.snapshots.map((snapshot) =>
      snapshotRow(snapshot, { name: PARSER_NAME, version: PARSER_VERSION }),
    ),
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
      report.operationsByFamily[operation.manifest.spec.family] =
        (report.operationsByFamily[operation.manifest.spec.family] ?? 0) + 1
      const [slugRow] = await database
        .select({ semanticDigest: schema.operations.semanticDigest })
        .from(schema.operations)
        .where(eq(schema.operations.slug, operation.slug))
      if (slugRow && slugRow.semanticDigest !== digest) {
        report.ambiguities.push(
          `operation slug '${operation.slug}' already maps to ${slugRow.semanticDigest}; import proposes ${digest}; needs review`,
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
      const entryKey = workloadEntryKey(entry)
      try {
        const manifest = caseFromEntry(definition, operationDigest, entry)
        caseDigestByUuid.set(entryKey, specDigest(manifest))
        bundle.workloads.push({ manifest, externalId: entryKey })
      } catch (error) {
        report.issues.push({
          locator: "normalize",
          item: `${name}/${entryKey}`,
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
    const selected = selectSubmissions(
      all,
      options,
      report,
      suiteSolBound(definition, data.workloadEntries.get(name) ?? []),
    )
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
    const traceKey = workloadEntryKey(trace.workload)
    const definition = data.definitions.get(trace.definition)
    const operationDigest = operationDigestByName.get(trace.definition)
    if (!definition || !operationDigest) {
      report.issues.push({
        locator: "normalize",
        item: `trace/${traceKey}`,
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
      let caseDigest = caseDigestByUuid.get(traceKey)
      if (!caseDigest) {
        const manifest = caseFromEntry(
          definition,
          operationDigest,
          trace.workload,
        )
        caseDigest = specDigest(manifest)
        caseDigestByUuid.set(traceKey, caseDigest)
        bundle.workloads.push({ manifest, externalId: traceKey })
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
        item: `trace/${traceKey}`,
        problem: (error as Error).message,
      })
    }
  }

  // Compare proposed digests against the live catalog for the report.
  report.proposed = await proposedObjects(database, bundle)

  const inserts = report.proposed.filter(
    (object) => object.action === "insert",
  ).length
  report.plan = `publish ${inserts} new objects (${report.proposed.length - inserts} already present) into source '${SOL_SOURCE.slug}' via the idempotent publication transaction`
  return { bundle, report }
}

/**
 * One report for a windowed run: each window of kernels publishes in its own
 * transaction, and the reports it produced are folded back into the single
 * document the import gate and the operator read.
 */
export function mergeSolReports(reports: ImportReport[]): ImportReport {
  const merged = reports[0]
  if (!merged) throw new Error("no reports to merge")
  for (const report of reports.slice(1)) {
    for (const key of Object.keys(
      merged.discovered,
    ) as (keyof ImportReport["discovered"])[]) {
      merged.discovered[key] += report.discovered[key]
    }
    for (const key of Object.keys(
      merged.skippedSubmissions,
    ) as (keyof ImportReport["skippedSubmissions"])[]) {
      merged.skippedSubmissions[key] += report.skippedSubmissions[key]
    }
    merged.selectedSubmissions += report.selectedSubmissions
    for (const [family, count] of Object.entries(report.operationsByFamily)) {
      merged.operationsByFamily[family] =
        (merged.operationsByFamily[family] ?? 0) + count
    }
    merged.proposed.push(...report.proposed)
    merged.ambiguities.push(...report.ambiguities)
    merged.issues.push(...report.issues)
    merged.licenseWarnings.push(...report.licenseWarnings)
    for (const warning of report.driftWarnings) {
      if (!merged.driftWarnings.includes(warning))
        merged.driftWarnings.push(warning)
    }
  }
  return merged
}
