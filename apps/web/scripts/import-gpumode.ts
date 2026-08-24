// Explicit GPU MODE KernelBot importer command (§14.1–14.2). Imports the
// curated KernelBot leaderboards (per-shape timings and aggregate scores,
// with mirrored submission source) from the licensed GPUMODE/kernelbot-data
// dataset, attributed to GPU Mode.
//
//   pnpm --filter @kernelindex/web import:gpumode -- --group helion --dry-run
//   pnpm --filter @kernelindex/web import:gpumode -- --group amd --publish
//
// Each board publishes in its own transaction, so a long run holds one
// board's rows at a time and can be interrupted: --cursor-file records the
// boards already published and skips them on the next run.
//
// Flags: --dry-run --publish --group <name> --leaderboards <a,b> --top <n|all>
//        --authors <n|all> --max-per-author <n> --limit <n> --cursor-file
//        <path> --no-mirror-code --output <file>
// Dry-run is the default; nothing is written without --publish.
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { parseArgs } from "node:util"
import { and, inArray, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { publishBundle } from "../src/server/catalog/publication.ts"
import * as schema from "../src/server/db/schema.ts"
import {
  discoverKernelbot,
  type GmImportData,
} from "../src/server/import/gpumode/discover.ts"
import {
  CURATED_PROBLEMS,
  type KernelbotConfig,
} from "../src/server/import/gpumode/problems.ts"
import {
  type GmImportReport,
  mergeGmReports,
  reconcileKernelbot,
} from "../src/server/import/gpumode/reconcile.ts"

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
    top: { type: "string", default: "all" },
    authors: { type: "string", default: "all" },
    "max-per-author": { type: "string", default: "4" },
    limit: { type: "string" },
    "cursor-file": { type: "string" },
    "no-mirror-code": { type: "boolean", default: false },
    output: { type: "string" },
  },
})

if (values.publish && values["dry-run"]) {
  console.error("--publish and --dry-run are mutually exclusive")
  process.exit(1)
}
// Source presence is part of an implementation's digest, so a row published
// without its source is not a lighter version of the same record — it is a
// different one, which the next mirroring run would shadow.
if (values.publish && values["no-mirror-code"]) {
  console.error(
    "--no-mirror-code is for dry runs: publishing without source would shadow those pages on the next mirrored run",
  )
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

/** "all" keeps every author; a number caps the cohort. */
const cap = (value: string): number | null =>
  value === "all" ? null : Number(value)

const cursorFile = values["cursor-file"]
const published = new Set<string>(
  cursorFile && existsSync(cursorFile)
    ? readFileSync(cursorFile, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [],
)

let leaderboards = values.leaderboards
  ? values.leaderboards.split(",").map((entry) => entry.trim())
  : values.group !== undefined
    ? CURATED_PROBLEMS.filter(
        (problem) => problem.config === GROUPS[values.group as string],
      ).map((problem) => problem.leaderboard)
    : undefined
// §14.2 --limit: bound discovery volume (boards processed this run).
if (values.limit !== undefined) {
  const limit = Number(values.limit)
  leaderboards = (
    leaderboards ?? CURATED_PROBLEMS.map((problem) => problem.leaderboard)
  ).slice(0, limit)
}
if (published.size > 0) {
  const before =
    leaderboards ?? CURATED_PROBLEMS.map((problem) => problem.leaderboard)
  leaderboards = before.filter((board) => !published.has(board))
  console.error(
    `resuming: ${published.size} board(s) already published, ${leaderboards.length} to go`,
  )
}

const client = postgres(url, { max: 1 })
const database = drizzle(client, { schema })

try {
  const data = await discoverKernelbot({
    leaderboards,
    top: cap(values.top),
    authors: cap(values.authors),
    maxPerAuthor: Number(values["max-per-author"]),
    mirrorCode: !values["no-mirror-code"],
    // Never let a narrower mirroring policy strip source off a record that
    // already has it: that would republish the page under a new digest.
    alreadyMirrored: async (slugs) => {
      const found = new Set<string>()
      for (let start = 0; start < slugs.length; start += 500) {
        const rows = await database
          .select({ slug: schema.implementations.slug })
          .from(schema.implementations)
          .where(
            and(
              inArray(
                schema.implementations.slug,
                slugs.slice(start, start + 500),
              ),
              sql`${schema.implementations.manifest} -> 'spec' -> 'source' is not null`,
            ),
          )
        for (const row of rows) found.add(row.slug)
      }
      return found
    },
  })

  // One window per board: its own bundle, its own transaction. Discovery's
  // shared provenance rides the first window so it is not re-proposed.
  const reports: GmImportReport[] = []
  const counts = { runs: 0, implementations: 0, workloads: 0 }
  for (const [index, board] of data.boards.entries()) {
    const window: GmImportData = {
      boards: [board],
      snapshots: index === 0 ? data.snapshots : [],
      cohorts: data.cohorts.filter(
        (cohort) => cohort.leaderboard === board.problem.leaderboard,
      ),
      discoveredRows: index === 0 ? data.discoveredRows : 0,
      invalidRows: index === 0 ? data.invalidRows : 0,
      deferredRows: index === 0 ? data.deferredRows : 0,
      issues: index === 0 ? data.issues : [],
      driftWarnings: index === 0 ? data.driftWarnings : [],
    }
    const { bundle, report } = await reconcileKernelbot(database, window)
    reports.push(report)
    if (values.publish) {
      const result = await publishBundle(database, bundle, { publish: true })
      counts.runs += result.counts.runs.inserted
      counts.implementations += result.counts.implementations.inserted
      counts.workloads += result.counts.workloads.inserted
      if (cursorFile)
        appendFileSync(cursorFile, `${board.problem.leaderboard}\n`)
      console.error(
        `published ${board.problem.leaderboard}: ${result.counts.runs.inserted} runs`,
      )
    }
  }

  if (reports.length === 0) {
    console.log(JSON.stringify({ report: null, published: null }, null, 2))
    console.error("nothing to import: no board produced a cohort")
  } else {
    const report = mergeGmReports(reports)
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
  }
} finally {
  await client.end()
}
