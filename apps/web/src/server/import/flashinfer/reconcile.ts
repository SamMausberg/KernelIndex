// Reconciliation (§14.4): FlashInfer definitions, baseline solutions, and
// baseline traces onto canonical identity. Definitions overlap SOL by
// design; identical semantics dedupe by digest, while a slug that maps to
// different semantics becomes a review ambiguity, never an overwrite.
import { eq } from "drizzle-orm"
import type { DbHandle, ImportBundle } from "../../catalog/publication.ts"
import * as schema from "../../db/schema.ts"
import { specDigest } from "../../identity/digest.ts"
import { snapshotRow } from "../fetch.ts"
import { type ProposedObject, proposedObjects } from "../report.ts"
import {
  caseFromEntry,
  operationFromDefinition,
  runFromTrace,
  traceEnvironment,
  workloadEntryKey,
} from "../sol/normalize.ts"
import type { FiImportData } from "./discover.ts"
import {
  fiTraceProtocol,
  implementationFromFiSolution,
  projectForAuthor,
} from "./normalize.ts"
import { DATASET_URL, FLASHINFER_SOURCE, PARSER } from "./types.ts"

export type FiImportReport = {
  source: string
  parserVersion: string
  revision: string
  discovered: {
    definitions: number
    solutions: number
    traces: number
    snapshots: number
  }
  code: { solutionsWithCode: number; totalBytes: number }
  operationsByFamily: Record<string, number>
  proposed: ProposedObject[]
  ambiguities: string[]
  issues: { locator: string; item: string; problem: string }[]
  driftWarnings: string[]
  licenseWarnings: string[]
  plan: string
}

