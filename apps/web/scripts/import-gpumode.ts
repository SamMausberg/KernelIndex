// Explicit GPU MODE KernelBot importer command (§14.1–14.2). Imports the
// curated AMD leaderboards (per-shape timings from the licensed
// GPUMODE/kernelbot-data dataset), attributed to GPU Mode.
//
//   pnpm --filter @kernelindex/web import:gpumode -- --dry-run
//   pnpm --filter @kernelindex/web import:gpumode -- --leaderboards amd-fp8-mm --publish
//
// Flags: --dry-run --publish --leaderboards <a,b> --top <n> --depth <n>
//        --output <file>
// Dry-run is the default; nothing is written without --publish.
import { writeFileSync } from "node:fs"
import { parseArgs } from "node:util"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { publishBundle } from "../src/server/catalog/publication.ts"
import * as schema from "../src/server/db/schema.ts"
import { discoverKernelbot } from "../src/server/import/gpumode/discover.ts"
import { reconcileKernelbot } from "../src/server/import/gpumode/reconcile.ts"

const rawArgs = process.argv.slice(2)
const { values } = parseArgs({
  args: rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs,
  options: {
    "dry-run": { type: "boolean", default: false },
    publish: { type: "boolean", default: false },
    leaderboards: { type: "string" },
    top: { type: "string", default: "5" },
    depth: { type: "string", default: "100" },
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
  const data = await discoverKernelbot({
    leaderboards: values.leaderboards
      ? values.leaderboards.split(",").map((entry) => entry.trim())
      : undefined,
    depth: Number(values.depth),
  })
  const { bundle, report } = await reconcileKernelbot(database, data, {
    topPerBoard: Number(values.top),
  })
  if (values.publish) {
    const result = await publishBundle(database, bundle, { publish: true })
    console.log(JSON.stringify({ report, published: result.counts }, null, 2))
  } else {
    console.log(JSON.stringify({ report, published: null }, null, 2))
    console.log(
      `\ndry run: no writes performed. Re-run with --publish to execute the plan above.`,
    )
  }
  if (values.output) {
    writeFileSync(values.output, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`report written to ${values.output}`)
  }
} finally {
  await client.end()
}
