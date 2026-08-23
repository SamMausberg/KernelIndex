// Cohort grouping and ranking shared by the page readers (§11.1, §11.5):
// groupRuns splits one operation's runs into exact/compatible/reported views,
// fillCohortFacts loads the shared facts panel, and cohortRanks ranks whole
// cohorts for the dossier surfaces. Row assembly lives in run-rows.ts.
import { and, eq, inArray, isNotNull } from "drizzle-orm"
import type { CohortContext, ResultRow } from "../../lib/catalog-models.ts"
import { implementationDisplayName } from "../../lib/names.ts"
import type { SearchIntent } from "../../lib/search-query.ts"
import type { OperationSpecManifest } from "../../schemas/kinds.ts"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"
import { RANKING_POLICY_VERSION, rankCohort } from "../policy/ranking.ts"
import {
  intentMismatches,
  type MatchTarget,
  workloadMismatches,
} from "./match.ts"
import {
  type AnyWorkloadManifest,
  runEvidence,
  type StoredRunManifest,
  workloadLabel,
} from "./present.ts"
import { eligibleRunFilter } from "./record-events.ts"
import {
  type JoinedRun,
  type OperationJoinedRun,
  primaryOf,
  rankInputOf,
  resultRow,
} from "./run-rows.ts"

/** Dtypes declared by the operation's tensor arguments (suite fallback). */
export function operationDtypes(manifest: OperationSpecManifest): string[] {
  return [
    ...new Set(
      [...manifest.spec.inputs, ...manifest.spec.outputs]
        .map((argument) => argument.tensor?.dtype)
        .filter((dtype): dtype is string => dtype !== undefined),
    ),
  ]
}

/** The matchable facts of one run (§12.5), with the operation's declared
 * dtypes standing in when the workload row carries none. */
export function matchTarget(
  j: OperationJoinedRun,
  manifestById: Map<string, AnyWorkloadManifest>,
  opDtypes: string[],
): MatchTarget {
  return {
    hardwareModel: j.run.hardwareModel,
    hardwareArchitecture: j.run.hardwareArchitecture,
    cudaMajor: j.run.cudaMajor,
    framework: j.implementation.framework,
    language: j.implementation.language,
    workload: manifestById.get(j.workload.id) as AnyWorkloadManifest,
    workloadDtypes: j.workload.dtypes.length > 0 ? j.workload.dtypes : opDtypes,
    workloadLayouts: j.workload.layoutKeys,
  }
}

/**
 * Group one operation's runs for a selected workload (§16.6, §11.1): the
 * largest same-key comparison cohort is the candidate table; requests that
 * every intent facet matches rank under ranking-v1, facet-mismatched runs
 * become compatible evidence with an explicit mismatch vector, same-workload
 * runs under another cohort stay separate, and other workloads' runs are
 * compatible with their differences enumerated.
 */
