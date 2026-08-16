// serving-v1 policy (§11.1, §11.9): cohort key sensitivity, feasibility
// tiers, objective ranking with ties, and Pareto dominance.
import { describe, expect, it } from "vitest"
import {
  type Constraint,
  constraintOutcome,
  feasibility,
  metricSetKey,
  paretoFrontier,
  rankByObjective,
  type ServingCandidate,
  type ServingCohortParts,
  servingCohortKey,
} from "./serving.ts"

const PARTS: ServingCohortParts = {
  modelDigest: `sha256:${"a".repeat(64)}`,
  tokenizer: "ref-tokenizer",
  workloadDigest: `sha256:${"b".repeat(64)}`,
  protocolKey: "mlperf-loadgen/v6.0/unspecified/streaming/open_loop",
  topologyKey: "nvidia/H100/8x1/unspecified",
  qualityPolicy: "mlperf-closed-99",
  metricSetKey: "output_token_throughput_tps·reported",
}

const candidate = (
  runId: string,
  measurements: ServingCandidate["measurements"],
  declaredSlo: ServingCandidate["declaredSlo"] = [],
): ServingCandidate => ({ runId, measurements, declaredSlo })

const tps = (value: number) => ({
  metric: "output_token_throughput_tps",
  statistic: "reported",
  value,
  unit: "tokens/s",
})

describe("serving cohort key (§11.1)", () => {
  it("is stable, and every identity part separates cohorts", () => {
    expect(servingCohortKey(PARTS)).toBe(servingCohortKey({ ...PARTS }))
    for (const key of Object.keys(PARTS) as (keyof ServingCohortParts)[]) {
      const changed = { ...PARTS, [key]: `${PARTS[key]}-x` }
      expect(servingCohortKey(changed)).not.toBe(servingCohortKey(PARTS))
    }
  })

  it("metricSetKey is order-insensitive and deduplicated", () => {
    expect(
      metricSetKey([
        { metric: "ttft_ms", statistic: "p99" },
        { metric: "output_token_throughput_tps", statistic: "reported" },
        { metric: "ttft_ms", statistic: "p99" },
      ]),
    ).toBe("output_token_throughput_tps·reported,ttft_ms·p99")
  })
})

describe("feasibility (§11.9)", () => {
  const c: Constraint = { metric: "ttft_ms", operator: "<=", value: 500 }

  it("measured beats declared beats unknown", () => {
    const measured = candidate("m", [
      { metric: "ttft_ms", statistic: "p99", value: 450, unit: "ms" },
    ])
    expect(constraintOutcome(measured, c)).toEqual({
      state: "measured",
      satisfied: true,
      observed: 450,
    })

    const declared = candidate(
      "d",
      [tps(100)],
      [{ metric: "ttft_ms", statistic: "p99", operator: "<=", value: 450 }],
    )
    expect(constraintOutcome(declared, c)).toEqual({
      state: "declared",
      satisfied: true,
      bound: 450,
    })

    const unknown = candidate("u", [tps(100)])
    expect(constraintOutcome(unknown, c)).toEqual({ state: "unknown" })
    const result = feasibility(unknown, [c])
    expect(result.feasible).toBe(false)
    if (!result.feasible)
      expect(result.reasons).toEqual(["METRIC_NOT_REPORTED:ttft_ms"])
  })

  it("a declared bound looser than the request does not satisfy it", () => {
    const loose = candidate(
      "l",
      [tps(100)],
      [{ metric: "ttft_ms", statistic: "p99", operator: "<=", value: 2000 }],
    )
    const result = feasibility(loose, [c])
    expect(result.feasible).toBe(false)
    if (!result.feasible)
      expect(result.reasons).toEqual(["CONSTRAINT_UNSATISFIED:ttft_ms"])
  })
})

describe("objective ranking (§11.9)", () => {
  it("dense ranks with ties; unreported metrics rank null", () => {
    const ranked = rankByObjective(
      [
        candidate("a", [tps(500)]),
        candidate("b", [tps(700)]),
        candidate("c", [tps(700)]),
        candidate("d", [
          { metric: "ttft_ms", statistic: "p99", value: 100, unit: "ms" },
        ]),
      ],
      {
        direction: "maximize",
        metric: "output_token_throughput_tps",
        statistic: "reported",
      },
    )
    const byId = Object.fromEntries(ranked.map((r) => [r.runId, r.rank]))
    expect(byId).toEqual({ b: 1, c: 1, a: 3, d: null })
  })
})

describe("pareto frontier (§11.9)", () => {
  const point = (
    runId: string,
    throughput: number,
    ttft: number,
  ): ServingCandidate =>
    candidate(runId, [
      tps(throughput),
      { metric: "ttft_ms", statistic: "p99", value: ttft, unit: "ms" },
    ])

  it("keeps the non-dominated set over shared axes", () => {
    // fast-low, slow-high: both on the frontier; strictly worse: dominated.
    const { frontier, dominated } = paretoFrontier([
      point("fast_low", 400, 100),
      point("slow_high", 900, 800),
      point("worse", 300, 900),
      point("mid", 600, 400),
    ])
    expect(frontier.sort()).toEqual(["fast_low", "mid", "slow_high"])
    expect(dominated).toEqual(["worse"])
  })

  it("flags candidates missing axes others measured", () => {
    const { frontier, notComparable } = paretoFrontier([
      point("full", 500, 200),
      candidate("throughput_only", [tps(999)]),
    ])
    // The shared axis set is throughput only; the frontier ranks on it,
    // and the missing ttft axis is named on every candidate lacking it.
    expect(frontier).toContain("throughput_only")
    expect(notComparable).toEqual(
      [
        { runId: "full", missing: [] },
        { runId: "throughput_only", missing: ["ttft_ms·p99"] },
      ].filter((entry) => entry.missing.length > 0),
    )
  })

  it("degenerates to a single-axis best when only one axis is shared", () => {
    const { frontier } = paretoFrontier([
      candidate("a", [tps(100)]),
      candidate("b", [tps(200)]),
    ])
    expect(frontier).toEqual(["b"])
  })
})
