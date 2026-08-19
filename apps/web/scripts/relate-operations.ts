// Reviewed operation-relation maintenance (§8.4). Proposes exactly-equivalent
// pairs under the mechanical rule in relations.ts (identical spec bodies
// minus editorial fields AND a shared base slug), prints them for review,
// and publishes only on --publish. Idempotent: existing pairs are skipped.
//
//   pnpm --filter @kernelindex/web relate:operations
//   pnpm --filter @kernelindex/web relate:operations -- --publish
import { parseArgs } from "node:util"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import {
  EXACTLY_EQUIVALENT,
  equivalenceCandidates,
} from "../src/server/catalog/relations.ts"
import * as schema from "../src/server/db/schema.ts"

const rawArgs = process.argv.slice(2)
const { values } = parseArgs({
  args: rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs,
  options: { publish: { type: "boolean", default: false } },
})

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is required")
  process.exit(1)
}
const client = postgres(url, { max: 1 })
const database = drizzle(client, { schema })

const operations = await database
  .select({
    id: schema.operations.id,
    slug: schema.operations.slug,
    manifest: schema.operations.manifest,
  })
  .from(schema.operations)

const pairs = equivalenceCandidates(
  operations.map((operation) => ({
    ...operation,
    manifest: operation.manifest as { spec: Record<string, unknown> },
  })),
)
console.log(`${pairs.length} exactly-equivalent candidates:`)
for (const [a, b] of pairs) console.log(`  ${a.slug}  <->  ${b.slug}`)

if (values.publish) {
  let inserted = 0
  for (const [a, b] of pairs) {
    const result = await database
      .insert(schema.operationRelations)
      .values({
        fromOperationId: a.id,
        toOperationId: b.id,
        relation: EXACTLY_EQUIVALENT,
        rationale:
          "Spec bodies identical after removing the editorial family and " +
          `reference fields; slugs share base name '${b.slug.replace(/^\d+-/, "")}' ` +
          "(SOL-ExecBench numbered import of the FlashInfer-Bench definition). " +
          "Reviewed via scripts/relate-operations.ts.",
      })
      .onConflictDoNothing()
      .returning({ id: schema.operationRelations.id })
    inserted += result.length
  }
  console.log(`published ${inserted} new relations`)
} else {
  console.log("dry run — pass --publish to record the reviewed relations")
}
await client.end()
