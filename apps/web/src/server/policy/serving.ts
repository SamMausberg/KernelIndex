// Serving comparability and resolution policy (§11.1, §11.9 — serving-v1).
// Pure functions, deliberately separate from kernel comparison keys: serving
// never shares a run table, comparison key, or universal score with kernels
// (§1 decision 16). Two serving results compare only inside one cohort key;
// without an objective the resolver returns the Pareto frontier.
import canonicalizeModule from "canonicalize"
import { sha256Digest } from "../identity/digest.ts"

const canonicalize = canonicalizeModule as unknown as (
  value: unknown,
) => string | undefined

export const SERVING_POLICY_VERSION = "serving-v1"

/** The §11.9/§12.7 metric vocabulary with optimization direction. */
export const SERVING_METRICS: Record<
  string,
  { unit: string; direction: "min" | "max" }
> = {
  ttft_ms: { unit: "ms", direction: "min" },
  tpot_ms: { unit: "ms", direction: "min" },
  itl_ms: { unit: "ms", direction: "min" },
  e2e_latency_ms: { unit: "ms", direction: "min" },
  request_throughput_rps: { unit: "req/s", direction: "max" },
  output_token_throughput_tps: { unit: "tokens/s", direction: "max" },
  token_throughput_tps: { unit: "tokens/s", direction: "max" },
  goodput: { unit: "tokens/s", direction: "max" },
  error_rate: { unit: "ratio", direction: "min" },
}

/** The seven §11.1 cohort identity parts. Everything else — configuration
 * and stack revision — is what competes inside the cohort. */
export type ServingCohortParts = {
  modelDigest: string
  tokenizer: string | null
  workloadDigest: string
  /** Harness + version + placement + streaming + load generation. */
  protocolKey: string
  /** Vendor + model + per-node + nodes + interconnect. */
  topologyKey: string
  qualityPolicy: string
  metricSetKey: string
}

export function servingCohortKey(parts: ServingCohortParts): string {
  const canonical = canonicalize(parts)
  if (canonical === undefined) throw new Error("uncanonicalizable cohort")
  return sha256Digest(canonical)
}

export function servingProtocolKey(input: {
  harnessName: string
  harnessVersion: string
  placement: string | null
  streaming: boolean
  loadGeneration: string
}): string {
  return [
    input.harnessName,
    input.harnessVersion,
    input.placement ?? "unspecified",
    input.streaming ? "streaming" : "non_streaming",
    input.loadGeneration,
  ].join("/")
}

export function servingTopologyKey(input: {
  acceleratorVendor: string | null
  acceleratorModel: string
  acceleratorsPerNode: number
  nodeCount: number
  interconnect: string | null
}): string {
  return [
    input.acceleratorVendor ?? "unknown",
    input.acceleratorModel,
    `${input.acceleratorsPerNode}x${input.nodeCount}`,
    input.interconnect ?? "unspecified",
  ].join("/")
}

/** Sorted metric·statistic pairs: results compare only when they measured
 * the same things the same way (§11.1 metric definition set). */
export function metricSetKey(
  measurements: { metric: string; statistic: string }[],
): string {
  return [...new Set(measurements.map((m) => `${m.metric}·${m.statistic}`))]
    .sort()
    .join(",")
}

export type ServingCandidate = {
  runId: string
  measurements: {
    metric: string
    statistic: string
    value: number
    unit: string
  }[]
  /** Declared harness-enforced bounds from the workload (cited, not measured). */
  declaredSlo: {
    metric: string
    statistic: string
    operator: string
    value: number
  }[]
}

export type Constraint = {
  metric: string
  statistic?: string
  operator: "<=" | "<"
  value: number
}

export type ConstraintOutcome =
  | { state: "measured"; satisfied: boolean; observed: number }
  | { state: "declared"; satisfied: boolean; bound: number }
  | { state: "unknown" }

/**
 * One constraint against one candidate: a measured value decides; else a
 * declared harness bound at or under the requested bound satisfies it
 * ("the harness enforced at least this"); else the metric is unreported and
 * the candidate is excluded with METRIC_NOT_REPORTED — never assumed.
 */
export function constraintOutcome(
  candidate: ServingCandidate,
  constraint: Constraint,
): ConstraintOutcome {
  const statistic = constraint.statistic ?? "p99"
  const measured = candidate.measurements.find(
    (m) => m.metric === constraint.metric && m.statistic === statistic,
  )
  if (measured) {
    const satisfied =
      constraint.operator === "<"
        ? measured.value < constraint.value
        : measured.value <= constraint.value
    return { state: "measured", satisfied, observed: measured.value }
  }
  const declared = candidate.declaredSlo.find(
    (bound) =>
      bound.metric === constraint.metric && bound.statistic === statistic,
  )
  if (declared)
    return {
      state: "declared",
      satisfied: declared.value <= constraint.value,
      bound: declared.value,
    }
  return { state: "unknown" }
}

