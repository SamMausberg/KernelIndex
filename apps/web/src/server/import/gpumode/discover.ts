// Discovery (§14.1): the whole KernelBot population, read column-wise from the
// dataset's revision-pinned parquet files. The facts a cohort is decided on —
// author, board, runner, score, time — are a few MB across half a million
// submissions, while the mirrored source sitting beside them is gigabytes, so
// selection runs over every submission instead of a ranked page and the source
// column is fetched afterwards, only for the rows that were kept (§14.9).
// Everything read is snapshotted before parsing (§14.3): for a parquet file
// that snapshot is its footer, which names the file uniquely.
import {
  type FetchedSnapshot,
  fetchSnapshot,
  INLINE_BODY_LIMIT,
} from "../fetch.ts"
import {
  openParquet,
  type ParquetHandle,
  readParquetGroups,
} from "../parquet.ts"
import { implementationSlug } from "./normalize.ts"
import {
  type GmParseOutcome,
  parseCodeRows,
  parseFlatObjects,
  parseLeaderboardObjects,
  parseRunResult,
  parseSubmissionObjects,
} from "./parse.ts"
import { CURATED_PROBLEMS, type CuratedProblem } from "./problems.ts"
import { type GmSelectionOptions, MIN_SCORE_S, selectCohort } from "./select.ts"
import {
  DATASET,
  DATASETS_SERVER,
  type GmCandidate,
  type GmFlatRow,
  type GmLeaderboard,
  type GmSubmissionRow,
  PARQUET_BRANCH,
  PARQUET_REVISION_API,
  SUBMISSIONS_CONFIG,
} from "./types.ts"

export type GmBoardData = {
  problem: CuratedProblem
  /** Selected candidates per runner cohort, best score first. */
  cohorts: Map<string, GmCandidate[]>
}

/** One cohort's selection counts; the dry-run's tuning input. */
export type GmCohortStat = {
  leaderboard: string
  runner: string
  top: number
  progression: number
  withCode: number
}

export type GmImportData = {
  boards: GmBoardData[]
  snapshots: FetchedSnapshot[]
  cohorts: GmCohortStat[]
  /** Passed leaderboard rows seen across every config read this run. */
  discoveredRows: number
  /** Candidates rejected because their evidence would not parse. */
  invalidRows: number
  /** Candidates held back because their source could not be mirrored. */
  deferredRows: number
  issues: { locator: string; item: string; problem: string }[]
  driftWarnings: string[]
}

export type GmDiscoverOptions = GmSelectionOptions & {
  /** Leaderboard names to import; absent means every curated problem. */
  leaderboards?: string[]
  /** Mirror submission source for the rows kept. */
  mirrorCode?: boolean
  /**
   * Which of these implementation slugs the catalog already mirrors source
   * for. Source presence is part of an implementation's digest, so a row that
   * arrives without the code it was published with would shadow its own page
   * (§14.4): those rows keep mirroring even when the policy would skip them.
   */
  alreadyMirrored?: (slugs: string[]) => Promise<Set<string>>
}

/** Submission ids per code-mirroring request; blobs average tens of KB. */
const CODE_BATCH = 50
const FETCH_SPACING_MS = 50
const RETRY_DELAY_MS = 15_000
// The first filter query per config builds a DuckDB index upstream — several
// minutes of 500s is normal, and cold indexes across many boards have been
// observed to need 15+ (2026-08-20), so the budget is deliberately generous:
// 30 minutes at the same polite 15s spacing. Once the index is warm every
// later batch answers first time, so the budget only costs a cold start.
const RETRY_ATTEMPTS = 120

const isOversize = (error: unknown) =>
  error instanceof Error && error.message.includes("exceeds")

const pause = () =>
  new Promise((resolve) => setTimeout(resolve, FETCH_SPACING_MS))

/** datasets-server returns 500 while building a query's index; retry it.
 * An oversized response is deterministic — surface it immediately so the
 * caller can shrink the batch instead of burning the retry budget. */
