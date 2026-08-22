// Coverage read (Week 12): per-source corpus counts and last snapshot time.
// Kernel and serving stay separate rows — they never share a comparison
// surface. Stats count *eligible* runs through the same canonical predicates
// as every ranked surface (§11.4); the raw indexed corpus (any published run,
// including failed/superseded) rides along as its own labeled number.
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm"
import type { CoveragePageModel, CoverageSource } from "@/lib/catalog-models"
import { HERO_FAMILIES, HERO_GPUS } from "@/lib/priority"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"
import { eligibleRunFilter } from "./record-events.ts"
import { eligibleServingRuns } from "./serving-reads.ts"

/* postgres.js hands raw-SQL timestamps back as strings. */
const lastFetched = sql<string | Date | null>`(
  select max(ss.fetched_at) from source_snapshots ss
  where ss.source_id = ${schema.sources.id})`

type StatsRow = {
  slug: string
  runs: number
  breadth: number
  hardware: number
}
type IndexedRow = { slug: string; indexed: number; last: string | Date | null }

/** Merge eligible stats with the broader indexed counts; the indexed query
 * sees every source with published rows, so it drives the row set. */
function toSources(
  kind: CoverageSource["kind"],
  stats: StatsRow[],
  indexed: IndexedRow[],
): CoverageSource[] {
  const bySlug = new Map(stats.map((row) => [row.slug, row]))
  return indexed
    .map((row) => {
      const eligible = bySlug.get(row.slug)
      return {
        slug: row.slug,
        kind,
        runs: eligible?.runs ?? 0,
        indexed: row.indexed,
        breadth: eligible?.breadth ?? 0,
        hardware: eligible?.hardware ?? 0,
        lastFetched: row.last ? new Date(row.last).toISOString() : null,
      }
    })
    .sort((a, b) => b.runs - a.runs || a.slug.localeCompare(b.slug))
}

export async function getCoveragePage(): Promise<CoveragePageModel> {
  const database = db()
  const [kernelStats, kernelIndexed, servingStats, servingIndexed, heroCells] =
    await Promise.all([
      database
        .select({
          slug: schema.sources.slug,
          runs: sql<number>`count(*)::int`,
          breadth: sql<number>`count(distinct ${schema.workloads.operationId})::int`,
          hardware: sql<number>`count(distinct ${schema.benchmarkRuns.hardwareModel})::int`,
        })
        .from(schema.benchmarkRuns)
        .innerJoin(
          schema.sources,
          eq(schema.benchmarkRuns.sourceId, schema.sources.id),
        )
        .innerJoin(
          schema.workloads,
          eq(schema.benchmarkRuns.workloadId, schema.workloads.id),
        )
        .where(eligibleRunFilter())
        .groupBy(schema.sources.slug),
      database
        .select({
          slug: schema.sources.slug,
          indexed: sql<number>`count(*)::int`,
          last: lastFetched,
        })
        .from(schema.benchmarkRuns)
        .innerJoin(
          schema.sources,
          eq(schema.benchmarkRuns.sourceId, schema.sources.id),
        )
        .where(isNotNull(schema.benchmarkRuns.publishedAt))
        .groupBy(schema.sources.id),
      database
        .select({
          slug: schema.sources.slug,
          runs: sql<number>`count(*)::int`,
          breadth: sql<number>`count(distinct ${schema.servingRuns.configurationId})::int`,
          hardware: sql<number>`count(distinct ${schema.servingRuns.acceleratorModel})::int`,
        })
        .from(schema.servingRuns)
        .innerJoin(
          schema.sources,
          eq(schema.servingRuns.sourceId, schema.sources.id),
        )
        .where(eligibleServingRuns())
        .groupBy(schema.sources.slug),
      database
        .select({
          slug: schema.sources.slug,
          indexed: sql<number>`count(*)::int`,
          last: lastFetched,
        })
        .from(schema.servingRuns)
        .innerJoin(
          schema.sources,
          eq(schema.servingRuns.sourceId, schema.sources.id),
        )
        .where(isNotNull(schema.servingRuns.publishedAt))
        .groupBy(schema.sources.id),
      database
        .select({
          family: schema.operations.family,
          hardwareModel: schema.benchmarkRuns.hardwareModel,
          runs: sql<number>`count(*)::int`,
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
            inArray(schema.operations.family, HERO_FAMILIES),
          ),
        )
        .groupBy(schema.operations.family, schema.benchmarkRuns.hardwareModel)
        .orderBy(desc(sql`count(*)`)),
    ])
  const heroByFamily = new Map<string, Map<string, number>>()
  for (const cell of heroCells) {
    const byGpu = heroByFamily.get(cell.family) ?? new Map()
    byGpu.set(cell.hardwareModel, Number(cell.runs))
    heroByFamily.set(cell.family, byGpu)
  }
  return {
    illustrative: false,
    sources: [
      ...toSources("kernel", kernelStats, kernelIndexed),
      ...toSources("serving", servingStats, servingIndexed),
    ],
    hero: {
      gpus: HERO_GPUS,
      rows: HERO_FAMILIES.map((family) => {
        const byGpu = heroByFamily.get(family)
        return {
          family,
          runs: HERO_GPUS.map((gpu) => byGpu?.get(gpu) ?? 0),
          total: [...(byGpu?.values() ?? [])].reduce((n, c) => n + c, 0),
        }
      }),
    },
  }
}
