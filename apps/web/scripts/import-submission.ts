// PR-path submissions (§15.2): a reviewed registry/submissions/*.yaml file
// runs the exact validation and publication transaction the web flow uses.
// A Git merge does not become public until this succeeds.
//
//   pnpm --filter @kernelindex/web import:submission -- <path> [--publish]
import { readFileSync } from "node:fs"
import { parseArgs } from "node:util"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { publishBundle } from "../src/server/catalog/publication.ts"
import { bundleFromSubmission } from "../src/server/catalog/submissions.ts"
import * as schema from "../src/server/db/schema.ts"

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { publish: { type: "boolean", default: false } },
})
const file = positionals[0]
if (!file) {
  console.error("usage: import-submission <path> [--publish]")
  process.exit(2)
}

const { bundle, report } = bundleFromSubmission(readFileSync(file, "utf8"))
console.log(JSON.stringify(report, null, 2))
if (!report.valid) process.exit(1)
if (!values.publish) {
  console.log("dry run: re-run with --publish to execute")
  process.exit(0)
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error("Set DATABASE_URL to publish.")
  process.exit(1)
}
const client = postgres(url, { max: 1 })
try {
  const result = await publishBundle(drizzle(client, { schema }), bundle, {
    publish: true,
  })
  console.log(JSON.stringify(result.counts, null, 2))
} finally {
  await client.end()
}
