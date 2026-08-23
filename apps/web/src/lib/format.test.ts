import { describe, expect, it } from "vitest"
import {
  formatLatency,
  formatMargin,
  formatRelative,
  formatSpeedup,
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

describe("record margins", () => {
  it("carries the minus sign itself, so no call site prefixes one", () => {
    expect(formatMargin(8.8)).toBe("−8.8%")
    expect(formatSpeedup(8.8)).toBe("8.8% faster")
  })

  // A record exists because it beat what came before. A non-positive margin
  // is a defect upstream, and every surface must state nothing rather than
  // render "−-8.8%" or call a regression an improvement.
  it("states nothing for a margin that is not an improvement", () => {
    for (const pct of [-8.8, 0, null, undefined, Number.NaN]) {
      expect(formatMargin(pct)).toBeNull()
      expect(formatSpeedup(pct)).toBeNull()
    }
  })
})
