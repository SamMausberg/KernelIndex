// Applies committed SQL migrations from drizzle/ (forward-only, §19.6).
// Run with: pnpm --filter @kernelindex/web db:migrate
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL
if (!url) {
  console.error("Set DATABASE_DIRECT_URL (or DATABASE_URL) to run migrations.")
  process.exit(1)
}

const client = postgres(url, { max: 1 })
await migrate(drizzle(client), { migrationsFolder: "drizzle" })
await client.end()
console.log("migrations applied")
