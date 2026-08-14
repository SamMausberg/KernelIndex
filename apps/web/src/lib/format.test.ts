import { describe, expect, it } from "vitest"
import { formatLatency, formatRelative, formatSpread } from "./format"

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
