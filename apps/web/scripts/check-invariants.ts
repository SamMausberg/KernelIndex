// Continuous data-quality invariants (§20.3, subset): every violation is a
// tracked defect, and the scheduled import workflow fails loudly on them.
// Read-only; exits non-zero when any invariant is violated.

import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import type { AnyManifest } from "../src/schemas/kinds.ts"
import * as schema from "../src/server/db/schema.ts"
import { specDigest } from "../src/server/identity/digest.ts"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("Set DATABASE_URL.")
  process.exit(1)
}
const client = postgres(url, { max: 1 })
const database = drizzle(client, { schema })
const violations: string[] = []

async function count(name: string, query: ReturnType<typeof sql>) {
  const [row] = (await database.execute(query)) as { n: string | number }[]
  const n = Number(row.n)
  if (n > 0) violations.push(`${name}: ${n}`)
  console.error(`${name}: ${n}`)
}

try {
  await count(
    "published runs with dangling references",
    sql`select count(*) n from benchmark_runs r
        where r.published_at is not null
          and (not exists (select 1 from implementations i where i.id = r.implementation_id)
            or not exists (select 1 from workloads w where w.id = r.workload_id)
            or not exists (select 1 from sources s where s.id = r.source_id))`,
  )
  await count(
    "supersession cycles",
    sql`with recursive chain(id, supersedes_id, depth) as (
          select id, supersedes_id, 0 from benchmark_runs where supersedes_id is not null
          union all
          select c.id, r.supersedes_id, c.depth + 1
          from chain c join benchmark_runs r on r.id = c.supersedes_id
          where r.supersedes_id is not null and c.depth < 50
        )
        select count(*) n from chain where depth >= 50 or id = supersedes_id`,
  )
  await count(
    "mirrored source without its artifact",
    sql`select count(*) n from implementations i
        where i.manifest #>> '{spec,source,contentDigest}' is not null
          and not exists (select 1 from artifacts a
            where a.content_digest = i.manifest #>> '{spec,source,contentDigest}')`,
  )
  await count(
    "record events pointing at unknown runs",
    sql`select count(*) n from record_events e
        where not exists (select 1 from benchmark_runs r where r.id = e.run_id)`,
  )
  await count(
    "passed published runs without a primary value",
    sql`select count(*) n from benchmark_runs
        where published_at is not null and status = 'passed' and primary_value is null`,
  )

  // Digest recomputation sample (§20.3): stored semantic digests must equal
  // a fresh canonicalization of the stored manifest.
  const operations = (await database.execute(
    sql`select semantic_digest, manifest from operations order by random() limit 25`,
  )) as { semantic_digest: string; manifest: unknown }[]
  let mismatches = 0
  for (const row of operations) {
    if (specDigest(row.manifest as AnyManifest) !== row.semantic_digest)
      mismatches++
  }
  if (mismatches > 0)
    violations.push(`operation digest recomputation mismatches: ${mismatches}`)
  console.error(`operation digest sample mismatches: ${mismatches}/25`)

  // Freshness moved to scripts/report-health.ts (§14.8 durable report).

  if (violations.length > 0) {
    console.error(`\nVIOLATIONS:\n${violations.join("\n")}`)
    process.exit(1)
  }
  console.log("all invariants hold")
} finally {
  await client.end()
}