export type Feasibility =
  | { feasible: true; outcomes: Record<string, ConstraintOutcome> }
  | {
      feasible: false
      reasons: string[]
      outcomes: Record<string, ConstraintOutcome>
    }

export function feasibility(
  candidate: ServingCandidate,
  constraints: Constraint[],
): Feasibility {
  const outcomes: Record<string, ConstraintOutcome> = {}
  const reasons: string[] = []
  for (const constraint of constraints) {
    const outcome = constraintOutcome(candidate, constraint)
    outcomes[
      `${constraint.metric} ${constraint.operator} ${constraint.value}`
    ] = outcome
    if (outcome.state === "unknown")
      reasons.push(`METRIC_NOT_REPORTED:${constraint.metric}`)
    else if (!outcome.satisfied)
      reasons.push(`CONSTRAINT_UNSATISFIED:${constraint.metric}`)
  }
  return reasons.length === 0
    ? { feasible: true, outcomes }
    : { feasible: false, reasons, outcomes }
}

export type Objective = {
  direction: "maximize" | "minimize"
  metric: string
  statistic?: string
}

/**
 * Dense ranks by the objective inside one cohort; equal values tie.
 * Candidates missing the objective metric rank null with a reason — the
 * list never silently drops them.
 */
export function rankByObjective(
  candidates: ServingCandidate[],
  objective: Objective,
): { runId: string; rank: number | null; value: number | null }[] {
  const statistic =
    objective.statistic ??
    (SERVING_METRICS[objective.metric]?.direction === "min" ? "p99" : "mean")
  const valued = candidates.map((candidate) => ({
    runId: candidate.runId,
    value:
      candidate.measurements.find(
        (m) => m.metric === objective.metric && m.statistic === statistic,
      )?.value ?? null,
  }))
  const ranked = valued
    .filter(
      (entry): entry is { runId: string; value: number } =>
        entry.value !== null,
    )
    .sort((a, b) =>
      objective.direction === "maximize"
        ? b.value - a.value
        : a.value - b.value,
    )
  const ranks = new Map<string, number>()
  let rank = 0
  let previous: number | null = null
  for (const [index, entry] of ranked.entries()) {
    if (previous === null || entry.value !== previous) rank = index + 1
    ranks.set(entry.runId, rank)
    previous = entry.value
  }
  return valued.map((entry) => ({
    ...entry,
    rank: ranks.get(entry.runId) ?? null,
  }))
}

/**
 * Non-dominated set over the metric axes every candidate in the cohort
 * shares (direction from the vocabulary). Candidates missing a shared axis
 * come back as notComparable with the missing axes named. O(n²) is fine at
 * catalog scale.
 */
export function paretoFrontier(candidates: ServingCandidate[]): {
  frontier: string[]
  dominated: string[]
  notComparable: { runId: string; missing: string[] }[]
} {
  const axisOf = (m: { metric: string; statistic: string }) =>
    `${m.metric}·${m.statistic}`
  const known = (m: { metric: string }) =>
    SERVING_METRICS[m.metric] !== undefined
  const axisSets = candidates.map(
    (candidate) => new Set(candidate.measurements.filter(known).map(axisOf)),
  )
  const shared = [...(axisSets[0] ?? new Set<string>())].filter((axis) =>
    axisSets.every((set) => set.has(axis)),
  )
  // Union minus shared = axes some candidate is missing.
  const union = new Set(axisSets.flatMap((set) => [...set]))
  const missingAxes = [...union].filter((axis) => !shared.includes(axis))

  const comparable: { runId: string; point: number[] }[] = []
  const notComparable: { runId: string; missing: string[] }[] = []
  for (const candidate of candidates) {
    const axes = new Set(candidate.measurements.filter(known).map(axisOf))
    const missing = missingAxes.filter((axis) => !axes.has(axis))
    if (shared.length === 0) {
      notComparable.push({ runId: candidate.runId, missing: [...union] })
      continue
    }
    // Normalize every axis to "higher is better" for dominance checks.
    const point = shared.map((axis) => {
      const [metric, statistic] = axis.split("·")
      const measurement = candidate.measurements.find(
        (m) => m.metric === metric && m.statistic === statistic,
      )
      if (!measurement) throw new Error("unreachable: shared axis missing")
      return SERVING_METRICS[metric].direction === "max"
        ? measurement.value
        : -measurement.value
    })
    if (missing.length > 0)
      notComparable.push({ runId: candidate.runId, missing })
    comparable.push({ runId: candidate.runId, point })
  }

  const dominates = (a: number[], b: number[]) =>
    a.every((value, index) => value >= b[index]) &&
    a.some((value, index) => value > b[index])
  const frontier: string[] = []
  const dominated: string[] = []
  for (const candidate of comparable) {
    if (
      comparable.some(
        (other) =>
          other.runId !== candidate.runId &&
          dominates(other.point, candidate.point),
      )
    )
      dominated.push(candidate.runId)
    else frontier.push(candidate.runId)
  }
  return { frontier, dominated, notComparable }
}
