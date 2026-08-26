// Explicit KernelBench importer command (§14.1–14.2): the committed baseline
// timing JSONs and problem modules in ScalingIntelligence/KernelBench (MIT),
// pinned to the latest commit touching the timings. Every problem whose
// module cannot be read statically is counted by reason in the report.
//
//   pnpm --filter @kernelindex/web import:kernelbench -- --dry-run
//   pnpm --filter @kernelindex/web import:kernelbench -- --publish
//
// Flags: --dry-run --publish --output <file>
import { writeFileSync } from "node:fs"
import { parseArgs } from "node:util"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { publishBundle } from "../src/server/catalog/publication.ts"
import * as schema from "../src/server/db/schema.ts"
import { discoverKernelBench } from "../src/server/import/kernelbench/discover.ts"
import { reconcileKernelBench } from "../src/server/import/kernelbench/reconcile.ts"

const rawArgs = process.argv.slice(2)
const { values } = parseArgs({
  args: rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs,
  options: {
    "dry-run": { type: "boolean", default: false },
    publish: { type: "boolean", default: false },
    output: { type: "string" },
  },
})
if (values.publish && values["dry-run"]) {
  console.error("--publish and --dry-run are mutually exclusive")
  process.exit(1)
}
const url = process.env.DATABASE_URL
if (!url) {
  console.error(
    "Set DATABASE_URL: the importer reconciles against the catalog.",
  )
  process.exit(1)
}
const client = postgres(url, { max: 1 })
const database = drizzle(client, { schema })

try {
  const data = await discoverKernelBench()
  const { bundle, report } = await reconcileKernelBench(database, data)
  if (values.publish) {
    const result = await publishBundle(database, bundle, { publish: true })
    console.log(JSON.stringify({ report, published: result.counts }, null, 2))
  } else {
    console.log(JSON.stringify({ report, published: null }, null, 2))
    console.log(
      "\ndry run: no writes performed. Re-run with --publish to execute the plan above.",
    )
  }
  if (values.output) {
    writeFileSync(values.output, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`report written to ${values.output}`)
  }
} finally {
  await client.end()
}
