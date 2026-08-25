import { describe, expect, it } from "vitest"
import { synonymTermSets, synonymTokens } from "./search-synonyms.ts"

describe("search synonyms", () => {
  it("bridges common phrasing to corpus tokens without replacing terms", () => {
    expect(synonymTokens(["matrix", "multiplication"])).toEqual([
      "matmul",
      "gemm",
      "mm",
    ])
    expect(synonymTokens(["rms", "norm"])).toEqual(["rmsnorm"])
    expect(synonymTokens(["softmax"])).toEqual([])
  })

  it("produces alternate term lists for all-terms matchers", () => {
    const sets = synonymTermSets(["matrix", "multiplication", "b200"])
    expect(sets).toContainEqual(["matmul", "b200"])
    expect(sets).toContainEqual(["gemm", "b200"])
    expect(synonymTermSets(["rmsnorm"])).toEqual([])
  })
})
