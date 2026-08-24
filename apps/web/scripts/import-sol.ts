// Explicit SOL-ExecBench importer command (§14.1–14.2). Leaderboard mode
// discovers every kernel by default; narrow a tranche with --tag (an
// upstream tag such as L1, normalization, or model:DeepSeek-V3) or --kernels.
//
//   pnpm --filter @kernelindex/web import:sol -- --tag L1 --dry-run
//   pnpm --filter @kernelindex/web import:sol -- --kernels a,b --publish
//   pnpm --filter @kernelindex/web import:sol -- --snapshot ./sol-data --dry-run
//
// Leaderboard mode publishes in windows of --window kernels, each in its own
// transaction, so a deep walk holds one window's rows at a time and can be
// interrupted: --cursor-file records where to resume.
//
// Flags: --dry-run --publish --snapshot <dir> --kernels <a,b> --tag <tag>
//        --limit <n> --top <n|all> --window <n> --resume <kernel>
//        --cursor-file <path> --source-revision <stack> --output <file>
// Dry-run is the default; nothing is written without --publish.
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { parseArgs } from "node:util"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { publishBundle } from "../src/server/catalog/publication.ts"
import * as schema from "../src/server/db/schema.ts"
import {
  discoverLeaderboard,
  discoverLocal,
  type SolImportData,
} from "../src/server/import/sol/discover.ts"
import {
  type ImportReport,
  mergeSolReports,
  reconcile,
} from "../src/server/import/sol/reconcile.ts"

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
    tag: { type: "string" },
    limit: { type: "string" },
    top: { type: "string", default: "all" },
    window: { type: "string", default: "10" },
    resume: { type: "string" },
    "cursor-file": { type: "string" },
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

const cursorFile = values["cursor-file"]
const stackVersion = values["source-revision"]
const topPerKernel = values.top === "all" ? null : Number(values.top)
const totalLimit = values.limit !== undefined ? Number(values.limit) : undefined

try {
  const reports: ImportReport[] = []
  const counts = { runs: 0, implementations: 0, workloads: 0 }
  const publishWindow = async (data: SolImportData) => {
    const { bundle, report } = await reconcile(database, data, {
      topPerKernel,
      stackVersion,
    })
    reports.push(report)
    if (!values.publish) return
    const result = await publishBundle(database, bundle, { publish: true })
    counts.runs += result.counts.runs.inserted
    counts.implementations += result.counts.implementations.inserted
    counts.workloads += result.counts.workloads.inserted
    console.error(
      `published ${data.definitions.size} kernel(s): ${result.counts.runs.inserted} runs`,
    )
  }

  if (values.snapshot) {
    await publishWindow(
      discoverLocal(values.snapshot, process.env.SOL_EXAMPLES_COMMIT),
    )
  } else {
    // A window is a transaction: discovery, reconciliation, and publication
    // for a handful of kernels, then the next window starts from the cursor.
    const windowSize = Number(values.window)
    let resume =
      cursorFile && existsSync(cursorFile)
        ? readFileSync(cursorFile, "utf8").trim() || undefined
        : values.resume
    if (resume && resume !== values.resume)
      console.error(`resuming the walk at ${resume}`)
    let walked = 0
    for (;;) {
      const remaining =
        totalLimit === undefined
          ? windowSize
          : Math.min(windowSize, totalLimit - walked)
      if (remaining <= 0) break
      const data = await discoverLeaderboard({
        kernels: values.kernels
          ? values.kernels.split(",").map((k) => k.trim())
          : undefined,
        tag: values.tag,
        limit: remaining,
        resume,
      })
      walked += data.definitions.size
      await publishWindow(data)
      if (!data.nextResume) break
      resume = data.nextResume
      if (values.publish && cursorFile) writeFileSync(cursorFile, `${resume}\n`)
    }
  }

  const report = mergeSolReports(reports)
  console.log(
    JSON.stringify(
      { report, published: values.publish ? counts : null },
      null,
      2,
    ),
  )
  if (!values.publish) {
    console.log(
      `\ndry run: no writes performed. Re-run with --publish to execute the plan above.`,
    )
  }
  if (values.output) {
    writeFileSync(values.output, `${JSON.stringify(report, null, 2)}\n`)
    console.error(`report written to ${values.output}`)
  }
} finally {
  await client.end()
}
