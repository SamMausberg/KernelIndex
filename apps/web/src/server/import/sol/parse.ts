// Parsing SOL snapshots into typed upstream objects. Invalid items become
// structured issues (quarantined in the review report); unknown upstream
// fields become drift warnings (§14.8).
import type { z } from "zod"
import {
  type SolDefinition,
  type SolKernelSummary,
  type SolSolution,
  type SolSubmission,
  type SolTrace,
  type SolWorkloadEntry,
  solDefinition,
  solKernelSummary,
  solSolution,
  solSubmission,
  solTrace,
  solWorkloadEntry,
  unknownKeys,
} from "./types.ts"

export type ImportIssue = { locator: string; item: string; problem: string }

export type ParseOutcome<T> = {
  values: T[]
  issues: ImportIssue[]
  driftWarnings: string[]
}

function parseItems<S extends z.ZodObject>(
  schema: S,
  rawItems: unknown[],
  locator: string,
  label: string,
): ParseOutcome<z.output<S>> {
  const outcome: ParseOutcome<z.output<S>> = {
    values: [],
    issues: [],
    driftWarnings: [],
  }
  const knownKeys = Object.keys(schema.shape)
  for (const [index, raw] of rawItems.entries()) {
    const result = schema.safeParse(raw)
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
    if (typeof raw === "object" && raw !== null) {
      for (const key of unknownKeys(
        raw as Record<string, unknown>,
        knownKeys,
      )) {
        outcome.driftWarnings.push(
          `${label}: unknown upstream field '${key}' (${locator})`,
        )
      }
    }
    outcome.values.push(result.data)
  }
  outcome.driftWarnings = [...new Set(outcome.driftWarnings)]
  return outcome
}

function jsonBody(body: string, locator: string): unknown {
  try {
    return JSON.parse(body)
  } catch (error) {
    throw new Error(`${locator}: invalid JSON (${(error as Error).message})`)
  }
}

/** API responses arrive as {"data": ...}; local files are bare. */
function unwrap(document: unknown): unknown {
  if (typeof document === "object" && document !== null && "data" in document) {
    return (document as { data: unknown }).data
  }
  return document
}

export function parseDefinition(
  body: string,
  locator: string,
): ParseOutcome<SolDefinition> {
  return parseItems(
    solDefinition,
    [unwrap(jsonBody(body, locator))],
    locator,
    "definition",
  )
}

export function parseWorkloadJsonl(
  body: string,
  locator: string,
): ParseOutcome<SolWorkloadEntry> {
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => jsonBody(line, locator))
  return parseItems(solWorkloadEntry, lines, locator, "workload")
}

export function parseSolution(
  body: string,
  locator: string,
): ParseOutcome<SolSolution> {
  return parseItems(solSolution, [jsonBody(body, locator)], locator, "solution")
}

/** Traces arrive as one JSON object, a JSON array, or JSONL. */
export function parseTraces(
  body: string,
  locator: string,
): ParseOutcome<SolTrace> {
  const trimmed = body.trim()
  let rawItems: unknown[]
  if (trimmed.startsWith("[")) {
    rawItems = jsonBody(trimmed, locator) as unknown[]
  } else if (trimmed.startsWith("{") && !trimmed.includes("\n{")) {
    rawItems = [jsonBody(trimmed, locator)]
  } else {
    rawItems = trimmed
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .map((line) => jsonBody(line, locator))
  }
  return parseItems(solTrace, rawItems, locator, "trace")
}

export function parseKernelList(
  body: string,
  locator: string,
): ParseOutcome<SolKernelSummary> {
  const data = unwrap(jsonBody(body, locator)) as { kernels?: unknown[] }
  return parseItems(solKernelSummary, data.kernels ?? [], locator, "kernel")
}

export function parseKernelDetail(
  body: string,
  locator: string,
): ParseOutcome<SolDefinition> {
  return parseItems(
    solDefinition,
    [unwrap(jsonBody(body, locator))],
    locator,
    "kernelDetail",
  )
}

export function parseSubmissions(
  body: string,
  locator: string,
): ParseOutcome<SolSubmission> {
  const data = unwrap(jsonBody(body, locator)) as { submissions?: unknown[] }
  return parseItems(
    solSubmission,
    data.submissions ?? [],
    locator,
    "submission",
  )
}
