// Reconciliation (§14.4): the selected candidates of each curated board onto
// canonical identity. Which submissions those are is discovery's decision
// (select.ts), because the source column is only worth fetching for rows that
// survive it; this module maps what came back. Names alone never merge
// identity; slug conflicts and unparseable evidence become review items, not
// overwrites.
import { eq, inArray } from "drizzle-orm"
import type { DbHandle, ImportBundle } from "../../catalog/publication.ts"
import * as schema from "../../db/schema.ts"
import { specDigest } from "../../identity/digest.ts"
import { snapshotRow } from "../fetch.ts"
import { type ProposedObject, proposedObjects } from "../report.ts"
import type { GmImportData } from "./discover.ts"
import {
  aggregateRunFromRow,
  benchmarkKey,
  caseFromBenchmark,
  implementationFromRow,
  kernelbotEnvironment,
  kernelbotProtocol,
  kernelbotRankedProtocol,
  operationFromProblem,
  projectForUser,
  runFromBenchmark,
  suiteFromProblem,
} from "./normalize.ts"
import { parseRunResult } from "./parse.ts"
import { type GmSubmissionRow, GPUMODE_SOURCE, PARSER } from "./types.ts"

export type GmImportReport = {
  source: string
  parserVersion: string
  discovered: { boards: number; rows: number; snapshots: number }
  selectedSubmissions: number
  skippedSubmissions: { invalid: number; deferred: number }
  /** Selection counts per board × runner cohort (dry-run tuning input). */
  cohorts: {
    leaderboard: string
    runner: string
    top: number
    progression: number
    withCode: number
  }[]
  code: { submissionsWithCode: number; uniqueBlobs: number; totalBytes: number }
  operationsByFamily: Record<string, number>
  proposed: ProposedObject[]
  ambiguities: string[]
  issues: { locator: string; item: string; problem: string }[]
  driftWarnings: string[]
  licenseWarnings: string[]
  plan: string
}

