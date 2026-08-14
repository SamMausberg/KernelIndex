// One-off backfill: derive record_events (§11.10) for runs published before
// the table existed. New publications sync inside the publication
// transaction; this command is only needed once per catalog after the 0002
// migration. Run with: pnpm --filter @kernelindex/web db:sync-records
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { syncRecordEvents } from "../src/server/catalog/record-events.ts"
import * as schema from "../src/server/db/schema.ts"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("Set DATABASE_URL to sync record events.")
  process.exit(1)
}
const client = postgres(url, { max: 1 })
const appended = await syncRecordEvents(drizzle(client, { schema }))
await client.end()
console.log(`record events appended: ${appended}`)