async function fetchWithRetry(locator: string): Promise<FetchedSnapshot> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchSnapshot(locator)
    } catch (error) {
      if (isOversize(error) || attempt >= RETRY_ATTEMPTS) throw error
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }
}

function collect<T>(data: GmImportData, outcome: GmParseOutcome<T>): T[] {
  data.issues.push(...outcome.issues)
  data.driftWarnings.push(...outcome.driftWarnings)
  return outcome.values
}

function filterUrl(config: string, query: string): string {
  return `${DATASETS_SERVER}/filter?dataset=${encodeURIComponent(DATASET)}&config=${config}&split=train&${query}`
}

function candidateFromSubmission(
  row: GmSubmissionRow,
  board: GmLeaderboard,
): GmCandidate | null {
  if (
    row.run_passed !== true ||
    row.run_mode !== "leaderboard" ||
    typeof row.run_score !== "number" ||
    row.run_score <= 0
  ) {
    return null
  }
  return {
    submissionId: row.submission_id,
    userId: String(row.user_id),
    submissionTime: row.submission_time,
    fileName: row.file_name ?? null,
    score: row.run_score,
    code: row.code ?? null,
    runner: row.run_system_info?.gpu ?? (board.gpu_types ?? [])[0] ?? "unknown",
    raw: row,
  }
}

function candidateFromFlat(row: GmFlatRow): GmCandidate | null {
  if (
    row.passed !== true ||
    row.mode !== "leaderboard" ||
    typeof row.score !== "number" ||
    row.score <= 0
  ) {
    return null
  }
  return {
    submissionId: row.submission_id,
    userId: String(row.user_id),
    submissionTime: row.submission_time,
    fileName: row.file_name ?? null,
    score: row.score,
    code: row.code ?? null,
    runner: row.runner ?? "unknown",
    raw: row,
  }
}

/** A score under the physical floor is not a measurement, and per-shape
 * evidence must unfold, or the submission carries no measurement. */
export function validCandidate(
  problem: CuratedProblem,
  candidate: GmCandidate,
) {
  if (candidate.score < MIN_SCORE_S) return false
  if (problem.scoring === "aggregate") return true
  try {
    const raw = candidate.raw as GmSubmissionRow
    if (!raw.run_result) return false
    parseRunResult(raw.run_result)
    return true
  } catch {
    return false
  }
}

/** Revision-pinned locator for one config's parquet shards (§14.3). */
async function parquetShards(
  data: GmImportData,
  configs: Set<string>,
): Promise<Map<string, string[]>> {
  const snapshot = await fetchSnapshot(PARQUET_REVISION_API)
  data.snapshots.push(snapshot)
  const revision = JSON.parse(snapshot.body) as {
    sha?: string
    siblings?: { rfilename: string }[]
  }
  if (!revision.sha) throw new Error(`${PARQUET_BRANCH} has no revision sha`)
  const shards = new Map<string, string[]>()
  for (const config of configs) {
    const files = (revision.siblings ?? [])
      .map((sibling) => sibling.rfilename)
      .filter(
        (file) =>
          file.startsWith(`${config}/train/`) && file.endsWith(".parquet"),
      )
      .sort()
    if (files.length === 0) {
      data.issues.push({
        locator: snapshot.locator,
        item: config,
        problem: "config has no parquet shard at the pinned revision",
      })
      continue
    }
    shards.set(
      config,
      files.map(
        (file) =>
          `https://huggingface.co/datasets/${DATASET}/resolve/${revision.sha}/${file}`,
      ),
    )
  }
  return shards
}

/** Every column but the mirrored source, which is fetched per kept row. */
const lightColumns = (handle: ParquetHandle) =>
  handle.columns.filter((column) => column !== "code")

