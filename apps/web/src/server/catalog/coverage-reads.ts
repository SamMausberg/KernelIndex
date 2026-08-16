// Coverage read (Week 12): per-source published-corpus counts and last
// snapshot time, one aggregate query per benchmark class. Kernel and
// serving stay separate rows — they never share a comparison surface.
import { sql } from "drizzle-orm"
import type { CoveragePageModel, CoverageSource } from "@/lib/catalog-models"
import { db } from "../db/client.ts"

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

export async function getCoveragePage(): Promise<CoveragePageModel> {
  const [kernel, serving] = await Promise.all([
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
  ])
  return {
    illustrative: false,
    sources: [
      ...kernel.map(toSource("kernel")),
      ...serving.map(toSource("serving")),
    ],
  }
}
