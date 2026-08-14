// Seeds a development database with the illustrative registry examples via
// the real publication transaction. The source is kind "illustrative", so
// catalog reads label everything derived from it. Never run against
// production: production records come from reviewed imports only.
// Run with: pnpm --filter @kernelindex/web db:seed
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { exampleBundle } from "../src/server/catalog/example-bundle.ts"
import { publishBundle } from "../src/server/catalog/publication.ts"
import * as schema from "../src/server/db/schema.ts"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("Set DATABASE_URL to seed a development database.")
  process.exit(1)
}

const client = postgres(url, { max: 1 })
const result = await publishBundle(
  drizzle(client, { schema }),
  exampleBundle(),
  {
    publish: true,
  },
)
await client.end()
console.log(JSON.stringify(result.counts, null, 2))