export async function reconcileFlashinfer(
  database: DbHandle,
  data: FiImportData,
): Promise<{ bundle: ImportBundle; report: FiImportReport }> {
  const report: FiImportReport = {
    source: FLASHINFER_SOURCE.slug,
    parserVersion: PARSER.version,
    revision: data.revision,
    discovered: {
      definitions: data.definitions.size,
      solutions: data.solutions.length,
      traces: data.traces.length,
      snapshots: data.snapshots.length,
    },
    code: { solutionsWithCode: 0, totalBytes: 0 },
    operationsByFamily: {},
    proposed: [],
    ambiguities: [],
    issues: [...data.issues],
    driftWarnings: [...data.driftWarnings],
    licenseWarnings: [],
    plan: "",
  }
  const bundle: ImportBundle = {
    source: { ...FLASHINFER_SOURCE },
    snapshots: data.snapshots.map((snapshot) => snapshotRow(snapshot, PARSER)),
    projects: [],
    operations: [],
    workloads: [],
    implementations: [],
    runs: [],
  }

  const protocol = fiTraceProtocol()
  const protocolDigest = specDigest(protocol)
  const operationDigestByName = new Map<string, string>()
  const implementationDigestBySolution = new Map<string, string>()
  const caseDigestByKey = new Map<string, string>()
  const environmentByKey = new Map<
    string,
    { manifest: ReturnType<typeof traceEnvironment>; digest: string }
  >()
  const seenProjects = new Set<string>()

  for (const definition of data.definitions.values()) {
    const operation = operationFromDefinition(
      definition,
      `${DATASET_URL}/blob/${data.revision}/definitions`,
    )
    const digest = specDigest(operation.manifest)
    operationDigestByName.set(definition.name, digest)
    bundle.operations.push(operation)
    const family = operation.manifest.spec.family
    report.operationsByFamily[family] =
      (report.operationsByFamily[family] ?? 0) + 1
    const [slugRow] = await database
      .select({ semanticDigest: schema.operations.semanticDigest })
      .from(schema.operations)
      .where(eq(schema.operations.slug, operation.slug))
    if (slugRow && slugRow.semanticDigest !== digest) {
      report.ambiguities.push(
        `operation slug '${operation.slug}' already maps to ${slugRow.semanticDigest}; import proposes ${digest} — needs review (SOL overlap is expected here)`,
      )
    }
  }

  for (const entry of data.solutions) {
    const definition = data.definitions.get(entry.solution.definition)
    const operationDigest = operationDigestByName.get(entry.solution.definition)
    if (!definition || !operationDigest) {
      // Identity question, not a parse failure (§14.4): which definition did
      // upstream mean? Reviewed via the report, never guessed or published.
      report.ambiguities.push(
        `solution '${entry.solution.name}' references unknown definition '${entry.solution.definition}'; skipped pending review`,
      )
      continue
    }
    const implementation = implementationFromFiSolution({
      solution: entry.solution,
      definition,
      operationSpecDigest: operationDigest,
      revision: data.revision,
      path: entry.path,
    })
    implementationDigestBySolution.set(
      entry.solution.name,
      specDigest(implementation.manifest),
    )
    if (!seenProjects.has(implementation.projectSlug)) {
      seenProjects.add(implementation.projectSlug)
      const project = projectForAuthor(entry.solution.author ?? null)
      bundle.projects.push({
        manifest:
          project.manifest as ImportBundle["projects"][number]["manifest"],
        slug: project.slug,
      })
    }
    bundle.implementations.push(implementation)
    const source = implementation.manifest.spec.source
    if (source) {
      report.code.solutionsWithCode++
      report.code.totalBytes += source.sizeBytes ?? 0
    }
  }

  for (const trace of data.traces) {
    const key = workloadEntryKey(trace.workload)
    const definition = data.definitions.get(trace.definition)
    const operationDigest = operationDigestByName.get(trace.definition)
    if (!definition || !operationDigest) {
      report.issues.push({
        locator: "normalize",
        item: `trace/${key}`,
        problem: `trace references unknown definition '${trace.definition}'`,
      })
      continue
    }
    const implementationDigest = trace.solution
      ? implementationDigestBySolution.get(trace.solution)
      : undefined
    if (!implementationDigest) {
      report.ambiguities.push(
        `trace for '${trace.definition}' references solution '${trace.solution ?? "none"}' with no discovered baseline; skipped pending review`,
      )
      continue
    }
    if (!trace.evaluation) {
      report.issues.push({
        locator: "normalize",
        item: `trace/${key}`,
        problem: "trace has no evaluation",
      })
      continue
    }
    try {
      let caseDigest = caseDigestByKey.get(key)
      if (!caseDigest) {
        const manifest = caseFromEntry(
          definition,
          operationDigest,
          trace.workload,
        )
        caseDigest = specDigest(manifest)
        caseDigestByKey.set(key, caseDigest)
        bundle.workloads.push({ manifest, externalId: key })
      }
      const environmentKey = JSON.stringify(trace.evaluation.environment)
      let environment = environmentByKey.get(environmentKey)
      if (!environment) {
        const manifest = traceEnvironment(trace.evaluation.environment)
        environment = { manifest, digest: specDigest(manifest) }
        environmentByKey.set(environmentKey, environment)
      }
      bundle.runs.push(
        runFromTrace({
          trace,
          implementationDigest,
          workloadDigest: caseDigest,
          protocol,
          protocolDigest,
          environment: environment.manifest,
          environmentDigest: environment.digest,
          sourceSlug: FLASHINFER_SOURCE.slug,
        }),
      )
    } catch (error) {
      report.issues.push({
        locator: "normalize",
        item: `trace/${key}`,
        problem: (error as Error).message,
      })
    }
  }

  report.proposed = await proposedObjects(database, bundle)
  const inserts = report.proposed.filter(
    (object) => object.action === "insert",
  ).length
  report.plan = `publish ${inserts} new objects (${report.proposed.length - inserts} already present) into source '${FLASHINFER_SOURCE.slug}' via the idempotent publication transaction`
  return { bundle, report }
}
