import { describe, expect, it } from "vitest"
import { equivalenceCandidates } from "./relations.ts"

const op = (slug: string, spec: Record<string, unknown>) => ({
  slug,
  manifest: { spec },
})

describe("equivalenceCandidates", () => {
  it("pairs identical bodies sharing a base slug, ignoring family/reference", () => {
    const pairs = equivalenceCandidates([
      op("rmsnorm-h4096", {
        family: "rmsnorm",
        axes: { hidden: 4096 },
        reference: { language: "python" },
      }),
      op("025-rmsnorm-h4096", {
        family: "normalization",
        axes: { hidden: 4096 },
      }),
    ])
    expect(pairs.map(([a, b]) => [a.slug, b.slug])).toEqual([
      ["025-rmsnorm-h4096", "rmsnorm-h4096"],
    ])
  })

  it("never pairs same-signature operations with different names", () => {
    // Signatures underdetermine semantics: prefix sum and sort share one.
    const pairs = equivalenceCandidates([
      op("gpumode-prefixsum-v2", { axes: { n: 1 } }),
      op("gpumode-sort-v2", { axes: { n: 1 } }),
    ])
    expect(pairs).toEqual([])
  })

  it("requires identical bodies even when names match", () => {
    const pairs = equivalenceCandidates([
      op("rmsnorm-h4096", { family: "rmsnorm", axes: { hidden: 4096 } }),
      op("012-rmsnorm-h4096", { family: "rmsnorm", axes: { hidden: 8192 } }),
    ])
    expect(pairs).toEqual([])
  })
})
