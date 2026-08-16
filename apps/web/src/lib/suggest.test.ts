import { describe, expect, it } from "vitest"
import type { OperationIndexEntry } from "./catalog-models"
import { parseQuery } from "./search-query.ts"
import { matchSuggestions, suggestFor } from "./suggest.ts"

const entry = (
  name: string,
  slug: string,
  family: string,
  runs: number,
  aliases: string[] = [],
): OperationIndexEntry => ({
  name,
  slug,
  family,
  aliases,
  runs,
  lastObservedAt: null,
})

const INDEX = [
  entry("GEMM n128 k2048", "004-gemm-n128-k2048", "gemm", 3),
  entry("GEMM n4096 k4096", "007-gemm-n4096-k4096", "gemm", 9),
  entry("Fused add RMSNorm h2048", "001-fused-add-rmsnorm-h2048", "rmsnorm", 5),
  entry("AMD FP8 blockwise GEMM", "gpumode-amd-fp8-mm", "gemm", 12),
  entry("Attention softmax dropout", "001-attention-softmax", "other", 2),
  entry("Trimul", "gpumode-trimul", "trimul", 4, [
    "trimul",
    "triangle multiplicative update",
  ]),
]

describe("matchSuggestions", () => {
  it("matches curated aliases the display name does not contain", () => {
    const names = matchSuggestions(["triangle"], INDEX).map((m) => m.name)
    expect(names).toContain("Trimul")
  })

  it("ranks phrase prefixes first, then by run count", () => {
    const names = matchSuggestions(["gemm"], INDEX).map((m) => m.name)
    expect(names.slice(0, 2)).toEqual(["GEMM n4096 k4096", "GEMM n128 k2048"])
    expect(names).toContain("AMD FP8 blockwise GEMM")
  })

  it("matches every term as a word prefix across the name", () => {
    expect(
      matchSuggestions(["fused", "rms"], INDEX).map((m) => m.slug),
    ).toEqual(["001-fused-add-rmsnorm-h2048"])
  })

  it("falls back to slug and family substrings", () => {
    expect(matchSuggestions(["fp8-mm"], INDEX).map((m) => m.slug)).toEqual([
      "gpumode-amd-fp8-mm",
    ])
  })

  it("returns nothing for empty or unmatched terms", () => {
    expect(matchSuggestions([], INDEX)).toEqual([])
    expect(matchSuggestions(["conv3x3"], INDEX)).toEqual([])
  })
})

describe("suggestFor", () => {
  const names = (query: string) =>
    suggestFor(parseQuery(query), INDEX).map((m) => m.name)

  it("keeps suggesting when a typed term becomes a recognized facet", () => {
    // "fp8" parses as a dtype facet, but it is also name material.
    expect(names("fp8")).toEqual(["AMD FP8 blockwise GEMM"])
  })

  it("narrows by a bare facet token beside free text", () => {
    expect(names("fp8 gemm")).toEqual(["AMD FP8 blockwise GEMM"])
  })

  it("falls back to free text when facet tokens match no name", () => {
    const suggested = names("gemm b200 bf16")
    expect(suggested[0]).toBe("GEMM n4096 k4096")
    expect(suggested).toContain("AMD FP8 blockwise GEMM")
  })

  it("suggests nothing once an operation is selected", () => {
    expect(names("op:gpumode-amd-fp8-mm")).toEqual([])
  })
})
