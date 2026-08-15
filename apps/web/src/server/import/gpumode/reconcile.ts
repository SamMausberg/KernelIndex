// Reconciliation (§14.4): curated problems and ranked rows onto canonical
// identity, keeping the top N distinct users per leaderboard. Names alone
// never merge identity; slug conflicts and unparseable evidence become
// review items, not overwrites.
import { eq } from "drizzle-orm"
import type { DbHandle, ImportBundle } from "../../catalog/publication.ts"
import * as schema from "../../db/schema.ts"
import { specDigest } from "../../identity/digest.ts"
import { snapshotRow } from "../fetch.ts"
import { type ProposedObject, proposedObjects } from "../report.ts"
import type { GmImportData } from "./discover.ts"
import {
  benchmarkKey,
  caseFromBenchmark,
  implementationFromRow,
  kernelbotEnvironment,
  kernelbotProtocol,
  operationFromProblem,
  projectForUser,
  runFromBenchmark,
} from "./normalize.ts"
import { parseRunResult } from "./parse.ts"
import {
  type GmBenchmark,
  type GmSubmissionRow,
  GPUMODE_SOURCE,
  PARSER,
} from "./types.ts"

export type GmImportReport = {
  source: string
  parserVersion: string
  discovered: { leaderboards: number; rows: number; snapshots: number }
  selectedSubmissions: number
  skippedSubmissions: { duplicateUser: number; invalid: number }
  operationsByFamily: Record<string, number>
  proposed: ProposedObject[]
  ambiguities: string[]
  issues: { locator: string; item: string; problem: string }[]
  driftWarnings: string[]
  licenseWarnings: string[]
  plan: string
}

export type GmReconcileOptions = {
  /** Best N distinct users per leaderboard become records. */
  topPerBoard: number
}

/**
 * Best submission per user, best score first, capped at N users. The
 * per-shape benchmarks parse here: some passed rows carry a null or partial
 * run_result, and such a row must not consume a top-N user slot it cannot
 * fill with evidence.
 */
function selectRows(
  all: GmSubmissionRow[],
  options: GmReconcileOptions,
  report: GmImportReport,
): { row: GmSubmissionRow; benchmarks: GmBenchmark[] }[] {
  const seenUsers = new Set<string>()
  const selected: { row: GmSubmissionRow; benchmarks: GmBenchmark[] }[] = []
  for (const row of all) {
    let benchmarks: GmBenchmark[]
    try {
      if (
        row.run_passed !== true ||
        row.run_mode !== "leaderboard" ||
        typeof row.run_score !== "number" ||
        row.run_score <= 0 ||
        !row.run_result
      ) {
        throw new Error("not a scored leaderboard result")
      }
      benchmarks = parseRunResult(row.run_result)
    } catch {
      report.skippedSubmissions.invalid++
      continue
    }
    const user = String(row.user_id)
    if (seenUsers.has(user)) {
      report.skippedSubmissions.duplicateUser++
      continue
    }
    seenUsers.add(user)
    selected.push({ row, benchmarks })
    if (selected.length >= options.topPerBoard) break
  }
  return selected
}

export async function reconcileKernelbot(
  database: DbHandle,
  data: GmImportData,
  options: GmReconcileOptions,
): Promise<{ bundle: ImportBundle; report: GmImportReport }> {
  const report: GmImportReport = {
    source: GPUMODE_SOURCE.slug,
    parserVersion: PARSER.version,
    discovered: {
      leaderboards: data.problems.length,
      rows: [...data.rows.values()].reduce((n, list) => n + list.length, 0),
      snapshots: data.snapshots.length,
    },
    selectedSubmissions: 0,
    skippedSubmissions: { duplicateUser: 0, invalid: 0 },
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

  const protocol = kernelbotProtocol()
  const protocolDigest = specDigest(protocol)
  const seenProjects = new Set<string>()

  for (const { problem, board } of data.problems) {
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
        `operation slug '${operation.slug}' already maps to ${slugRow.semanticDigest}; import proposes ${operationDigest} — needs review`,
      )
    }

    const caseDigestByKey = new Map<string, string>()
    const environmentByGpu = new Map<
      string,
      { manifest: ReturnType<typeof kernelbotEnvironment>; digest: string }
    >()

    const selected = selectRows(
      data.rows.get(problem.leaderboard) ?? [],
      options,
      report,
    )
    report.selectedSubmissions += selected.length
    for (const { row, benchmarks } of selected) {
      // The runner's own system report names the exact product; the board
      // label ("MI300") is only a fallback class.
      const gpuName =
        row.run_system_info?.gpu ?? (board.gpu_types ?? [])[0] ?? "unknown"
      let environment = environmentByGpu.get(gpuName)
      if (!environment) {
        const manifest = kernelbotEnvironment(gpuName)
        environment = { manifest, digest: specDigest(manifest) }
        environmentByGpu.set(gpuName, environment)
      }
      const implementation = implementationFromRow(
        row,
        problem,
        operationDigest,
        gpuName,
      )
      const implementationDigest = specDigest(implementation.manifest)
      if (!seenProjects.has(implementation.projectSlug)) {
        seenProjects.add(implementation.projectSlug)
        const project = projectForUser(row.user_id)
        bundle.projects.push({ manifest: project.manifest, slug: project.slug })
      }
      bundle.implementations.push(implementation)
      report.licenseWarnings.push(
        `submission ${row.submission_id}: code published in the KernelBot dataset without a per-submission license; record is reported-only`,
      )
      for (const benchmark of benchmarks) {
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
              protocol,
              protocolDigest,
              environment: environment.manifest,
              environmentDigest: environment.digest,
            }),
          )
        } catch (error) {
          report.issues.push({
            locator: "normalize",
            item: `submission/${row.submission_id}/benchmark/${benchmark.index}`,
            problem: (error as Error).message,
          })
        }
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
