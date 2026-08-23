import { describe, expect, it } from "vitest"
import { type PrecedentCandidate, scorePrecedent } from "./precedents.ts"

const request = {
  gpu: "B200",
  architecture: "sm_100",
  dtypes: ["bf16"],
  axes: { tokens: 2048 },
  leaderTraits: ["tma", "persistent-kernel"],
}

const candidate = (over: Partial<PrecedentCandidate>): PrecedentCandidate => ({
  relation: { kind: "same" },
  hardwareModels: ["NVIDIA B200 SXM"],
  architectures: ["sm_100"],
  dtypes: ["bf16"],
  axes: [{ tokens: 2048 }],
  bestRank: 1,
  bestEvidence: "verified",
  techniques: ["tma", "persistent-kernel"],
  ...over,
})

describe("precedents-v1", () => {
  it("scores the exact precedent at the top with every reason stated", () => {
    const { score, reasons } = scorePrecedent(request, candidate({}))
    expect(score).toBe(1)
    expect(reasons).toEqual([
      "same computation",
      "same GPU (B200 SXM)",
      "same dtype (bf16)",
      "same shape",
      "holds a cohort record",
      "shares tma, persistent-kernel with the target's leaders",
    ])
  })

  it("orders computation over hardware over shape over standing", () => {
    const sameOpOtherGpu = scorePrecedent(
      request,
      candidate({ hardwareModels: ["NVIDIA H100"], architectures: ["sm_90"] }),
    )
    const familyOnlySameGpu = scorePrecedent(
      request,
      candidate({ relation: { kind: "family", family: "attention" } }),
    )
    const adjacentShape = scorePrecedent(
      request,
      candidate({ axes: [{ tokens: 4096 }] }),
    )
    expect(sameOpOtherGpu.reasons).toContain("adjacent architecture (sm_90)")
    expect(familyOnlySameGpu.reasons).toContain("same family (attention)")
    expect(adjacentShape.reasons).toContain(
      "adjacent shape (tokens 2048 vs 4096)",
    )
    expect(adjacentShape.score).toBeGreaterThan(sameOpOtherGpu.score)
    expect(sameOpOtherGpu.score).toBeGreaterThan(familyOnlySameGpu.score)
  })

  it("stays neutral on dimensions the request did not bind", () => {
    const open = {
      ...request,
      gpu: null,
      architecture: null,
      dtypes: [],
      axes: {},
    }
    const { dimensions, reasons } = scorePrecedent(
      open,
      candidate({ hardwareModels: ["AMD MI300X"], architectures: ["gfx942"] }),
    )
    expect(dimensions.hardware).toBe(0.6)
    expect(dimensions.workload).toBe(0.5)
    expect(reasons.some((r) => r.includes("GPU"))).toBe(false)
  })

  it("falls back to memory-pattern traits when the target has no leaders", () => {
    const { reasons } = scorePrecedent(
      { ...request, leaderTraits: [] },
      candidate({ techniques: ["async-copy", "fused-epilogue"] }),
    )
    expect(reasons).toContain("memory pattern: async-copy")
  })
})
