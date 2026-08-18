// Discovery (§14.1): pin the CSV to the latest commit that touched it via
// the GitHub API, then fetch and parse it at that immutable revision. Both
// responses are snapshotted (§14.3).
import { type FetchedSnapshot, fetchSnapshot } from "../fetch.ts"
import type { ImportIssue } from "../sol/parse.ts"
import { CSV_PATH, LIGER_REPO, type LigerRow, ligerRow } from "./types.ts"

export type LigerImportData = {
  commit: string
  rows: LigerRow[]
  snapshots: FetchedSnapshot[]
  issues: ImportIssue[]
  driftWarnings: string[]
}

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF or LF.
 * The upstream CSV embeds JSON config objects inside quoted fields. */
export function parseCsv(body: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let index = 0; index < body.length; index++) {
    const char = body[index]
    if (quoted) {
      if (char === '"') {
        if (body[index + 1] === '"') {
          field += '"'
          index++
        } else quoted = false
      } else field += char
    } else if (char === '"') quoted = true
    else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && body[index + 1] === "\n") index++
      row.push(field)
      field = ""
      if (row.length > 1 || row[0] !== "") rows.push(row)
      row = []
    } else field += char
  }
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** Header + records → validated rows; header drift becomes review issues. */
export function parseRows(
  body: string,
  locator: string,
): { rows: LigerRow[]; issues: ImportIssue[]; driftWarnings: string[] } {
  const issues: ImportIssue[] = []
  const driftWarnings: string[] = []
  const table = parseCsv(body)
  const header = table[0]
  if (!header) {
    return {
      rows: [],
      issues: [{ locator, item: "csv", problem: "empty" }],
      driftWarnings,
    }
  }
  const expected = Object.keys(ligerRow.shape)
  for (const column of expected) {
    if (!header.includes(column)) {
      issues.push({
        locator,
        item: "header",
        problem: `expected column '${column}' is missing`,
      })
    }
  }
  for (const column of header) {
    if (!expected.includes(column))
      driftWarnings.push(`unexpected CSV column '${column}'`)
  }
  if (issues.length > 0) return { rows: [], issues, driftWarnings }

  const rows: LigerRow[] = []
  for (const [index, record] of table.slice(1).entries()) {
    if (record.length !== header.length) {
      issues.push({
        locator,
        item: `row ${index + 2}`,
        problem: `expected ${header.length} fields, found ${record.length}`,
      })
      continue
    }
    const parsed = ligerRow.safeParse(
      Object.fromEntries(header.map((column, at) => [column, record[at]])),
    )
    if (parsed.success) rows.push(parsed.data)
    else
      issues.push({
        locator,
        item: `row ${index + 2}`,
        problem: parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      })
  }
  return { rows, issues, driftWarnings }
}

export async function discoverLiger(): Promise<LigerImportData> {
  const data: LigerImportData = {
    commit: "",
    rows: [],
    snapshots: [],
    issues: [],
    driftWarnings: [],
  }

  const commits = await fetchSnapshot(
    `https://api.github.com/repos/${LIGER_REPO}/commits?path=${encodeURIComponent(CSV_PATH)}&per_page=1`,
  )
  data.snapshots.push(commits)
  const listed = JSON.parse(commits.body) as { sha?: string }[]
  const sha = Array.isArray(listed) ? listed[0]?.sha : undefined
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) {
    data.issues.push({
      locator: commits.locator,
      item: "commit",
      problem: "could not resolve the latest commit touching the CSV",
    })
    return data
  }
  data.commit = sha

  const csv = await fetchSnapshot(
    `https://raw.githubusercontent.com/${LIGER_REPO}/${sha}/${CSV_PATH}`,
  )
  data.snapshots.push(csv)
  const outcome = parseRows(csv.body, csv.locator)
  data.rows = outcome.rows
  data.issues.push(...outcome.issues)
  data.driftWarnings.push(...new Set(outcome.driftWarnings))
  return data
}
