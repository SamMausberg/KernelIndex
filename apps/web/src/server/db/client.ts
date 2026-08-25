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
      // prepare:false is required through Neon's PgBouncer pooler
      // (transaction mode): prepared statements caused intermittent
      // production 500s and silently failing ISR revalidations, which
      // then served stale pages (2026-08-25 incident). The timeouts keep
      // a wedged connection from holding a serverless invocation open.
      postgres(env.DATABASE_URL, {
        max: 10,
        prepare: false,
        connect_timeout: 10,
        idle_timeout: 20,
      }),
      { schema },
    )
  }
  return globalCache.__kernelindexDb
}

export { schema }
