// Chooser annotations (§16.6): facet extraction, matching semantics kept in
// lockstep with intentMismatches, and the stable evidence-first partition.
import { describe, expect, it } from "vitest"
import { parseQuery } from "../../lib/search-query.ts"
import {
  type ChooserRun,
  chooserFacets,
  chooserMatch,
  rankChooserMatches,
} from "./chooser.ts"

const run = (over: Partial<ChooserRun>): ChooserRun => ({
  hardwareModel: "NVIDIA B200 SXM",
  hardwareArchitecture: "sm_100",
  cudaMajor: 13,
  workloadDtypes: ["bf16"],
  sourceAvailable: false,
  primaryValue: 100,
  primaryUnit: "ns",
  ...over,
})

describe("chooser", () => {
  it("extracts only verifiable facets; none means no annotation", () => {
    expect(chooserFacets(parseQuery("gemm"))).toBeNull()
    expect(chooserFacets(parseQuery("gemm shape:[2048,4096]"))).toBeNull()
    const facets = chooserFacets(parseQuery("gemm B200 bf16"))
    expect(facets?.gpu).toBe("B200")
    expect(facets?.dtypes).toEqual(["bf16"])
    expect(facets?.label).toBe("B200 · bf16")
  })

  it("matches with intentMismatches semantics (substring gpu, dtype subset)", () => {
    const facets = chooserFacets(parseQuery("x gpu:B200 dtype:bf16"))
    if (!facets) throw new Error("facets expected")
    expect(
      chooserMatch(
        [
          run({}),
          run({ workloadDtypes: ["fp16"] }),
          run({ hardwareModel: "NVIDIA H100" }),
          run({ sourceAvailable: true, primaryValue: 80 }),
        ],
        facets,
      ),
    ).toEqual({
      matching: 2,
      withSource: 1,
      best: { value: 80, unit: "ns" },
      facetLabel: "B200 · bf16",
    })
  })

  it("partitions evidence first, then family and natural name order", () => {
    const annotate = (matching: number | null) =>
      matching === null
        ? null
        : { matching, withSource: 0, best: null, facetLabel: "" }
    const entries = [
      { name: "RMSNorm h512", family: "rmsnorm", match: annotate(0) },
      { name: "RMSNorm h1536", family: "rmsnorm", match: annotate(3) },
      { name: "RMSNorm h128", family: "rmsnorm", match: annotate(1) },
      { name: "Fused add RMSNorm", family: "norm", match: annotate(2) },
      { name: "RMSNorm h4096", family: "rmsnorm", match: annotate(null) },
    ]
    expect(rankChooserMatches(entries).map((entry) => entry.name)).toEqual([
      // h128 sorts before h1536: numeric-aware, never lexicographic.
      "Fused add RMSNorm",
      "RMSNorm h128",
      "RMSNorm h1536",
      "RMSNorm h512",
      "RMSNorm h4096",
    ])
  })
})
