import { describe, expect, it } from "vitest"
import { computeSweep, type SweepRun } from "./sweep.ts"

const CONSTANT = "proto|env|B200|latency:median:ns|bf16"
const AXES = new Map<string, Record<string, number | string>>([
  ["wl-1", { tokens: 1024, hidden: 4096 }],
  ["wl-2", { tokens: 2048, hidden: 4096 }],
  ["wl-4", { tokens: 4096, hidden: 4096 }],
  // Different held-constant axis: never part of the tokens sweep family.
  ["wl-other", { tokens: 2048, hidden: 8192 }],
])

const run = (
  workloadId: string,
  slug: string,
  value: number,
  constantKey = CONSTANT,
): SweepRun => ({
  workloadId,
  implementation: { name: slug, slug },
  value,
  constantKey,
})

const base = {
  anchorWorkloadId: "wl-2",
  anchorConstantKey: CONSTANT,
  environmentLabel: "NVIDIA B200",
  metricLabel: "latency · median",
  unit: "ns",
  lowerIsBetter: true,
  workloadAxes: AXES,
}

describe("computeSweep", () => {
  it("traces the one varying numeric axis and holds the rest constant", () => {
    const sweep = computeSweep({
      ...base,
      runs: [
        run("wl-1", "a", 4000),
        run("wl-2", "a", 8000),
        run("wl-4", "a", 16000),
        run("wl-other", "a", 9000),
        // Same workload measured twice: the better value wins.
        run("wl-2", "a", 7900),
        // Different environment: excluded entirely.
        run("wl-1", "a", 1, "other-env"),
      ],
    })
    expect(sweep?.axis).toBe("tokens")
    expect(sweep?.series).toEqual([
      {
        implementation: { name: "a", slug: "a" },
        points: [
          { x: 1024, value: 4000, workloadId: "wl-1" },
          { x: 2048, value: 7900, workloadId: "wl-2" },
          { x: 4096, value: 16000, workloadId: "wl-4" },
        ],
      },
    ])
  })

  it("drops single-point series and orders fastest first", () => {
    const sweep = computeSweep({
      ...base,
      runs: [
        run("wl-1", "slow", 9000),
        run("wl-2", "slow", 18000),
        run("wl-4", "slow", 36000),
        run("wl-1", "fast", 4000),
        run("wl-2", "fast", 8000),
        run("wl-2", "single", 1),
      ],
    })
    expect(sweep?.series.map((s) => s.implementation.slug)).toEqual([
      "fast",
      "slow",
    ])
  })

  it("returns null without three distinct measured axis values", () => {
    const sweep = computeSweep({
      ...base,
      runs: [run("wl-1", "a", 4000), run("wl-2", "a", 8000)],
    })
    expect(sweep).toBeNull()
  })

  it("caps series and reports the overflow", () => {
    const runs = ["a", "b", "c", "d", "e", "f", "g"].flatMap((slug, i) => [
      run("wl-1", slug, 1000 + i),
      run("wl-2", slug, 2000 + i),
      run("wl-4", slug, 4000 + i),
    ])
    const sweep = computeSweep({ ...base, runs })
    expect(sweep?.series).toHaveLength(5)
    expect(sweep?.overflow).toBe(2)
  })
})
