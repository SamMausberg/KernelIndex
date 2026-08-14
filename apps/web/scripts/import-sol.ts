// Explicit SOL-ExecBench importer command (§14.1–14.2).
//
//   pnpm --filter @kernelindex/web import:sol -- --dry-run
//   pnpm --filter @kernelindex/web import:sol -- --kernels a,b --publish
//   pnpm --filter @kernelindex/web import:sol -- --snapshot ./sol-data --dry-run
//
// Flags: --dry-run --publish --snapshot <dir> --kernels <a,b> --limit <n>
//        --top <n> --resume <kernel> --source-revision <stack> --output <file>
// Dry-run is the default; nothing is written without --publish.
import { writeFileSync } from "node:fs"
import { parseArgs } from "node:util"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { publishBundle } from "../src/server/catalog/publication.ts"
import * as schema from "../src/server/db/schema.ts"
import {
  DEFAULT_KERNELS,
  discoverLeaderboard,
  discoverLocal,
} from "../src/server/import/sol/discover.ts"
import { reconcile } from "../src/server/import/sol/reconcile.ts"

// pnpm forwards the literal "--" separator, which would make parseArgs treat
// every following flag as a positional; strip it.
const rawArgs = process.argv.slice(2)
const { values } = parseArgs({
  args: rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs,
  options: {
    "dry-run": { type: "boolean", default: false },
    publish: { type: "boolean", default: false },
    snapshot: { type: "string" },
    kernels: { type: "string" },
    limit: { type: "string" },
    top: { type: "string", default: "3" },
    resume: { type: "string" },
    "source-revision": { type: "string" },
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
  const data = values.snapshot
    ? discoverLocal(values.snapshot)
    : await discoverLeaderboard({
        kernels: values.kernels
          ? values.kernels.split(",").map((k) => k.trim())
          : DEFAULT_KERNELS,
        limit: values.limit !== undefined ? Number(values.limit) : undefined,
        resume: values.resume,
      })

  const { bundle, report } = await reconcile(database, data, {
    topPerKernel: Number(values.top),
    stackVersion: values["source-revision"],
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
