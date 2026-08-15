// Discovery (§14.1): the leaderboards table, then the ranked passed
// leaderboard-mode rows per curated problem via the datasets-server filter
// API. Everything fetched is snapshotted before parsing (§14.3).
import { type FetchedSnapshot, fetchSnapshot } from "../fetch.ts"
import {
  type GmParseOutcome,
  parseLeaderboards,
  parseSubmissionRows,
} from "./parse.ts"
import { CURATED_PROBLEMS, type CuratedProblem } from "./problems.ts"
import {
  DATASET,
  DATASETS_SERVER,
  type GmLeaderboard,
  type GmSubmissionRow,
  SUBMISSIONS_CONFIG,
} from "./types.ts"

export type GmImportData = {
  problems: { problem: CuratedProblem; board: GmLeaderboard }[]
  /** Ranked candidate rows per leaderboard name, best score first. */
  rows: Map<string, GmSubmissionRow[]>
  snapshots: FetchedSnapshot[]
  issues: { locator: string; item: string; problem: string }[]
  driftWarnings: string[]
}

export type GmDiscoverOptions = {
  /** Leaderboard names to import; absent means every curated problem. */
  leaderboards?: string[]
  /** Ranked rows fetched per board (pre user-dedupe); paged 100 at a time. */
  depth?: number
}

const PAGE_SIZE = 100

const FETCH_SPACING_MS = 200
const RETRY_DELAY_MS = 15_000
const RETRY_ATTEMPTS = 6

/** datasets-server returns 500 while building a query's index; retry it. */
async function fetchWithRetry(locator: string): Promise<FetchedSnapshot> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchSnapshot(locator)
    } catch (error) {
      if (attempt >= RETRY_ATTEMPTS) throw error
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }
}

function collect<T>(data: GmImportData, outcome: GmParseOutcome<T>): T[] {
  data.issues.push(...outcome.issues)
  data.driftWarnings.push(...outcome.driftWarnings)
  return outcome.values
}

function rowsUrl(config: string, query: string): string {
  return `${DATASETS_SERVER}/${query.includes("where=") ? "filter" : "rows"}?dataset=${encodeURIComponent(DATASET)}&config=${config}&split=train&${query}`
}

export async function discoverKernelbot(
  options: GmDiscoverOptions,
): Promise<GmImportData> {
  const data: GmImportData = {
    problems: [],
    rows: new Map(),
    snapshots: [],
    issues: [],
    driftWarnings: [],
  }
  const depth = options.depth ?? 300

  const boardsSnapshot = await fetchWithRetry(
    rowsUrl("leaderboards", "offset=0&length=100"),
  )
  data.snapshots.push(boardsSnapshot)
  const boards = collect(
    data,
    parseLeaderboards(boardsSnapshot.body, boardsSnapshot.locator),
  )

  const wanted = CURATED_PROBLEMS.filter(
    (problem) =>
      options.leaderboards === undefined ||
      options.leaderboards.includes(problem.leaderboard),
  )
  for (const requested of options.leaderboards ?? []) {
    if (!CURATED_PROBLEMS.some((p) => p.leaderboard === requested)) {
      data.issues.push({
        locator: "curation",
        item: requested,
        problem:
          "leaderboard has no curated operation specification; curate it in problems.ts before importing",
      })
    }
  }

  for (const problem of wanted) {
    const board = boards.find((entry) => entry.name === problem.leaderboard)
    if (!board) {
      data.issues.push({
        locator: boardsSnapshot.locator,
        item: problem.leaderboard,
        problem: "curated leaderboard not present in the leaderboards table",
      })
      continue
    }
    const where = encodeURIComponent(
      `"leaderboard_id" = ${board.id} AND "run_passed" = true AND "run_mode" = 'leaderboard'`,
    )
    const orderby = encodeURIComponent(`"run_score" ASC`)
    const rows: GmSubmissionRow[] = []
    for (let offset = 0; offset < depth; offset += PAGE_SIZE) {
      const snapshot = await fetchWithRetry(
        rowsUrl(
          SUBMISSIONS_CONFIG,
          `where=${where}&orderby=${orderby}&offset=${offset}&length=${Math.min(PAGE_SIZE, depth - offset)}`,
        ),
      )
      data.snapshots.push(snapshot)
      const page = collect(
        data,
        parseSubmissionRows(snapshot.body, snapshot.locator),
      )
      rows.push(...page)
      if (page.length < PAGE_SIZE) break
      await new Promise((resolve) => setTimeout(resolve, FETCH_SPACING_MS))
    }
    data.problems.push({ problem, board })
    data.rows.set(problem.leaderboard, rows)
  }

  data.driftWarnings = [...new Set(data.driftWarnings)]
  return data
}