export function groupRuns(
  joined: OperationJoinedRun[],
  operation: { name: string; slug: string },
  operationManifest: OperationSpecManifest,
  /** Workload manifests keyed by workload id — loaded once per operation. */
  manifestById: Map<string, AnyWorkloadManifest>,
  selectedWorkloadId: string,
  intent: SearchIntent,
  preferredCohortKey?: string,
) {
  const selected = joined.filter((j) => j.workload.id === selectedWorkloadId)
  const byCohort = new Map<string, OperationJoinedRun[]>()
  for (const j of selected) {
    const bucket = byCohort.get(j.run.comparisonKey)
    if (bucket) bucket.push(j)
    else byCohort.set(j.run.comparisonKey, [j])
  }
  const rankedCohorts = [...byCohort.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  )
  // One selectable option per measured environment cohort, each stating its
  // fastest rankable run (rows arrive fastest first); equal hardware labels
  // (distinct runner fleets) get a human ordinal — the cohort facts panel
  // states what actually differs, never a leaked digest fragment.
  const cohortOptions = rankedCohorts.map(([key, list]) => {
    const head = list.find((j) => j.run.primaryValue !== null)
    const primary = head ? primaryOf(head.run) : null
    return {
      key,
      label: list[0].run.hardwareModel,
      runs: list.length,
      head:
        head && primary
          ? {
              runId: head.run.id,
              implementation: {
                name: implementationDisplayName(
                  head.implementation.title ?? undefined,
                  operation,
                  head.implementation.slug,
                ),
                slug: head.implementation.slug,
              },
              primary,
            }
          : null,
    }
  })
  const labelCounts = new Map<string, number>()
  for (const option of cohortOptions) {
    labelCounts.set(option.label, (labelCounts.get(option.label) ?? 0) + 1)
  }
  const labelOrdinals = new Map<string, number>()
  for (const option of cohortOptions) {
    if ((labelCounts.get(option.label) ?? 0) > 1) {
      const ordinal = (labelOrdinals.get(option.label) ?? 0) + 1
      labelOrdinals.set(option.label, ordinal)
      option.label = `${option.label} · env ${ordinal}`
    }
  }
  const primaryCohort =
    (preferredCohortKey !== undefined
      ? byCohort.get(preferredCohortKey)
      : undefined) ??
    rankedCohorts[0]?.[1] ??
    []
  const cohortKey = primaryCohort[0]?.run.comparisonKey ?? null
  const selectedManifest = manifestById.get(selectedWorkloadId)

  const opDtypes = operationDtypes(operationManifest)
  const target = (j: OperationJoinedRun) =>
    matchTarget(j, manifestById, opDtypes)

  const compatible: ResultRow[] = []
  const rankable: OperationJoinedRun[] = []
  const unrankable: OperationJoinedRun[] = []
  for (const j of primaryCohort) {
    const mismatches = intentMismatches(intent, target(j))
    if (mismatches.length > 0) {
      compatible.push(
        resultRow(j, operation, { match: "compatible", mismatches }),
      )
    } else if (j.run.primaryValue !== null) {
      rankable.push(j)
    } else {
      unrankable.push(j)
    }
  }

  const sourceNative = primaryCohort.some((j) => j.run.sourceNative)
  const profile = sourceNative
    ? ("source_native" as const)
    : ("strict_exact" as const)
  const byId = new Map(rankable.map((j) => [j.run.id, j]))
  const exact = rankCohort(rankable.map(rankInputOf), profile).map((entry) =>
    resultRow(byId.get(entry.id) as OperationJoinedRun, operation, {
      rank: entry.rank,
      tiedWithPrevious: entry.tiedWithPrevious,
      cohortSize: rankable.length,
    }),
  )
  exact.push(
    ...unrankable.map((j) =>
      resultRow(j, operation, {
        caveats: ["No primary measurement; unranked (MISSING_PRIMARY_METRIC)"],
      }),
    ),
  )

  const reported = selected
    .filter((j) => j.run.comparisonKey !== cohortKey)
    .map((j) => {
      const mismatches = intentMismatches(intent, target(j))
      return resultRow(j, operation, {
        match: mismatches.length > 0 ? "compatible" : "exact",
        mismatches,
        caveats: [
          "Different comparison cohort: protocol or environment differs",
        ],
      })
    })

  for (const j of joined) {
    if (j.workload.id === selectedWorkloadId) continue
    const merged = intentMismatches(intent, target(j))
    const workloadManifest = manifestById.get(j.workload.id)
    if (selectedManifest && workloadManifest) {
      for (const mismatch of workloadMismatches(
        selectedManifest,
        workloadManifest,
      )) {
        if (!merged.some((entry) => entry.field === mismatch.field))
          merged.push(mismatch)
      }
    }
    compatible.push(
      resultRow(j, operation, { match: "compatible", mismatches: merged }),
    )
  }

  const cohort: CohortContext | null = cohortKey
    ? {
        comparisonKey: cohortKey,
        profile,
        description: sourceNative
          ? `Measured by the source's own harness. Ranked by its metric under ${RANKING_POLICY_VERSION}.`
          : `Same workload, protocol, and environment throughout. Ranked by latency under ${RANKING_POLICY_VERSION}; runs too close to call share a rank.`,
        facts: [],
      }
    : null

  const headRunId =
    (primaryCohort[0] ?? selected[0] ?? joined[0])?.run.id ?? null
  return { exact, reported, compatible, cohort, cohortOptions, headRunId }
}

/**
 * Facts every row in the cohort shares (§16.6) — rendered once, not per row.
 * The protocol/environment details live only in the manifest, so this loads
 * exactly one run's JSONB after grouping instead of shipping it per row.
 */
