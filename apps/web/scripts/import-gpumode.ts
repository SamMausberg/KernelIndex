// Explicit GPU MODE KernelBot importer command (§14.1–14.2). Imports the
// curated KernelBot leaderboards (per-shape timings and aggregate scores,
// with mirrored submission source) from the licensed GPUMODE/kernelbot-data
// dataset, attributed to GPU Mode.
//
//   pnpm --filter @kernelindex/web import:gpumode -- --group helion --dry-run
//   pnpm --filter @kernelindex/web import:gpumode -- --group amd --publish
//
// Flags: --dry-run --publish --group <name> --leaderboards <a,b> --top <n>
//        --authors <n> --max-per-author <n> --depth <n> --output <file>
// Dry-run is the default; nothing is written without --publish.
import { writeFileSync } from "node:fs"
import { parseArgs } from "node:util"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { publishBundle } from "../src/server/catalog/publication.ts"
import * as schema from "../src/server/db/schema.ts"
import { discoverKernelbot } from "../src/server/import/gpumode/discover.ts"
import {
  CURATED_PROBLEMS,
  type KernelbotConfig,
} from "../src/server/import/gpumode/problems.ts"
import { reconcileKernelbot } from "../src/server/import/gpumode/reconcile.ts"

const GROUPS: Record<string, KernelbotConfig> = {
  amd: "amd_successful_submissions",
  "amd-1-1m": "amd_1_1m_competition",
  nvfp4: "nvidia_nvfp4_submissions",
  pmpp: "pmpp_v2_submissions",
  linalg: "linalg_submissions",
  trimul: "trimul_submissions",
  helion: "helion_b200_nebius",
}

const rawArgs = process.argv.slice(2)
const { values } = parseArgs({
  args: rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs,
  options: {
    "dry-run": { type: "boolean", default: false },
    publish: { type: "boolean", default: false },
    group: { type: "string" },
    leaderboards: { type: "string" },
    top: { type: "string", default: "50" },
    authors: { type: "string", default: "10" },
    "max-per-author": { type: "string", default: "12" },
    depth: { type: "string", default: "500" },
    output: { type: "string" },
  },
})

if (values.publish && values["dry-run"]) {
  console.error("--publish and --dry-run are mutually exclusive")
  process.exit(1)
}
if (values.group !== undefined && !(values.group in GROUPS)) {
  console.error(
    `unknown --group; expected one of ${Object.keys(GROUPS).join(", ")}`,
  )
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

const leaderboards = values.leaderboards
  ? values.leaderboards.split(",").map((entry) => entry.trim())
  : values.group !== undefined
    ? CURATED_PROBLEMS.filter(
        (problem) => problem.config === GROUPS[values.group as string],
      ).map((problem) => problem.leaderboard)
    : undefined

try {
  const data = await discoverKernelbot({
    leaderboards,
    depth: Number(values.depth),
    top: Number(values.top),
    authors: Number(values.authors),
  })
  const { bundle, report } = await reconcileKernelbot(database, data, {
    topPerBoard: Number(values.top),
    authors: Number(values.authors),
    maxPerAuthor: Number(values["max-per-author"]),
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
