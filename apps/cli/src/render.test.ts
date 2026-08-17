import { describe, expect, it } from "vitest"
import { formatPrimary, tableLines } from "./render.ts"

describe("formatPrimary", () => {
  it("rescales durations across the ns/µs/ms/s bands", () => {
    expect(formatPrimary({ value: 512, unit: "ns" })).toBe("512 ns")
    expect(formatPrimary({ value: 43_000, unit: "ns" })).toBe("43 µs")
    expect(formatPrimary({ value: 2.5, unit: "ms" })).toBe("2.50 ms")
    expect(formatPrimary({ value: 1.2, unit: "s" })).toBe("1.20 s")
    expect(formatPrimary({ value: 800, unit: "us" })).toBe("800 µs")
  })

  it("passes non-duration units through verbatim", () => {
    expect(formatPrimary({ value: 15_000, unit: "tokens/s" })).toBe(
      "15000 tokens/s",
    )
    expect(formatPrimary(null)).toBe("—")
  })
})

describe("tableLines", () => {
  it("pads columns to the widest cell and trims trailing space", () => {
    expect(
      tableLines([
        ["#", "implementation", "latency"],
        ["1", "flashinfer", "43 µs"],
      ]),
    ).toEqual(["#  implementation  latency", "1  flashinfer      43 µs"])
  })

  it("renders nothing for no rows", () => {
    expect(tableLines([])).toEqual([])
  })
})
