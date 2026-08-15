// Parsing datasets-server responses into typed rows plus unfolding the
// flattened run_result benchmark map. Invalid items become structured issues;
// unknown fields become drift warnings (§14.8).
import type { z } from "zod"
import {
  type GmBenchmark,
  type GmLeaderboard,
  type GmSubmissionRow,
  gmLeaderboard,
  gmSubmissionRow,
} from "./types.ts"

export type GmParseOutcome<T> = {
  values: T[]
  issues: { locator: string; item: string; problem: string }[]
  driftWarnings: string[]
}

function parseRows<S extends z.ZodType>(
  schema: S,
  body: string,
  locator: string,
  label: string,
): GmParseOutcome<z.output<S>> {
  const outcome: GmParseOutcome<z.output<S>> = {
    values: [],
    issues: [],
    driftWarnings: [],
  }
  let document: { rows?: { row: unknown; truncated_cells?: string[] }[] }
  try {
    document = JSON.parse(body)
  } catch (error) {
    outcome.issues.push({
      locator,
      item: label,
      problem: `invalid JSON (${(error as Error).message})`,
    })
    return outcome
  }
  for (const [index, entry] of (document.rows ?? []).entries()) {
    if ((entry.truncated_cells ?? []).length > 0) {
      outcome.driftWarnings.push(
        `${label}: datasets-server truncated cells ${entry.truncated_cells?.join(", ")} (${locator})`,
      )
    }
    const result = schema.safeParse(entry.row)
    if (!result.success) {
      outcome.issues.push({
        locator,
        item: `${label}[${index}]`,
        problem: result.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      })
      continue
    }
    outcome.values.push(result.data)
  }
  return outcome
}

export function parseLeaderboards(
  body: string,
  locator: string,
): GmParseOutcome<GmLeaderboard> {
  return parseRows(gmLeaderboard, body, locator, "leaderboard")
}

export function parseSubmissionRows(
  body: string,
  locator: string,
): GmParseOutcome<GmSubmissionRow> {
  return parseRows(gmSubmissionRow, body, locator, "submission")
}

/** "k: 7168; m: 1024; n: 1536; seed: 8135" → integer axis bindings. */
export function parseBenchmarkSpec(spec: string): Record<string, number> {
  const axes: Record<string, number> = {}
  for (const part of spec.split(";")) {
    const match = part.trim().match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(-?\d+)$/)
    if (!match)
      throw new Error(`unparseable benchmark spec entry '${part.trim()}'`)
    axes[match[1].toLowerCase()] = Number(match[2])
  }
  if (Object.keys(axes).length === 0)
    throw new Error(`empty benchmark spec '${spec}'`)
  return axes
}

/** Unfold run_result's flattened benchmark.N.* map into typed benchmarks. */
export function parseRunResult(
  runResult: Record<string, unknown>,
): GmBenchmark[] {
  const count = Number(runResult["benchmark-count"])
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`missing or invalid benchmark-count`)
  }
  const benchmarks: GmBenchmark[] = []
  for (let index = 0; index < count; index++) {
    const field = (key: string) => runResult[`benchmark.${index}.${key}`]
    const numeric = (key: string): number => {
      const value = Number(field(key))
      if (!Number.isFinite(value) || value <= 0)
        throw new Error(`benchmark.${index}.${key} is not a positive number`)
      return value
    }
    const optional = (key: string): number | null => {
      const value = Number(field(key))
      return Number.isFinite(value) && value > 0 ? value : null
    }
    const spec = field("spec")
    if (typeof spec !== "string")
      throw new Error(`benchmark.${index}.spec is missing`)
    const std = Number(field("std"))
    const runs = Number(field("runs"))
    benchmarks.push({
      index,
      axes: parseBenchmarkSpec(spec),
      meanNs: numeric("mean"),
      bestNs: optional("best"),
      worstNs: optional("worst"),
      stdNs: Number.isFinite(std) && std >= 0 ? std : null,
      runs: Number.isInteger(runs) && runs > 0 ? runs : null,
    })
  }
  return benchmarks
}
