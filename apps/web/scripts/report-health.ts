// Durable source health + review report (§14.8, §20.2–20.3): freshness per
// source against its declared interval, plus the review slice of any import
// dry-run reports passed as arguments. Written to
// registry/reports/source-health.json and committed by the import workflow.
// Read-only; "reviewed JSON reports plus maintainer commands" stand in for
// an admin UI. Usage: node scripts/report-health.ts [report.json ...]

import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { FLASHINFER_SOURCE } from "../src/server/import/flashinfer/types.ts"
import { GPUMODE_SOURCE } from "../src/server/import/gpumode/types.ts"
import { MLPERF_SOURCE } from "../src/server/import/mlperf/types.ts"
import { SOL_SOURCE } from "../src/server/import/sol/types.ts"

const DECLARED: Record<string, number> = Object.fromEntries(
  [SOL_SOURCE, GPUMODE_SOURCE, FLASHINFER_SOURCE, MLPERF_SOURCE].map(
    (source) => [source.slug, source.policy.freshnessDays],
  ),
)

const url = process.env.DATABASE_URL
if (!url) {
  console.error("Set DATABASE_URL.")
  process.exit(1)
}
const client = postgres(url, { max: 1 })
const database = drizzle(client)

type ReviewSlice = {
  source: string
  revision?: string
  ambiguities: string[]
  issues: unknown[]
  driftWarnings: string[]
  licenseWarnings: string[]
  plan?: string
}

try {
  const rows = (await database.execute(
    sql`select s.slug, s.kind, max(ss.fetched_at) last_fetched,
          count(distinct ss.id) snapshots,
          (select count(*) from benchmark_runs r
             where r.source_id = s.id and r.published_at is not null) runs
        from sources s left join source_snapshots ss on ss.source_id = s.id
        group by s.id order by s.slug`,
  )) as {
    slug: string
    kind: string
    last_fetched: Date | string | null
    snapshots: string | number
    runs: string | number
  }[]

  const now = Date.now()
  const sources = rows.map((row) => {
    const declaredDays = DECLARED[row.slug] ?? null
    const last =
      row.last_fetched === null ? null : new Date(row.last_fetched).getTime()
    const state =
      last === null
        ? "never"
        : declaredDays !== null && now - last > declaredDays * 86_400_000
          ? "stale"
          : "fresh"
    return {
      slug: row.slug,
      kind: row.kind,
      state,
      lastFetchedAt: last === null ? null : new Date(last).toISOString(),
      declaredFreshnessDays: declaredDays,
      snapshots: Number(row.snapshots),
      publishedRuns: Number(row.runs),
    }
  })

  // Review slice from import dry-run reports (§14.2 --output files): never
  // the full `proposed` plan, only what a maintainer must look at.
  const reviews: ReviewSlice[] = []
  for (const file of process.argv.slice(2)) {
    const report = JSON.parse(readFileSync(file, "utf8"))
    reviews.push({
      source: report.source,
      revision: report.revision,
      ambiguities: report.ambiguities ?? [],
      issues: report.issues ?? [],
      driftWarnings: report.driftWarnings ?? [],
      licenseWarnings: report.licenseWarnings ?? [],
      plan: report.plan,
    })
  }

  const output = {
    generatedAt: new Date().toISOString(),
    sources,
    reviews,
    needsReview: reviews.reduce(
      (n, review) => n + review.ambiguities.length + review.issues.length,
      0,
    ),
  }
  const target = path.resolve(
    import.meta.dirname,
    "../../../registry/reports/source-health.json",
  )
  writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`)
  console.log(
    `${target}: ${sources.length} sources (${sources.filter((s) => s.state !== "fresh").length} not fresh), ${reviews.length} reviews, ${output.needsReview} items need review`,
  )
} finally {
  await client.end()
}
