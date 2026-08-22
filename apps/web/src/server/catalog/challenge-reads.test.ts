// Challenges (§2.3): the request-facets query rewrite is pure; against the
// database the board derives rows whose links carry a cohort or search.
import { describe, expect, it } from "vitest"
import { getChallenges, requestQuery } from "./challenge-reads.ts"

describe("requestQuery", () => {
  it("rebuilds a search from coarse facets only", () => {
    expect(
      requestQuery({
        operation: "rmsnorm-h4096",
        gpu: "B200",
        dtype: "bf16",
        axes: { tokens: 8192 },
      }),
    ).toBe("op:rmsnorm-h4096 gpu:B200 dtype:bf16 tokens=8192")
    expect(requestQuery({ family: "gemm" })).toBe("gemm")
  })
})

describe.skipIf(!process.env.DATABASE_URL)("getChallenges (database)", () => {
  it("derives rows that always point somewhere", async () => {
    const model = await getChallenges()
    for (const challenge of model.challenges) {
      expect(challenge.href.startsWith("/")).toBe(true)
      expect(challenge.operation !== null || challenge.family !== null).toBe(
        true,
      )
    }
  })
})
