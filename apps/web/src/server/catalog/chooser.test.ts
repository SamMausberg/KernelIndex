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

  it("partitions evidence-bearing candidates first, order otherwise stable", () => {
    const entries = [
      { slug: "a", match: { matching: 0 } },
      { slug: "b", match: { matching: 3 } },
      { slug: "c", match: { matching: 1 } },
      { slug: "d", match: null },
    ]
    expect(
      rankChooserMatches(
        entries as Parameters<typeof rankChooserMatches>[0],
      ).map((entry) => (entry as { slug: string }).slug),
    ).toEqual(["b", "c", "a", "d"])
  })
})
