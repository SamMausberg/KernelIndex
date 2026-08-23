// Reconciliation (§14.4): curated problems and ranked rows onto canonical
// identity. Per cohort (board × runner) the best submission of the top N
// distinct authors is selected, plus each leading author's personal-best
// progression chain — the "how the record fell" evidence. Names alone never
// merge identity; slug conflicts and unparseable evidence become review
// items, not overwrites.
import { eq, inArray } from "drizzle-orm"
import type { DbHandle, ImportBundle } from "../../catalog/publication.ts"
import * as schema from "../../db/schema.ts"
import { specDigest } from "../../identity/digest.ts"
import { snapshotRow } from "../fetch.ts"
import { type ProposedObject, proposedObjects } from "../report.ts"
import { cohortAuthorKey, type GmImportData } from "./discover.ts"
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
import {
  type GmCandidate,
  type GmSubmissionRow,
  GPUMODE_SOURCE,
  PARSER,
} from "./types.ts"

export type GmImportReport = {
  source: string
  parserVersion: string
  discovered: { boards: number; rows: number; snapshots: number }
  selectedSubmissions: number
  skippedSubmissions: { invalid: number }
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

export type GmReconcileOptions = {
  /** Best N distinct authors per cohort become records. */
  topPerBoard: number
  /** Leading authors per cohort whose improving chain is kept. */
  authors: number
  /** Progression steps kept per author (evenly spaced, first and best). */
  maxPerAuthor: number
}

/** Keep at most `max` entries, always including the first and the last. */
function evenlySpaced<T>(list: T[], max: number): T[] {
  if (list.length <= max) return list
  const out: T[] = []
  for (let index = 0; index < max; index++) {
    out.push(list[Math.round((index * (list.length - 1)) / (max - 1))])
  }
  return [...new Set(out)]
}

/**
 * One cohort's selection: best-per-author top N (rank order), plus each
 * leading author's strictly-improving submission chain from their fetched
 * history, capped and deduplicated by submission.
 */
function selectCohort(input: {
  ranked: GmCandidate[]
  histories: GmImportData["boards"][number]["histories"]
  runner: string
  options: GmReconcileOptions
  valid: (candidate: GmCandidate) => boolean
  report: GmImportReport
  leaderboard: string
}): GmCandidate[] {
  const { ranked, histories, runner, options, valid, report } = input
  const bestByUser: GmCandidate[] = []
  const seenUsers = new Set<string>()
  for (const candidate of ranked) {
    if (seenUsers.has(candidate.userId)) continue
    if (!valid(candidate)) {
      report.skippedSubmissions.invalid++
      continue
    }
    seenUsers.add(candidate.userId)
    bestByUser.push(candidate)
    if (bestByUser.length >= options.topPerBoard) break
  }

  const selected = new Map<number, GmCandidate>()
  for (const candidate of bestByUser) {
    selected.set(candidate.submissionId, candidate)
  }

  let progression = 0
  for (const leader of bestByUser.slice(0, options.authors)) {
    const history = histories.get(cohortAuthorKey(runner, leader.userId)) ?? []
    let best = Number.POSITIVE_INFINITY
    const chain: GmCandidate[] = []
    for (const candidate of history) {
      if (!valid(candidate) || candidate.score >= best) continue
      best = candidate.score
      chain.push(candidate)
    }
    // A truncated history may not reach the author's known best; the chain
    // must still end there so the cohort's record story is complete.
    if (leader.score < best) chain.push(leader)
    for (const candidate of evenlySpaced(chain, options.maxPerAuthor)) {
      if (!selected.has(candidate.submissionId)) {
        selected.set(candidate.submissionId, candidate)
        progression++
      }
    }
  }

  const all = [...selected.values()]
  report.cohorts.push({
    leaderboard: input.leaderboard,
    runner,
    top: bestByUser.length,
    progression,
    withCode: all.filter((c) => c.code !== null && c.code.length > 0).length,
  })
  return all
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
      boards: data.boards.length,
      rows: data.boards.reduce(
        (n, board) =>
          n +
          [...board.cohorts.values()].reduce((m, list) => m + list.length, 0),
        0,
      ),
      snapshots: data.snapshots.length,
    },
    selectedSubmissions: 0,
    skippedSubmissions: { invalid: 0 },
    cohorts: [],
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

  for (const { problem, cohorts, histories } of data.boards) {
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

    const valid = (candidate: GmCandidate): boolean => {
      if (problem.scoring === "aggregate") return true
      try {
        const raw = candidate.raw as GmSubmissionRow
        if (!raw.run_result) return false
        parseRunResult(raw.run_result)
        return true
      } catch {
        return false
      }
    }

    for (const [runner, ranked] of cohorts) {
      const selected = selectCohort({
        ranked,
        histories,
        runner,
        options,
        valid,
        report,
        leaderboard: problem.leaderboard,
      })
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
