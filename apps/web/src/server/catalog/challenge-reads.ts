// Challenges (§2.3 coverage-gap discovery): the board of what the index has
// no good answer for yet, derived on read from facts it already states —
// priority cells with zero runs, model-tagged operations missing a priority
// GPU, unbeaten source baselines, single-entry and stale records — plus the
// structured requests readers record on the no-answer search states. Never
// a ranking across cohorts; every row points at the cohort or search where
// the answer would go.
import { and, count, desc, eq, gte, sql } from "drizzle-orm"
import type { Challenge, ChallengesModel } from "@/lib/catalog-models"
import { humanizeOperationName } from "@/lib/names"
import { HERO_GPUS } from "@/lib/priority"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"
import { getCoveragePage } from "./coverage-reads.ts"
import { getRecordsPage } from "./home-reads.ts"
import { eligibleRunFilter } from "./record-events.ts"

const PER_KIND_CAP = 60
const short = (gpu: string) => gpu.replace("NVIDIA ", "")

/** Priority family × GPU cells with zero eligible runs. */
async function priorityGaps(): Promise<Challenge[]> {
  const { hero } = await getCoveragePage()
  return hero.rows.flatMap((row) =>
    row.runs.flatMap((runs, index) =>
      runs > 0
        ? []
        : [
            {
              kind: "gap" as const,
              operation: null,
              family: row.family,
              hardware: hero.gpus[index],
              detail: `no eligible run for the ${row.family} family`,
              since: null,
              count: 0,
              href: `/search?q=${encodeURIComponent(`${row.family} ${short(hero.gpus[index])}`)}`,
            },
          ],
    ),
  )
}

/** Model-tagged operations measured on some priority GPU but not another. */
async function modelGaps(): Promise<Challenge[]> {
  const rows = await db()
    .select({
      name: schema.operations.name,
      slug: schema.operations.slug,
      family: schema.operations.family,
      tags: schema.operations.tags,
      hardware: sql<
        string[]
      >`array_agg(distinct ${schema.benchmarkRuns.hardwareModel})`,
    })
    .from(schema.benchmarkRuns)
    .innerJoin(
      schema.workloads,
      eq(schema.benchmarkRuns.workloadId, schema.workloads.id),
    )
    .innerJoin(
      schema.operations,
      eq(schema.workloads.operationId, schema.operations.id),
    )
    .where(
      and(
        eligibleRunFilter(),
        sql`exists (select 1 from unnest(${schema.operations.tags}) t where t like 'model:%')`,
      ),
    )
    .groupBy(schema.operations.id)
    .orderBy(schema.operations.family, schema.operations.name)
  const gaps: Challenge[] = []
  for (const row of rows) {
    const measured = HERO_GPUS.filter((gpu) =>
      row.hardware.some((model) => model.includes(gpu)),
    )
    for (const gpu of HERO_GPUS) {
      if (measured.includes(gpu) || measured.length === 0) continue
      gaps.push({
        kind: "model_gap",
        operation: { name: humanizeOperationName(row.name), slug: row.slug },
        family: row.family,
        hardware: gpu,
        detail: `${row.tags
          .filter((tag) => tag.startsWith("model:"))
          .slice(0, 3)
          .map((tag) => tag.slice(6))
          .join(", ")} · measured on ${measured.map(short).join(", ")} only`,
        since: null,
        count: 0,
        href: `/operations/${row.slug}`,
      })
    }
  }
  return gaps.slice(0, PER_KIND_CAP)
}

/** Record-derived challenges from the memoized ledger: unbeaten source
 * baselines, cohorts with a single entry, and records not re-observed. */
