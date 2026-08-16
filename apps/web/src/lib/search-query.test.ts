import { describe, expect, it } from "vitest"
import { describeIntent, parseQuery, removeToken } from "./search-query"

describe("parseQuery", () => {
  it("parses bare hardware, dtype, and shape tokens", () => {
    const intent = parseQuery("rmsnorm B200 bf16 [2048, 4096]")
    expect(intent.text).toEqual(["rmsnorm"])
    expect(intent.gpu).toBe("B200")
    expect(intent.dtypes).toEqual(["bf16"])
    expect(intent.shape).toEqual([2048, 4096])
    expect(intent.issues).toEqual([])
  })

  it("parses keyed facets with either separator and normalizes aliases", () => {
    const intent = parseQuery(
      "gemm gpu:H100 dtype=bfloat16 framework:torch arch:sm100 trust:verified",
    )
    expect(intent.gpu).toBe("H100")
    expect(intent.dtypes).toEqual(["bf16"])
    expect(intent.framework).toBe("pytorch")
    expect(intent.architecture).toBe("sm_100")
    expect(intent.minimumTrust).toBe("verified")
    expect(intent.text).toEqual(["gemm"])
  })

  it("kebab-normalizes model facets to match stored model tags", () => {
    const intent = parseQuery("mla model:DeepSeek-V3 model=FLUX.1-Kontext-dev")
    expect(intent.model).toBe("flux-1-kontext-dev")
    expect(parseQuery("model:DeepSeek-V3").model).toBe("deepseek-v3")
    expect(intent.facets.filter((f) => f.field === "model")).toHaveLength(2)
  })

  it("treats name=integer as an axis binding", () => {
    const intent = parseQuery("rmsnorm tokens=2048 hidden=4096")
    expect(intent.axes).toEqual({ tokens: 2048, hidden: 4096 })
    expect(intent.facets.map((facet) => facet.field)).toEqual(["axis", "axis"])
  })

  it("reports unknown filters with a correction hint, never free text", () => {
    const intent = parseQuery("rmsnorm gpuu:B200")
    expect(intent.text).toEqual(["rmsnorm"])
    expect(intent.gpu).toBeNull()
    expect(intent.issues).toHaveLength(1)
    expect(intent.issues[0].message).toContain("Did you mean 'gpu:'")
  })

  it("reports invalid facet values as field-level errors", () => {
    const intent = parseQuery("softmax dtype:xf16 trust:gold shape:[a,b]")
    expect(intent.issues.map((entry) => entry.message)).toEqual([
      expect.stringContaining("unknown dtype"),
      expect.stringContaining("unknown trust level"),
      expect.stringContaining("unparseable shape"),
    ])
    expect(intent.dtypes).toEqual([])
    expect(intent.minimumTrust).toBeNull()
  })

  it("rejects range operators explicitly", () => {
    const intent = parseQuery("gemm cuda:>=13")
    expect(intent.cudaMajor).toBeNull()
    expect(intent.issues[0].message).toContain("range filters")
  })

  it("keeps quoted strings and unrecognized words as text", () => {
    const intent = parseQuery('"fused add rmsnorm" residual')
    expect(intent.text).toEqual(["fused add rmsnorm", "residual"])
    expect(intent.facets).toEqual([])
  })

  it("parses NxM shapes and language words", () => {
    const intent = parseQuery("gemm 4096x4096 triton")
    expect(intent.shape).toEqual([4096, 4096])
    expect(intent.language).toBe("triton")
  })
})

describe("removeToken", () => {
  it("removes exactly one facet token, preserving bracket groups", () => {
    expect(removeToken("rmsnorm B200 shape=[2048, 4096]", "B200")).toBe(
      "rmsnorm shape=[2048, 4096]",
    )
    expect(
      removeToken("rmsnorm B200 shape=[2048, 4096]", "shape=[2048, 4096]"),
    ).toBe("rmsnorm B200")
  })
})

describe("describeIntent", () => {
  it("summarizes the interpreted request in plain language", () => {
    const intent = parseQuery("rmsnorm B200 bf16 tokens=2048 trust:verified")
    expect(describeIntent(intent, "RMSNorm")).toBe(
      "Operation RMSNorm · gpu B200 · dtype bf16 · tokens = 2048 · trust ≥ verified",
    )
  })
})
