// Coverage read (Week 12): per-source published-corpus counts and last
// snapshot time, one aggregate query per benchmark class. Kernel and
// serving stay separate rows — they never share a comparison surface.
import { sql } from "drizzle-orm"
import type { CoveragePageModel, CoverageSource } from "@/lib/catalog-models"
import { db } from "../db/client.ts"

/** The workloads an inference engineer asks about first, on the GPUs they
 * ask about first. Editorial priority order; a zero cell is a stated gap. */
const HERO_GPUS = ["NVIDIA H100", "NVIDIA B200"]
const HERO_FAMILIES = [
  "gqa-paged-attention",
  "gqa-ragged-attention",
  "mla-paged-attention",
  "gemm",
  "moe",
  "rmsnorm",
  "layernorm",
  "softmax",
  "rope",
  "mlp",
]

type Row = {
  slug: string
  runs: number
  breadth: number
  hardware: number
  /* postgres.js hands raw-SQL timestamps back as strings. */
  last_fetched: string | Date | null
}

const toSource = (kind: CoverageSource["kind"]) => (row: Row) => ({
  slug: row.slug,
  kind,
  runs: Number(row.runs),
  breadth: Number(row.breadth),
  hardware: Number(row.hardware),
  lastFetched: row.last_fetched
    ? new Date(row.last_fetched).toISOString()
    : null,
})

type HeroRow = { family: string; hardware_model: string; runs: number }

export async function getCoveragePage(): Promise<CoveragePageModel> {
  const [kernel, serving, heroCells] = await Promise.all([
    db().execute(sql`
      select s.slug, count(r.id)::int runs,
        count(distinct w.operation_id)::int breadth,
        count(distinct r.hardware_model)::int hardware,
        (select max(ss.fetched_at) from source_snapshots ss
          where ss.source_id = s.id) last_fetched
      from sources s
      join benchmark_runs r
        on r.source_id = s.id and r.published_at is not null
      join workloads w on w.id = r.workload_id
      group by s.id order by runs desc`) as Promise<Row[]>,
    db().execute(sql`
      select s.slug, count(r.id)::int runs,
        count(distinct r.configuration_id)::int breadth,
        count(distinct r.accelerator_model)::int hardware,
        (select max(ss.fetched_at) from source_snapshots ss
          where ss.source_id = s.id) last_fetched
      from sources s
      join serving_runs r
        on r.source_id = s.id and r.published_at is not null
      group by s.id order by runs desc`) as Promise<Row[]>,
    db().execute(sql`
      select o.family, r.hardware_model, count(*)::int runs
      from benchmark_runs r
      join workloads w on w.id = r.workload_id
      join operations o on o.id = w.operation_id
      where r.published_at is not null and r.status = 'passed'
        and r.retracted_at is null
        and o.family = any(${sql.raw(`'{${HERO_FAMILIES.join(",")}}'`)})
      group by 1, 2`) as Promise<HeroRow[]>,
  ])
  const heroByFamily = new Map<string, Map<string, number>>()
  for (const cell of heroCells) {
    const byGpu = heroByFamily.get(cell.family) ?? new Map()
    byGpu.set(cell.hardware_model, Number(cell.runs))
    heroByFamily.set(cell.family, byGpu)
  }
  return {
    illustrative: false,
    sources: [
      ...kernel.map(toSource("kernel")),
      ...serving.map(toSource("serving")),
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