export async function fillCohortFacts(groups: {
  cohort: CohortContext | null
  headRunId: string | null
}): Promise<void> {
  if (!groups.cohort || groups.headRunId === null) return
  const [joined] = await db()
    .select({
      manifest: schema.benchmarkRuns.manifest,
      workloadManifest: schema.workloads.manifest,
      dtypes: schema.workloads.dtypes,
    })
    .from(schema.benchmarkRuns)
    .innerJoin(
      schema.workloads,
      eq(schema.benchmarkRuns.workloadId, schema.workloads.id),
    )
    .where(eq(schema.benchmarkRuns.id, groups.headRunId))
  if (!joined) return
  const stored = joined.manifest as StoredRunManifest
  const { hardware, software } = stored.environment.spec
  const measurement = stored.protocol.spec.measurement
  const framework = software.framework
    ? `${software.framework.name} ${software.framework.version}`
    : null
  // A source that never declared its statistic renders as the harness alone,
  // not the word "unspecified" presented as if it were one.
  const statistic =
    measurement.primaryStatistic === "unspecified"
      ? null
      : measurement.primaryStatistic
  const protocol = [
    `${stored.protocol.spec.harness.name}${stored.protocol.spec.harness.version ? ` ${stored.protocol.spec.harness.version}` : ""}`,
    statistic && measurement.samples
      ? `${statistic} of ${measurement.samples}`
      : statistic,
    measurement.compileIncluded === false ? "compile excluded" : null,
  ]
    .filter(Boolean)
    .join(" · ")
  const entries: [string, string | null | undefined][] = [
    ["GPU", hardware.product],
    [
      "Workload",
      workloadLabel(
        joined.workloadManifest as AnyWorkloadManifest,
        joined.dtypes,
      ),
    ],
    ["CUDA", software.cudaToolkit],
    ["Driver", software.driver],
    ["Framework", framework],
    ["Protocol", protocol],
  ]
  groups.cohort.facts = entries
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => ({ key, value }))
}

/** Pick the workload with the most runs as the default selection. */
export function defaultWorkloadId(
  joined: JoinedRun[],
  workloadIds: string[],
): string | null {
  const countById = new Map<string, number>()
  for (const j of joined)
    countById.set(j.workload.id, (countById.get(j.workload.id) ?? 0) + 1)
  const best = [...countById.entries()].sort((a, b) => b[1] - a[1])[0]
  return best?.[0] ?? workloadIds[0] ?? null
}

/**
 * ranking-v1 over whole cohorts (§11.5): rank, tie, and cohort size for every
 * eligible run in the given comparison cohorts, plus each cohort's #1. One
 * lean query however many keys — the run dossier asks for one, the
 * implementation page for every cohort its revision appears in.
 */
export async function cohortRanks(comparisonKeys: string[]) {
  const byRun = new Map<
    string,
    Pick<ResultRow, "rank" | "tiedWithPrevious" | "cohortSize">
  >()
  const headByCohort = new Map<string, string>()
  if (comparisonKeys.length === 0) return { byRun, headByCohort }
  const rows = await db()
    .select({
      id: schema.benchmarkRuns.id,
      comparisonKey: schema.benchmarkRuns.comparisonKey,
      primaryValue: schema.benchmarkRuns.primaryValue,
      uncertaintyLow: schema.benchmarkRuns.uncertaintyLow,
      uncertaintyHigh: schema.benchmarkRuns.uncertaintyHigh,
      observedAt: schema.benchmarkRuns.observedAt,
      sourceNative: schema.benchmarkRuns.sourceNative,
      reproducedByKernelindex: schema.benchmarkRuns.reproducedByKernelindex,
      independentReplicationCount:
        schema.benchmarkRuns.independentReplicationCount,
      sourceAvailable: schema.benchmarkRuns.sourceAvailable,
      installable: schema.benchmarkRuns.installable,
      hasRawEvidence: schema.benchmarkRuns.hasRawEvidence,
    })
    .from(schema.benchmarkRuns)
    .where(
      and(
        inArray(schema.benchmarkRuns.comparisonKey, comparisonKeys),
        eligibleRunFilter(),
        isNotNull(schema.benchmarkRuns.primaryValue),
      ),
    )
  const byCohort = new Map<string, typeof rows>()
  for (const row of rows) {
    const bucket = byCohort.get(row.comparisonKey)
    if (bucket) bucket.push(row)
    else byCohort.set(row.comparisonKey, [row])
  }
  for (const [key, cohort] of byCohort) {
    const ranked = rankCohort(
      cohort.map((row) => ({
        id: row.id,
        value: row.primaryValue as number,
        interval:
          row.uncertaintyLow !== null && row.uncertaintyHigh !== null
            ? { low: row.uncertaintyLow, high: row.uncertaintyHigh }
            : null,
        evidence: runEvidence(row),
        observedAt: row.observedAt,
      })),
      cohort.some((row) => row.sourceNative) ? "source_native" : "strict_exact",
    )
    for (const entry of ranked)
      byRun.set(entry.id, {
        rank: entry.rank,
        tiedWithPrevious: entry.tiedWithPrevious,
        cohortSize: ranked.length,
      })
    headByCohort.set(key, ranked[0].id)
  }
  return { byRun, headByCohort }
}
