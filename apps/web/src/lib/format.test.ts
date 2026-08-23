import { describe, expect, it } from "vitest"
import {
  countNoun,
  formatImprovement,
  formatLatency,
  formatRelative,
  formatSpread,
} from "./format"

describe("formatLatency", () => {
  it("keeps sub-microsecond values in nanoseconds", () => {
    expect(formatLatency(984)).toBe("984 ns")
  })

  it("uses two decimals under 10 and one above", () => {
    expect(formatLatency(7810)).toBe("7.81 µs")
    expect(formatLatency(41300)).toBe("41.3 µs")
    expect(formatLatency(118200)).toBe("118.2 µs")
    expect(formatLatency(1_420_000)).toBe("1.42 ms")
  })
})

describe("formatSpread", () => {
  it("scales the half-width interval to the display unit", () => {
    expect(
      formatSpread({
        metric: "latency",
        unit: "ns",
        statistic: "median",
        value: 7810,
        sampleCount: 200,
        uncertainty: { low: 7788, high: 7841 },
      }),
    ).toBe("±0.03")
  })
})

describe("formatRelative", () => {
  const primary = (value: number) => ({
    metric: "latency",
    unit: "ns",
    statistic: "median",
    value,
    sampleCount: null,
    uncertainty: null,
  })

  it("is a ratio against the cohort leader", () => {
    expect(formatRelative(primary(7940), primary(7810))).toBe("1.02×")
    expect(formatRelative(null, primary(7810))).toBe("—")
  })
})

describe("countNoun", () => {
  it("spells the plural, rather than appending s to anything", () => {
    expect(countNoun(300, "entry")).toBe("300 entries")
    expect(countNoun(1, "entry")).toBe("1 entry")
    expect(countNoun(2, "match")).toBe("2 matches")
    expect(countNoun(3, "cohort")).toBe("3 cohorts")
    expect(countNoun(2, "GPU")).toBe("2 GPUs")
    expect(countNoun(1200, "run")).toBe("1,200 runs")
  })
})

describe("record margins", () => {
  // One notation, stated in words. A bare "−8.8%" reads as easily as a
  // regression as an improvement, and no call site can prefix a sign of its
  // own, which is what produced "−-8.8%".
  it("states the direction rather than implying it with a sign", () => {
    expect(formatImprovement(8.8)).toBe("8.8% faster")
    expect(formatImprovement(22)).toBe("22.0% faster")
  })

  // A record exists because it beat what came before. A non-positive margin
  // is a defect upstream, and every surface must state nothing rather than
  // call a regression an improvement.
  it("states nothing for a margin that is not an improvement", () => {
    for (const pct of [-8.8, 0, null, undefined, Number.NaN])
      expect(formatImprovement(pct)).toBeNull()
  })
})
