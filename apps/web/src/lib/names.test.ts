import { describe, expect, it } from "vitest"
import { humanizeOperationName, implementationDisplayName } from "./names.ts"

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
