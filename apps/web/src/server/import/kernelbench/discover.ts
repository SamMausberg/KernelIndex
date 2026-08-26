// Discovery (§14.1): pin everything to the latest commit that touched the
// timing results via the GitHub API, then fetch the four timing files and
// every problem module they name at that immutable revision. Each response
// is snapshotted (§14.3); a file that fails to parse is an issue, and a
// problem that cannot be fetched is skipped with one.
import { type FetchedSnapshot, fetchSnapshot } from "../fetch.ts"
import type { ImportIssue } from "../sol/parse.ts"
import {
  KB_REPO,
  type KbTiming,
  LEVELS,
  type Level,
  MACHINES,
  MODES,
  PROBLEMS_PATH,
  TIMING_PATH,
  timingFile,
} from "./types.ts"

export type KbImportData = {
  commit: string
  /** When the pinned commit landed: the runs' observation time. */
  observedAt: string
  timings: KbTiming[]
  /** `level/file` → module source, for every problem a timing names. */
  problems: Map<string, string>
  snapshots: FetchedSnapshot[]
  issues: ImportIssue[]
  driftWarnings: string[]
}

/** One timing file → its (machine, mode, level, problem) rows. */
export function parseTimingFile(
  body: string,
  locator: string,
  machine: string,
  mode: string,
): { timings: KbTiming[]; issues: ImportIssue[]; driftWarnings: string[] } {
  const issues: ImportIssue[] = []
  const driftWarnings: string[] = []
  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    return {
      timings: [],
      issues: [{ locator, item: "json", problem: "unparseable" }],
      driftWarnings,
    }
  }
  const parsed = timingFile.safeParse(raw)
  if (!parsed.success) {
    issues.push({
      locator,
      item: "timing",
      problem: parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    })
    return { timings: [], issues, driftWarnings }
  }
  for (const level of Object.keys(raw as object))
    if (!(LEVELS as readonly string[]).includes(level))
      driftWarnings.push(`unexpected level '${level}' in ${machine}/${mode}`)
  const timings: KbTiming[] = []
  for (const level of LEVELS)
    for (const [file, entry] of Object.entries(parsed.data[level] ?? {}))
      timings.push({ machine, mode, level, file, entry })
  return { timings, issues, driftWarnings }
}

const rawUrl = (commit: string, path: string) =>
  `https://raw.githubusercontent.com/${KB_REPO}/${commit}/${path}`

export async function discoverKernelBench(): Promise<KbImportData> {
  const data: KbImportData = {
    commit: "",
    observedAt: "",
    timings: [],
    problems: new Map(),
    snapshots: [],
    issues: [],
    driftWarnings: [],
  }
  const commits = await fetchSnapshot(
    `https://api.github.com/repos/${KB_REPO}/commits?path=${encodeURIComponent(TIMING_PATH)}&per_page=1`,
  )
  data.snapshots.push(commits)
  const listed = JSON.parse(commits.body) as {
    sha?: string
    commit?: { committer?: { date?: string } }
  }[]
  const head = Array.isArray(listed) ? listed[0] : undefined
  const date = head?.commit?.committer?.date
  if (!head?.sha || !/^[0-9a-f]{40}$/.test(head.sha) || !date) {
    data.issues.push({
      locator: commits.locator,
      item: "commit",
      problem: "could not resolve the latest commit touching the timings",
    })
    return data
  }
  data.commit = head.sha
  data.observedAt = new Date(date).toISOString()

  for (const machine of Object.keys(MACHINES)) {
    for (const mode of Object.keys(MODES)) {
      const snapshot = await fetchSnapshot(
        rawUrl(head.sha, `${TIMING_PATH}/${machine}/${mode}`),
      )
      data.snapshots.push(snapshot)
      const outcome = parseTimingFile(
        snapshot.body,
        snapshot.locator,
        machine,
        mode,
      )
      data.timings.push(...outcome.timings)
      data.issues.push(...outcome.issues)
      data.driftWarnings.push(...outcome.driftWarnings)
    }
  }

  const wanted = new Set(
    data.timings.map((timing) => `${timing.level}/${timing.file}`),
  )
  for (const key of [...wanted].sort()) {
    const [level, file] = key.split("/") as [Level, string]
    const locator = rawUrl(head.sha, `${PROBLEMS_PATH}/${level}/${file}`)
    try {
      const snapshot = await fetchSnapshot(locator)
      data.snapshots.push(snapshot)
      data.problems.set(key, snapshot.body)
    } catch (error) {
      data.issues.push({
        locator,
        item: key,
        problem: `problem module fetch failed (${(error as Error).message})`,
      })
    }
  }
  data.driftWarnings = [...new Set(data.driftWarnings)]
  return data
}
