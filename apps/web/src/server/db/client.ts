// PostgreSQL connection and Drizzle instance. Lazy so fixture mode never
// touches the driver; a pooled URL serves requests, the direct URL is for
// migrations only (§27.9).
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { env } from "../env.ts"
import * as schema from "./schema.ts"

export type Db = PostgresJsDatabase<typeof schema>

// Cached on globalThis so dev-server hot reloads reuse one pool instead of
// leaking ten connections per reload until Postgres hits max_connections.
const globalCache = globalThis as { __kernelindexDb?: Db }

export function db(): Db {
  if (!globalCache.__kernelindexDb) {
    if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not configured")
    globalCache.__kernelindexDb = drizzle(
      postgres(env.DATABASE_URL, { max: 10 }),
      { schema },
    )
  }
  return globalCache.__kernelindexDb
}

export { schema }
