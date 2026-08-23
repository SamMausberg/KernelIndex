// Resettle every workload's display identity (§8.5). `shape_summary` used to
// hold the leading tensor shape alone, which made sibling workloads of one
// operation — sixteen paged-decode cases differing only in num_pages and
// num_kv_indices — render as one repeated label, so their records read as
// contradictory measurements of the same thing. Publication now derives the
// summary per operation; this applies it to what is already in the catalog.
//
// Idempotent: only changed rows are written, so re-running is a no-op.
//
//   pnpm --filter @kernelindex/web backfill:summaries
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { refreshWorkloadSummaries } from "../src/server/catalog/publication.ts"
import * as schema from "../src/server/db/schema.ts"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("Set DATABASE_URL.")
  process.exit(1)
}
const client = postgres(url, { max: 1 })
try {
  const updated = await refreshWorkloadSummaries(drizzle(client, { schema }))
  console.log(`workload summaries updated: ${updated}`)
} finally {
  await client.end()
}
