// Explicit MLPerf Inference importer command (§14.1–14.2): official
// summary_results.json per pinned round repo (Apache-2.0), closed division,
// datacenter suite, token-throughput LLM benchmarks (docs/source-policy.md).
//
//   pnpm --filter @kernelindex/web import:mlperf -- --dry-run
//   pnpm --filter @kernelindex/web import:mlperf -- --round v5.1 --publish
//
// Flags: --dry-run --publish --round <r> --limit <n> --output <file>
import { writeFileSync } from "node:fs"
import { parseArgs } from "node:util"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { publishServingBundle } from "../src/server/catalog/serving-publication.ts"
import * as schema from "../src/server/db/schema.ts"
import { discoverMlperf } from "../src/server/import/mlperf/discover.ts"
import { reconcileMlperf } from "../src/server/import/mlperf/reconcile.ts"

const rawArgs = process.argv.slice(2)
const { values } = parseArgs({
  args: rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs,
  options: {
    "dry-run": { type: "boolean", default: false },
    publish: { type: "boolean", default: false },
    round: { type: "string", multiple: true },
    limit: { type: "string" },
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
  const data = await discoverMlperf({
    rounds: values.round,
    limit: values.limit !== undefined ? Number(values.limit) : undefined,
  })
  const { bundle, report } = await reconcileMlperf(database, data)
  if (values.publish) {
    const result = await publishServingBundle(database, bundle, {
      publish: true,
    })
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
