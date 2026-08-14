// PostgreSQL connection and Drizzle instance. Lazy so fixture mode never
// touches the driver; a pooled URL serves requests, the direct URL is for
// migrations only (§27.9).
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { env } from "../env.ts"
import * as schema from "./schema.ts"

export type Db = PostgresJsDatabase<typeof schema>

let instance: Db | undefined

export function db(): Db {
  if (!instance) {
    if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not configured")
    instance = drizzle(postgres(env.DATABASE_URL, { max: 10 }), { schema })
  }
  return instance
}

export { schema }
