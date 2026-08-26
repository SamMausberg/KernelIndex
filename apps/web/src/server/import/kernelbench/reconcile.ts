// Reconciliation (§14.4): timing rows onto canonical identity. A problem
// whose module falls outside the static grammar is counted with its reason
// (skipped.unparsedProblems) — coverage stated, never implied (§20.3); a
// slug that already maps to a different semantic digest is an ambiguity.
import { eq } from "drizzle-orm"
import type { DbHandle, ImportBundle } from "../../catalog/publication.ts"
import * as schema from "../../db/schema.ts"
import { specDigest } from "../../identity/digest.ts"
import { snapshotRow } from "../fetch.ts"
import { type ProposedObject, proposedObjects } from "../report.ts"
import type { KbImportData } from "./discover.ts"
import {
  caseFromProblem,
  implementationFromMode,
  kbEnvironment,
  kbProtocol,
  operationFromProblem,
  projectManifest,
  runFromTiming,
} from "./normalize.ts"
import { type ProblemSpec, parseProblem } from "./problem.ts"
import { KB_SOURCE, PARSER } from "./types.ts"

export type KbImportReport = {
  source: string
  parserVersion: string
  revision: string
  discovered: { timings: number; problems: number; snapshots: number }
  skipped: {
    /** `level/file` → why its module could not be read statically. */
    unparsedProblems: Record<string, string>
    missingProblem: number
    unknownHardware: Record<string, number>
  }
  operationsByFamily: Record<string, number>
  proposed: ProposedObject[]
  ambiguities: string[]
  issues: { locator: string; item: string; problem: string }[]
  driftWarnings: string[]
  licenseWarnings: string[]
  plan: string
}

export async function reconcileKernelBench(
  database: DbHandle,
  data: KbImportData,
): Promise<{ bundle: ImportBundle; report: KbImportReport }> {
  const report: KbImportReport = {
    source: KB_SOURCE.slug,
    parserVersion: PARSER.version,
    revision: data.commit,
    discovered: {
      timings: data.timings.length,
      problems: data.problems.size,
      snapshots: data.snapshots.length,
    },
    skipped: { unparsedProblems: {}, missingProblem: 0, unknownHardware: {} },
    operationsByFamily: {},
    proposed: [],
    ambiguities: [],
    issues: [...data.issues],
    driftWarnings: [...data.driftWarnings],
    licenseWarnings: [],
    plan: "",
  }
  const bundle: ImportBundle = {
    source: { ...KB_SOURCE },
    snapshots: data.snapshots.map((snapshot) => snapshotRow(snapshot, PARSER)),
    projects: [projectManifest("pytorch")],
    operations: [],
    workloads: [],
    implementations: [],
    runs: [],
  }
  const protocol = kbProtocol()
  const protocolDigest = specDigest(protocol)

  // Problems first: one operation and one case each, parsed once.
  const problems = new Map<
    string,
    { spec: ProblemSpec; operationDigest: string; workloadDigest: string }
  >()
  for (const [key, source] of data.problems) {
    const [level, file] = key.split("/") as [ProblemSpec["family"], string]
    const outcome = parseProblem(level as "level1", file, source)
    if (outcome.problem !== undefined) {
      report.skipped.unparsedProblems[key] = outcome.problem
      continue
    }
    const operation = operationFromProblem(
      outcome.spec,
      level as "level1",
      file,
      data.commit,
      source,
    )
    const operationDigest = specDigest(operation.manifest)
    const [slugRow] = await database
      .select({ semanticDigest: schema.operations.semanticDigest })
      .from(schema.operations)
      .where(eq(schema.operations.slug, operation.slug))
    if (slugRow && slugRow.semanticDigest !== operationDigest) {
      report.ambiguities.push(
        `operation slug '${operation.slug}' already maps to ${slugRow.semanticDigest}; import proposes ${operationDigest}; needs review`,
      )
      continue
    }
    bundle.operations.push(operation)
    const family = operation.manifest.spec.family
    report.operationsByFamily[family] =
      (report.operationsByFamily[family] ?? 0) + 1
    const workload = caseFromProblem(outcome.spec, operationDigest)
    bundle.workloads.push({ manifest: workload, externalId: key })
    problems.set(key, {
      spec: outcome.spec,
      operationDigest,
      workloadDigest: specDigest(workload),
    })
  }

  const environments = new Map<
    string,
    { manifest: NonNullable<ReturnType<typeof kbEnvironment>>; digest: string }
  >()
  const implementations = new Map<string, string>()
  for (const timing of data.timings) {
    const key = `${timing.level}/${timing.file}`
    const problem = problems.get(key)
    if (!problem) {
      if (!(key in report.skipped.unparsedProblems))
        report.skipped.missingProblem++
      continue
    }
    const environmentKey = `${timing.machine}/${timing.entry.hardware}`
    let environment = environments.get(environmentKey)
    if (!environment) {
      const manifest = kbEnvironment(timing.machine, timing.entry.hardware)
      if (!manifest) {
        report.skipped.unknownHardware[environmentKey] =
          (report.skipped.unknownHardware[environmentKey] ?? 0) + 1
        continue
      }
      environment = { manifest, digest: specDigest(manifest) }
      environments.set(environmentKey, environment)
    }
    const implementationKey = `${key}/${timing.mode}`
    let implementationDigest = implementations.get(implementationKey)
    if (!implementationDigest) {
      const implementation = implementationFromMode({
        spec: problem.spec,
        modeFile: timing.mode,
        level: timing.level,
        file: timing.file,
        commit: data.commit,
        source: data.problems.get(key) ?? "",
        operationSpecDigest: problem.operationDigest,
      })
      implementationDigest = specDigest(implementation.manifest)
      implementations.set(implementationKey, implementationDigest)
      bundle.implementations.push(implementation)
    }
    bundle.runs.push(
      runFromTiming({
        timing,
        spec: problem.spec,
        observedAt: data.observedAt,
        implementationDigest,
        workloadDigest: problem.workloadDigest,
        protocol,
        protocolDigest,
        environment: environment.manifest,
        environmentDigest: environment.digest,
      }),
    )
  }

  report.proposed = await proposedObjects(database, bundle)
  const inserts = report.proposed.filter(
    (object) => object.action === "insert",
  ).length
  report.plan = `publish ${inserts} new objects (${report.proposed.length - inserts} already present) into source '${KB_SOURCE.slug}' via the idempotent publication transaction`
  return { bundle, report }
}