export async function reconcileKernelbot(
  database: DbHandle,
  data: GmImportData,
): Promise<{ bundle: ImportBundle; report: GmImportReport }> {
  const report: GmImportReport = {
    source: GPUMODE_SOURCE.slug,
    parserVersion: PARSER.version,
    discovered: {
      boards: data.boards.length,
      rows: data.discoveredRows,
      snapshots: data.snapshots.length,
    },
    selectedSubmissions: 0,
    skippedSubmissions: {
      invalid: data.invalidRows,
      deferred: data.deferredRows,
    },
    cohorts: data.cohorts,
    code: { submissionsWithCode: 0, uniqueBlobs: 0, totalBytes: 0 },
    operationsByFamily: {},
    proposed: [],
    ambiguities: [],
    issues: [...data.issues],
    driftWarnings: [...data.driftWarnings],
    licenseWarnings: [],
    plan: "",
  }
  const bundle: ImportBundle = {
    source: { ...GPUMODE_SOURCE },
    snapshots: data.snapshots.map((snapshot) => snapshotRow(snapshot, PARSER)),
    projects: [],
    operations: [],
    workloads: [],
    implementations: [],
    runs: [],
  }

  const perShapeProtocol = kernelbotProtocol()
  const perShapeProtocolDigest = specDigest(perShapeProtocol)
  const rankedProtocolByStatistic = new Map<
    string,
    { manifest: ReturnType<typeof kernelbotRankedProtocol>; digest: string }
  >()
  const seenProjects = new Set<string>()
  const codeDigests = new Set<string>()

  for (const { problem, cohorts } of data.boards) {
    const operation = operationFromProblem(problem)
    const operationDigest = specDigest(operation.manifest)
    bundle.operations.push(operation)
    report.operationsByFamily[problem.family] =
      (report.operationsByFamily[problem.family] ?? 0) + 1
    const [slugRow] = await database
      .select({ semanticDigest: schema.operations.semanticDigest })
      .from(schema.operations)
      .where(eq(schema.operations.slug, operation.slug))
    if (slugRow && slugRow.semanticDigest !== operationDigest) {
      report.ambiguities.push(
        `operation slug '${operation.slug}' already maps to ${slugRow.semanticDigest}; import proposes ${operationDigest}; needs review`,
      )
    }

    // Aggregate boards share one suite workload and one ranked protocol.
    let suiteDigest: string | null = null
    let rankedProtocol: {
      manifest: ReturnType<typeof kernelbotRankedProtocol>
      digest: string
    } | null = null
    if (problem.scoring === "aggregate") {
      const suite = suiteFromProblem(problem, operationDigest)
      suiteDigest = specDigest(suite)
      bundle.workloads.push({
        manifest: suite,
        externalId: `${problem.leaderboard}/suite`,
      })
      const statistic = problem.suite?.statistic ?? "unspecified"
      rankedProtocol = rankedProtocolByStatistic.get(statistic) ?? null
      if (!rankedProtocol) {
        const manifest = kernelbotRankedProtocol(statistic)
        rankedProtocol = { manifest, digest: specDigest(manifest) }
        rankedProtocolByStatistic.set(statistic, rankedProtocol)
      }
    }

    const caseDigestByKey = new Map<string, string>()
    const environmentByGpu = new Map<
      string,
      { manifest: ReturnType<typeof kernelbotEnvironment>; digest: string }
    >()
    const environmentFor = (gpuName: string) => {
      let environment = environmentByGpu.get(gpuName)
      if (!environment) {
        // Flat boards' runner label is the fleet; it keeps distinct runner
        // pools in distinct cohorts even on identical GPU products.
        const manifest = kernelbotEnvironment(
          gpuName,
          problem.scoring === "aggregate" ? gpuName : undefined,
        )
        environment = { manifest, digest: specDigest(manifest) }
        environmentByGpu.set(gpuName, environment)
      }
      return environment
    }

    for (const selected of cohorts.values()) {
      report.selectedSubmissions += selected.length

      for (const candidate of selected) {
        const environment = environmentFor(candidate.runner)
        const implementation = implementationFromRow(
          candidate,
          problem,
          operationDigest,
        )
        const implementationDigest = specDigest(implementation.manifest)
        if (!seenProjects.has(implementation.projectSlug)) {
          seenProjects.add(implementation.projectSlug)
          const rawName = (candidate.raw as { user_name?: unknown }).user_name
          const project = projectForUser(
            candidate.userId,
            typeof rawName === "string" ? rawName : null,
          )
          bundle.projects.push({
            manifest: project.manifest,
            slug: project.slug,
          })
        }
        bundle.implementations.push(implementation)
        const source = implementation.manifest.spec.source
        if (source) {
          report.code.submissionsWithCode++
          if (!codeDigests.has(source.contentDigest)) {
            codeDigests.add(source.contentDigest)
            report.code.uniqueBlobs++
            report.code.totalBytes += source.sizeBytes ?? 0
          }
        }

        if (problem.scoring === "aggregate") {
          bundle.runs.push(
            aggregateRunFromRow({
              candidate,
              problem,
              implementationDigest,
              workloadDigest: suiteDigest as string,
              protocol: (rankedProtocol as NonNullable<typeof rankedProtocol>)
                .manifest,
              protocolDigest: (
                rankedProtocol as NonNullable<typeof rankedProtocol>
              ).digest,
              environment: environment.manifest,
              environmentDigest: environment.digest,
            }),
          )
          continue
        }

        const row = candidate.raw as GmSubmissionRow
        for (const benchmark of parseRunResult(
          row.run_result as Record<string, unknown>,
        )) {
          try {
            const key = benchmarkKey(benchmark.axes)
            let caseDigest = caseDigestByKey.get(key)
            if (!caseDigest) {
              const manifest = caseFromBenchmark(
                problem,
                operationDigest,
                benchmark.axes,
              )
              caseDigest = specDigest(manifest)
              caseDigestByKey.set(key, caseDigest)
              bundle.workloads.push({
                manifest,
                externalId: `${problem.leaderboard}/${key}`,
              })
            }
            bundle.runs.push(
              runFromBenchmark({
                row,
                problem,
                benchmark,
                implementationDigest,
                workloadDigest: caseDigest,
                protocol: perShapeProtocol,
                protocolDigest: perShapeProtocolDigest,
                environment: environment.manifest,
                environmentDigest: environment.digest,
              }),
            )
          } catch (error) {
            report.issues.push({
              locator: "normalize",
              item: `submission/${candidate.submissionId}/benchmark/${benchmark.index}`,
              problem: (error as Error).message,
            })
          }
        }
      }
    }
    if (report.code.submissionsWithCode > 0) {
      report.licenseWarnings.push(
        `${problem.leaderboard}: mirrored submission code carries no per-submission license; displayed under ${GPUMODE_SOURCE.policy.license} with attribution, records stay reported-only`,
      )
    }
  }
  report.licenseWarnings = [...new Set(report.licenseWarnings)]

  // Implementation slugs are page identity: a slug already mapping to a
  // different digest means the newer row will shadow the older page (§14.4).
  const implementationSlugs = bundle.implementations.map((entry) => entry.slug)
  if (implementationSlugs.length > 0) {
    const existing = await database
      .select({
        slug: schema.implementations.slug,
        implementationDigest: schema.implementations.implementationDigest,
      })
      .from(schema.implementations)
      .where(inArray(schema.implementations.slug, implementationSlugs))
    const proposedBySlug = new Map(
      bundle.implementations.map((entry) => [
        entry.slug,
        specDigest(entry.manifest),
      ]),
    )
    for (const row of existing) {
      const proposed = proposedBySlug.get(row.slug)
      if (proposed !== undefined && proposed !== row.implementationDigest) {
        report.ambiguities.push(
          `implementation slug '${row.slug}' already maps to ${row.implementationDigest}; import proposes ${proposed}; the newer row will shadow the older page`,
        )
      }
    }
  }

  report.proposed = await proposedObjects(database, bundle)
  const inserts = report.proposed.filter(
    (object) => object.action === "insert",
  ).length
  report.plan = `publish ${inserts} new objects (${report.proposed.length - inserts} already present) into source '${GPUMODE_SOURCE.slug}' via the idempotent publication transaction`
  return { bundle, report }
}

/**
 * One report for a windowed run: each board publishes in its own transaction,
 * so the reports it produced are folded back into the single document the
 * import gate and the operator read.
 */
export function mergeGmReports(reports: GmImportReport[]): GmImportReport {
  const merged = reports[0]
  if (!merged) throw new Error("no reports to merge")
  for (const report of reports.slice(1)) {
    merged.discovered.boards += report.discovered.boards
    merged.selectedSubmissions += report.selectedSubmissions
    merged.cohorts.push(...report.cohorts)
    merged.code.submissionsWithCode += report.code.submissionsWithCode
    merged.code.uniqueBlobs += report.code.uniqueBlobs
    merged.code.totalBytes += report.code.totalBytes
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