/** Stream one config's rows, keeping only what a curated board ranks on. */
async function readConfig(
  data: GmImportData,
  locators: string[],
  parse: (rows: unknown[], locator: string) => GmParseOutcome<unknown>,
  keep: (row: unknown, locator: string) => void,
): Promise<void> {
  for (const locator of locators) {
    const handle = await openParquet(locator)
    data.snapshots.push(handle.snapshot)
    for await (const { rows } of readParquetGroups(
      handle,
      lightColumns(handle),
    )) {
      for (const row of collect(data, parse(rows, locator))) {
        keep(row, locator)
      }
    }
  }
}

/** Each author's best submission in a selection; only these mirror source. */
function personalBests(selected: GmCandidate[]): GmCandidate[] {
  const best = new Map<string, GmCandidate>()
  for (const candidate of selected) {
    const current = best.get(candidate.userId)
    if (!current || candidate.score < current.score)
      best.set(candidate.userId, candidate)
  }
  return [...best.values()]
}

/**
 * Mirrored source for the kept rows, batched by submission id. Best effort by
 * design: the filter API is the only channel that can pluck scattered rows out
 * of a multi-gigabyte column, and when it is rebuilding its index the records
 * still import as reported-only rather than blocking the wave.
 */
async function hydrateCode(
  data: GmImportData,
  config: string,
  candidates: GmCandidate[],
): Promise<void> {
  const pending = candidates.filter((candidate) => candidate.code === null)
  const byId = new Map(pending.map((c) => [c.submissionId, c]))
  let batch = CODE_BATCH
  for (let start = 0; start < pending.length; ) {
    const slice = pending.slice(start, start + batch)
    // The filter API rejects IN lists; an OR chain is the accepted spelling.
    const ids = slice
      .map((candidate) => `"submission_id"=${candidate.submissionId}`)
      .join(" OR ")
    const locator = filterUrl(
      config,
      `where=${encodeURIComponent(ids)}&offset=0&length=${slice.length}`,
    )
    let snapshot: FetchedSnapshot
    try {
      snapshot = await fetchWithRetry(locator)
    } catch (error) {
      if (isOversize(error) && batch > 1) {
        batch = Math.max(1, batch >> 2)
        continue
      }
      data.issues.push({
        locator,
        item: `${config}/code`,
        problem: `source mirroring failed; ${slice.length} records import reported-only (${(error as Error).message})`,
      })
      start += slice.length
      continue
    }
    for (const { submissionId, code } of collect(
      data,
      parseCodeRows(snapshot.body, snapshot.locator),
    )) {
      const candidate = byId.get(submissionId)
      if (candidate) candidate.code = code
    }
    // Oversized bodies are digest-only in storage (§10.9); dropping the body
    // here too keeps a deep import's working set bounded.
    if (snapshot.sizeBytes > INLINE_BODY_LIMIT) snapshot.body = ""
    data.snapshots.push(snapshot)
    start += slice.length
    await pause()
  }
}

