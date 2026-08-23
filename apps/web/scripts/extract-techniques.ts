// Backfill technique traits (§8.7) over every implementation with an inline
// mirrored source artifact. Idempotent per extractor version: rows already
// present are skipped, so re-running after a detector change only adds the
// new version's facts.
//
//   pnpm --filter @kernelindex/web extract:techniques

import { eq, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import type { ImplementationRevisionManifest } from "../src/schemas/kinds.ts"
import { sourceLanguage } from "../src/server/catalog/run-rows.ts"
import * as schema from "../src/server/db/schema.ts"
import {
  EXTRACTOR_VERSION,
  traitRows,
} from "../src/server/enrich/techniques.ts"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is required")
  process.exit(1)
}
const client = postgres(url, { max: 1 })
const database = drizzle(client, { schema })

// Only implementations still missing this extractor version's rows.
const rows = await database
  .select({
    id: schema.implementations.id,
    slug: schema.implementations.slug,
    manifest: schema.implementations.manifest,
    content: schema.artifacts.content,
    mediaType: schema.artifacts.mediaType,
  })
  .from(schema.implementations)
  .innerJoin(
    schema.artifacts,
    eq(
      schema.artifacts.contentDigest,
      sql`${schema.implementations.manifest}->'spec'->'source'->>'contentDigest'`,
    ),
  )
  .where(
    sql`${schema.artifacts.content} is not null and not exists (
      select 1 from ${schema.implementationTraits} t
      where t.implementation_id = ${schema.implementations.id}
        and t.extractor_version = ${EXTRACTOR_VERSION})`,
  )

let inserted = 0
for (const row of rows) {
  const manifest = row.manifest as ImplementationRevisionManifest
  const traits = traitRows(
    row.id,
    sourceLanguage(row.mediaType, manifest.spec.source?.fileName ?? null),
    row.content as string,
  )
  if (traits.length === 0) continue
  await database
    .insert(schema.implementationTraits)
    .values(traits)
    .onConflictDoNothing()
  inserted += traits.length
}
console.log(
  `${rows.length} implementations scanned, ${inserted} traits stored (${EXTRACTOR_VERSION})`,
)
await client.end()
