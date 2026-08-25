import { describe, expect, it } from "vitest"
import {
  humanizeOperationName,
  implementationDisplayName,
  relatedModelTags,
  splitImplementationName,
} from "./names.ts"

describe("humanizeOperationName", () => {
  it("strips numeric prefixes and cases known technical tokens", () => {
    expect(
      humanizeOperationName(
        "004_attention_output_projection_with_reshape_backward",
      ),
    ).toBe("Attention output projection with reshape backward")
    expect(humanizeOperationName("001_fused_add_rmsnorm_h2048")).toBe(
      "Fused add RMSNorm h2048",
    )
    expect(humanizeOperationName("004_gemm_n128_k2048")).toBe("GEMM n128 k2048")
    expect(humanizeOperationName("005_fp8_moe_router_projection")).toBe(
      "FP8 MoE router projection",
    )
  })

  it("passes curated titles through untouched", () => {
    expect(humanizeOperationName("AMD FP8 blockwise GEMM")).toBe(
      "AMD FP8 blockwise GEMM",
    )
  })

  it("handles single-token and empty-after-prefix names", () => {
    expect(humanizeOperationName("rmsnorm")).toBe("RMSNorm")
    expect(humanizeOperationName("007_")).toBe("007_")
  })
})

describe("implementationDisplayName", () => {
  const solOperation = {
    name: "013_gqa_paged_decode_h32_kv8_d128_ps1",
    slug: "013-gqa-paged-decode-h32-kv8-d128-ps1",
  }

  it("keeps the author and drops the repeated operation name", () => {
    expect(
      implementationDisplayName(
        "Geometric · 013_gqa_paged_decode_h32_kv8_d128_ps1",
        solOperation,
        "sol-013-gqa-paged-decode-h32-kv8-d128-ps1-geometric",
      ),
    ).toBe("Geometric")
  })

  it("preserves author casing and punctuation", () => {
    expect(
      implementationDisplayName(
        "Amir M. Mir | SF Tensor · 013_gqa_paged_decode_h32_kv8_d128_ps1",
        solOperation,
        "sol-013-gqa-paged-decode-h32-kv8-d128-ps1-amir-m-mir-sf-tensor",
      ),
    ).toBe("Amir M. Mir | SF Tensor")
  })

  it("drops a board segment embedded in the operation slug", () => {
    expect(
      implementationDisplayName(
        "amd-fp8-mm · submission 30771",
        { name: "AMD FP8 blockwise GEMM", slug: "gpumode-amd-fp8-mm" },
        "kernelbot-amd-fp8-mm-30771",
      ),
    ).toBe("submission 30771")
  })

  it("keeps an implementation identity sharing the operation slug's prefix", () => {
    // Liger: the op slug starts with the provider name; the provider segment
    // is the implementation's identity, not repetition.
    expect(
      implementationDisplayName(
        "Fused add + RMSNorm · Liger fused",
        { name: "Fused add + RMSNorm", slug: "liger-fused-add-rms-norm" },
        "liger-bench-fused-add-rms-norm-liger-fused-add-rms-norm",
      ),
    ).toBe("Liger fused")
  })

  it("falls back to the slug when the title carries nothing new", () => {
    expect(
      implementationDisplayName(
        "013_gqa_paged_decode_h32_kv8_d128_ps1",
        solOperation,
        "sol-013-gqa-paged-decode-h32-kv8-d128-ps1-x",
      ),
    ).toBe("sol-013-gqa-paged-decode-h32-kv8-d128-ps1-x")
    expect(implementationDisplayName(null, solOperation, "some-slug")).toBe(
      "some-slug",
    )
  })
})

describe("relatedModelTags", () => {
  const tags = [
    "qwen3-30b-a3b",
    "qwen3-30b-a3b-instruct-2507",
    "qwen3-coder-30b-a3b-instruct",
    "qwen3-3b",
    "deepseek-v3",
  ]

  it("relates only exact hyphen-boundary prefixes, both directions", () => {
    expect(relatedModelTags("qwen3-30b-a3b", tags)).toEqual([
      "qwen3-30b-a3b-instruct-2507",
    ])
    expect(relatedModelTags("qwen3-30b-a3b-instruct-2507", tags)).toEqual([
      "qwen3-30b-a3b",
    ])
  })

  it("never treats a partial token as a prefix", () => {
    // "qwen3-3" is a substring of two tags but a prefix of neither model id.
    expect(relatedModelTags("qwen3-3", tags)).toEqual([])
  })

  it("excludes the slug itself and sorts", () => {
    expect(relatedModelTags("deepseek-v3", tags)).toEqual([])
    expect(relatedModelTags("qwen3", [...tags].reverse())).toEqual([
      "qwen3-30b-a3b",
      "qwen3-30b-a3b-instruct-2507",
      "qwen3-3b",
      "qwen3-coder-30b-a3b-instruct",
    ])
  })
})

describe("splitImplementationName", () => {
  it("splits generated identifiers into a readable base and short id", () => {
    expect(splitImplementationName("gpt-o3_cuda_af0f3d")).toEqual({
      base: "gpt-o3 / cuda",
      id: "af0f3d",
    })
    expect(splitImplementationName("gemini-2.5-pro_triton_dc28mj")).toEqual({
      base: "gemini-2.5-pro / triton",
      id: "dc28mj",
    })
    expect(splitImplementationName("flashinfer_wrapper_3f9411")).toEqual({
      base: "flashinfer / wrapper",
      id: "3f9411",
    })
  })

  // Baseline names carry workload axes, not ids; splitting them would
  // present an axis as provenance.
  it("refuses axis-like and non-id tails", () => {
    expect(
      splitImplementationName("mm_fp4_mxfp4_flashinfer_n5120_k2048"),
    ).toBeNull()
    expect(splitImplementationName("Stellar Flamingo")).toBeNull()
    expect(splitImplementationName("liger-fused-add-rms-norm")).toBeNull()
    expect(splitImplementationName("torch_matmul")).toBeNull()
  })
})
