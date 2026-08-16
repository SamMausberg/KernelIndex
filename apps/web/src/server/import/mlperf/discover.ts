// Discovery (§14.1): one pinned summary_results.json per round through the
// restricted fetcher, filtered to the import scope — closed division,
// datacenter suite, token-throughput LLM benchmarks. Out-of-scope rows are
// counted by reason, never errors; malformed in-scope rows quarantine.
import { type FetchedSnapshot, fetchSnapshot } from "../fetch.ts"
import type { ImportIssue } from "../sol/parse.ts"
import {
  BENCHMARKS,
  type MlperfRound,
  type MlperfRow,
  mlperfRow,
  ROUNDS,
} from "./types.ts"

export type MlperfImportData = {
  rounds: { round: MlperfRound; rows: MlperfRow[] }[]
  skipped: Record<string, number>
  snapshots: FetchedSnapshot[]
  issues: ImportIssue[]
  driftWarnings: string[]
}

const summaryUrl = (round: MlperfRound) =>
  `https://raw.githubusercontent.com/${round.repo}/${round.ref}/summary_results.json`

export type RowClassification =
  | { kind: "row"; row: MlperfRow }
  | { kind: "skip"; reason: string }
  | { kind: "issue"; problem: string }

/** Import scope per docs/source-policy.md; out-of-scope is a counted skip,
 * malformed in-scope is a quarantined issue. Pure, shared with the tests. */
export function classifyRow(entry: unknown): RowClassification {
  const scope = entry as Record<string, unknown>
  if (scope.Category !== "closed")
    return { kind: "skip", reason: "open_or_network_division" }
  if (scope.Suite !== "datacenter")
    return { kind: "skip", reason: "non_datacenter_suite" }
  if (BENCHMARKS[String(scope.Model)] === undefined)
    return { kind: "skip", reason: "non_llm_benchmark" }
  if (scope.Performance_Units !== "Tokens/s")
    return { kind: "skip", reason: "non_token_throughput_units" }
  // CPU-only submissions state no accelerator; a GPU index skips them.
  if (scope.Accelerator === "" || scope["a#"] === "")
    return { kind: "skip", reason: "no_accelerator" }
  const parsed = mlperfRow.safeParse(entry)
  if (!parsed.success)
    return {
      kind: "issue",
      problem: parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    }
  return { kind: "row", row: parsed.data }
}

export async function discoverMlperf(options: {
  rounds?: string[]
  limit?: number
}): Promise<MlperfImportData> {
  const data: MlperfImportData = {
    rounds: [],
    skipped: {},
    snapshots: [],
    issues: [],
    driftWarnings: [],
  }
  const skip = (reason: string) => {
    data.skipped[reason] = (data.skipped[reason] ?? 0) + 1
  }

  for (const round of ROUNDS) {
    if (options.rounds && !options.rounds.includes(round.round)) continue
    const snapshot = await fetchSnapshot(summaryUrl(round))
    data.snapshots.push(snapshot)
    let raw: unknown
    try {
      raw = JSON.parse(snapshot.body)
    } catch (error) {
      data.issues.push({
        locator: snapshot.locator,
        item: round.round,
        problem: `invalid JSON: ${(error as Error).message}`,
      })
      continue
    }
    if (!Array.isArray(raw)) {
      data.issues.push({
        locator: snapshot.locator,
        item: round.round,
        problem: "summary is not an array — upstream format drift",
      })
      continue
    }
    const rows: MlperfRow[] = []
    for (const [index, entry] of raw.entries()) {
      const outcome = classifyRow(entry)
      if (outcome.kind === "skip") {
        skip(outcome.reason)
        continue
      }
      if (outcome.kind === "issue") {
        data.issues.push({
          locator: snapshot.locator,
          item: `${round.round}[${index}]`,
          problem: outcome.problem,
        })
        continue
      }
      const row = outcome.row
      if (
        row.Scenario !== "Offline" &&
        BENCHMARKS[row.Model].slo[row.Scenario as "Server"] === undefined
      ) {
        // A scenario the rules table does not define for this benchmark.
        data.driftWarnings.push(
          `${round.round}: unexpected scenario '${row.Scenario}' for ${row.Model}`,
        )
      }
      rows.push(row)
      if (options.limit !== undefined && rows.length >= options.limit) break
    }
    data.rounds.push({ round, rows })
  }
  data.driftWarnings = [...new Set(data.driftWarnings)]
  return data
}