export async function discoverKernelbot(
  options: GmDiscoverOptions,
): Promise<GmImportData> {
  const data: GmImportData = {
    boards: [],
    snapshots: [],
    cohorts: [],
    discoveredRows: 0,
    invalidRows: 0,
    deferredRows: 0,
    issues: [],
    driftWarnings: [],
  }

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
          "leaderboard has no curated operation specification; curate it in problems/ before importing",
      })
    }
  }
  if (wanted.length === 0) return data

  const configs = new Set<string>(
    wanted.map((problem) =>
      problem.scoring === "per-shape" ? SUBMISSIONS_CONFIG : problem.config,
    ),
  )
  const perShape = wanted.some((problem) => problem.scoring === "per-shape")
  if (perShape) configs.add("leaderboards")
  const shards = await parquetShards(data, configs)

  // The leaderboards table only resolves per-shape boards; the flat configs
  // carry problem_name per row (and the upstream table is stale).
  const boards: GmLeaderboard[] = []
  if (perShape) {
    await readConfig(
      data,
      shards.get("leaderboards") ?? [],
      parseLeaderboardObjects,
      (row) => boards.push(row as GmLeaderboard),
    )
  }

  for (const config of configs) {
    if (config === "leaderboards") continue
    const problems = wanted.filter((problem) =>
      problem.scoring === "per-shape"
        ? config === SUBMISSIONS_CONFIG
        : problem.config === config,
    )
    if (problems.length === 0) continue

    // Board identity per row: per-shape rows carry a leaderboard id, flat
    // rows carry the board name.
    const byBoardId = new Map<number, CuratedProblem>()
    const byBoardName = new Map<string, CuratedProblem>()
    for (const problem of problems) {
      if (problem.scoring !== "per-shape") {
        byBoardName.set(problem.leaderboard, problem)
        continue
      }
      const board = boards.find((entry) => entry.name === problem.leaderboard)
      if (!board) {
        data.issues.push({
          locator: "leaderboards",
          item: problem.leaderboard,
          problem: "curated leaderboard not present in the leaderboards table",
        })
        continue
      }
      byBoardId.set(board.id, problem)
    }

    const candidates = new Map<string, GmCandidate[]>()
    const uncurated = new Map<string, number>()
    const push = (problem: CuratedProblem, candidate: GmCandidate | null) => {
      if (candidate === null) return
      data.discoveredRows++
      // Curated runner labels are the review record for a board's fleets;
      // an unlisted one is reported for review, never minted silently.
      if (problem.gpus && !problem.gpus.includes(candidate.runner)) {
        const key = `${problem.leaderboard}/${candidate.runner}`
        uncurated.set(key, (uncurated.get(key) ?? 0) + 1)
        return
      }
      const bucket = candidates.get(problem.leaderboard)
      if (bucket) bucket.push(candidate)
      else candidates.set(problem.leaderboard, [candidate])
    }

    if (config === SUBMISSIONS_CONFIG && byBoardId.size > 0) {
      await readConfig(
        data,
        shards.get(config) ?? [],
        parseSubmissionObjects,
        (row) => {
          const submission = row as GmSubmissionRow
          const problem = byBoardId.get(submission.leaderboard_id)
          const board = boards.find(
            (entry) => entry.id === submission.leaderboard_id,
          )
          if (problem && board)
            push(problem, candidateFromSubmission(submission, board))
        },
      )
    } else {
      await readConfig(
        data,
        shards.get(config) ?? [],
        parseFlatObjects,
        (row) => {
          const flat = row as GmFlatRow
          const problem = byBoardName.get(flat.problem_name)
          if (problem) push(problem, candidateFromFlat(flat))
        },
      )
    }
    for (const [key, count] of uncurated) {
      data.driftWarnings.push(
        `${key}: ${count} passed rows on an uncurated runner label; add it to the board's gpus after review`,
      )
    }

    // A submission evaluated on several runners would give one page (its slug
    // is per-submission) two different hardware supports, so it is skipped
    // rather than published under whichever cohort reached it last. Rare and
    // board-specific: 9 of 5,026 trimul submissions, none elsewhere
    // (measured 2026-08-24). Separating implementation identity from the
    // runner is the real fix, and it would move every existing digest.
    for (const [leaderboard, rows] of candidates) {
      const runners = new Map<number, Set<string>>()
      for (const candidate of rows) {
        const seen = runners.get(candidate.submissionId)
        if (seen) seen.add(candidate.runner)
        else runners.set(candidate.submissionId, new Set([candidate.runner]))
      }
      const ambiguous = new Set(
        [...runners]
          .filter(([, seen]) => seen.size > 1)
          .map(([submissionId]) => submissionId),
      )
      if (ambiguous.size === 0) continue
      candidates.set(
        leaderboard,
        rows.filter((candidate) => !ambiguous.has(candidate.submissionId)),
      )
      data.driftWarnings.push(
        `${leaderboard}: ${ambiguous.size} submissions were evaluated on more than one runner; skipped, because one implementation page cannot state two hardware supports`,
      )
    }

    for (const problem of problems) {
      const rows = candidates.get(problem.leaderboard) ?? []
      if (rows.length === 0) continue
      const cohorts = new Map<string, GmCandidate[]>()
      const histories = new Map<string, GmCandidate[]>()
      for (const candidate of rows) {
        const cohort = cohorts.get(candidate.runner)
        if (cohort) cohort.push(candidate)
        else cohorts.set(candidate.runner, [candidate])
        const key = `${candidate.runner} ${candidate.userId}`
        const chain = histories.get(key)
        if (chain) chain.push(candidate)
        else histories.set(key, [candidate])
      }
      for (const chain of histories.values()) {
        chain.sort((a, b) => a.submissionTime.localeCompare(b.submissionTime))
      }

      const selectedByRunner = new Map<string, GmCandidate[]>()
      for (const [runner, cohort] of cohorts) {
        cohort.sort((a, b) => a.score - b.score)
        const selection = selectCohort({
          ranked: cohort,
          history: (userId) => histories.get(`${runner} ${userId}`) ?? [],
          runner,
          options,
          valid: (candidate) => validCandidate(problem, candidate),
        })
        data.invalidRows += selection.invalid
        if (selection.selected.length === 0) continue
        selectedByRunner.set(runner, selection.selected)
        data.cohorts.push({
          leaderboard: problem.leaderboard,
          runner,
          top: selection.top,
          progression: selection.progression,
          withCode: 0,
        })
      }
      if (selectedByRunner.size > 0)
        data.boards.push({ problem, cohorts: selectedByRunner })
    }
    // The population is only needed until its cohorts are chosen.
    candidates.clear()

    if (options.mirrorCode !== false) {
      const boards = data.boards.filter((board) =>
        board.problem.scoring === "per-shape"
          ? config === SUBMISSIONS_CONFIG
          : board.problem.config === config,
      )
      const mirror = new Map<number, GmCandidate>()
      for (const board of boards) {
        for (const selected of board.cohorts.values()) {
          for (const candidate of personalBests(selected)) {
            mirror.set(candidate.submissionId, candidate)
          }
        }
      }
      if (options.alreadyMirrored) {
        const rest = boards.flatMap((board) =>
          [...board.cohorts.values()].flatMap((selected) =>
            selected
              .filter((candidate) => !mirror.has(candidate.submissionId))
              .map((candidate) => ({
                candidate,
                slug: implementationSlug(
                  board.problem.leaderboard,
                  candidate.submissionId,
                ),
              })),
          ),
        )
        const known = await options.alreadyMirrored(
          rest.map((entry) => entry.slug),
        )
        for (const entry of rest) {
          if (known.has(entry.slug))
            mirror.set(entry.candidate.submissionId, entry.candidate)
        }
      }
      await hydrateCode(data, config, [...mirror.values()])
      // Mirrored source is part of an implementation's digest, so a row that
      // should carry it and does not is held back rather than published in a
      // degraded shape that a later, working run would then shadow (§14.4).
      const deferred = new Set(
        [...mirror.values()]
          .filter((candidate) => candidate.code === null)
          .map((candidate) => candidate.submissionId),
      )
      if (deferred.size > 0) {
        data.deferredRows += deferred.size
        for (const board of boards) {
          for (const [runner, selected] of board.cohorts) {
            board.cohorts.set(
              runner,
              selected.filter(
                (candidate) => !deferred.has(candidate.submissionId),
              ),
            )
          }
        }
        data.issues.push({
          locator: DATASETS_SERVER,
          item: `${config}/code`,
          problem: `${deferred.size} selected submissions were held back: their source could not be mirrored, and importing them without it would republish their pages under a new digest. Re-run once the filter index is warm.`,
        })
      }
    }
  }

  data.boards = data.boards.filter((board) =>
    [...board.cohorts.values()].some((selected) => selected.length > 0),
  )
  for (const stat of data.cohorts) {
    const board = data.boards.find(
      (entry) => entry.problem.leaderboard === stat.leaderboard,
    )
    stat.withCode = (board?.cohorts.get(stat.runner) ?? []).filter(
      (candidate) => candidate.code !== null && candidate.code.length > 0,
    ).length
  }
  data.driftWarnings = [...new Set(data.driftWarnings)]
  return data
}