async function recordChallenges(): Promise<Challenge[]> {
  const [{ records }, sizes] = await Promise.all([
    getRecordsPage(),
    db()
      .select({ key: schema.benchmarkRuns.comparisonKey, n: count() })
      .from(schema.benchmarkRuns)
      .where(eligibleRunFilter())
      .groupBy(schema.benchmarkRuns.comparisonKey),
  ])
  const sizeOf = new Map(sizes.map((row) => [row.key, row.n]))
  const cohortHref = (holder: (typeof records)[number]) =>
    `/operations/${holder.operation.slug}?workload=${holder.workloadId}&cohort=${encodeURIComponent(holder.cohortKey)}`
  const out: Record<
    "unbeaten_baseline" | "unchallenged" | "stale",
    Challenge[]
  > = { unbeaten_baseline: [], unchallenged: [], stale: [] }
  for (const holder of records) {
    const base = {
      operation: holder.operation,
      family: null,
      hardware: holder.hardware,
      since: holder.since,
      count: 0,
      href: cohortHref(holder),
    }
    const size = sizeOf.get(holder.cohortKey) ?? 0
    if (holder.current.baseline && holder.history.length === 1)
      out.unbeaten_baseline.push({
        ...base,
        kind: "unbeaten_baseline",
        detail: `${holder.workloadSummary} · ${holder.current.implementation.name} is the source baseline and nobody has beaten it`,
      })
    else if (size === 1 && !holder.current.baseline)
      out.unchallenged.push({
        ...base,
        kind: "unchallenged",
        detail: `${holder.workloadSummary} · ${holder.current.implementation.name} is the only entry`,
      })
    if (holder.current.stale)
      out.stale.push({
        ...base,
        kind: "stale",
        since: holder.current.lastTestedAt,
        detail: `${holder.workloadSummary} · ${holder.current.implementation.name} last observed ${(holder.current.lastTestedAt ?? "").slice(0, 10)}`,
      })
  }
  const newest = (a: Challenge, b: Challenge) =>
    (b.since ?? "").localeCompare(a.since ?? "")
  return [
    ...out.unbeaten_baseline.sort(newest).slice(0, PER_KIND_CAP),
    ...out.unchallenged.sort(newest).slice(0, PER_KIND_CAP),
    ...out.stale.sort(newest).slice(0, PER_KIND_CAP),
  ]
}

/** Coarse request facets (§20.5): never query text. */
export type RequestFacets = {
  operation?: string
  family?: string
  gpu?: string
  dtype?: string
  /** Axis bindings bucketed to the nearest power of two. */
  axes?: Record<string, number>
}

/** The search query that would answer a request, from its coarse facets. */
export function requestQuery(facets: RequestFacets): string {
  return [
    facets.operation ? `op:${facets.operation}` : facets.family,
    facets.gpu ? `gpu:${facets.gpu}` : null,
    facets.dtype ? `dtype:${facets.dtype}` : null,
    ...Object.entries(facets.axes ?? {}).map(
      ([axis, value]) => `${axis}=${value}`,
    ),
  ]
    .filter(Boolean)
    .join(" ")
}

/** Requests recorded on the no-answer states, grouped by identical facets. */
async function requested(): Promise<Challenge[]> {
  const rows = await db()
    .select({ facets: schema.productEvents.facets, n: count() })
    .from(schema.productEvents)
    .where(
      and(
        eq(schema.productEvents.event, "workload_requested"),
        gte(schema.productEvents.at, sql`now() - interval '90 days'`),
      ),
    )
    .groupBy(schema.productEvents.facets)
    .orderBy(desc(count()))
    .limit(PER_KIND_CAP)
  return rows.flatMap((row) => {
    const facets = (row.facets ?? {}) as RequestFacets
    if (!facets.operation && !facets.family) return []
    return [
      {
        kind: "requested" as const,
        operation: facets.operation
          ? {
              name: humanizeOperationName(facets.operation),
              slug: facets.operation,
            }
          : null,
        family: facets.family ?? null,
        hardware: facets.gpu ?? null,
        detail: [
          facets.dtype,
          ...Object.entries(facets.axes ?? {}).map(
            ([axis, value]) => `${axis} ≈ ${value}`,
          ),
        ]
          .filter(Boolean)
          .join(" · "),
        since: null,
        count: row.n,
        href: `/search?q=${encodeURIComponent(requestQuery(facets))}`,
      },
    ]
  })
}

export async function getChallenges(): Promise<ChallengesModel> {
  const [asks, gaps, models, records] = await Promise.all([
    requested(),
    priorityGaps(),
    modelGaps(),
    recordChallenges(),
  ])
  const [{ illustrative }] = await db()
    .select({
      illustrative: sql<boolean>`bool_and(${schema.sources.kind} = 'illustrative')`,
    })
    .from(schema.sources)
  return {
    illustrative: illustrative === true,
    challenges: [...asks, ...gaps, ...models, ...records],
  }
}
