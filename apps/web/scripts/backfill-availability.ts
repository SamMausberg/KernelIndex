// Recompute the derived availability facts across the catalog (§8.15): the
// install line and whether the source is public.
//
// Both were being lost. `install_command` was read only from a manifest field
// sources rarely write — they declare `{kind: pip, package: liger-kernel}` —
// so no implementation had an install line and no answer was ever deployable.
// And an implementation whose own revision doesn't mirror a file still has
// public source when its project publishes a repository. Publication derives
// both correctly now; this applies it to what is already published.
//
// Idempotent: only changed rows are written, so re-running is a no-op.
//
//   pnpm --filter @kernelindex/web backfill:availability
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { refreshAvailability } from "../src/server/catalog/publication.ts"
import * as schema from "../src/server/db/schema.ts"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("Set DATABASE_URL.")
  process.exit(1)
}
const client = postgres(url, { max: 1 })
try {
  const { implementations, runs } = await refreshAvailability(
    drizzle(client, { schema }),
  )
  console.log(
    `availability refreshed: ${implementations} implementations, ${runs} runs`,
  )
} finally {
  await client.end()
}
