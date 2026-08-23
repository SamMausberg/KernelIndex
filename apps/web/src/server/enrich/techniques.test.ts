import { describe, expect, it } from "vitest"
import { extractTechniques } from "./techniques.ts"

const byTrait = (source: string, language: "python" | "cpp" | "text") =>
  new Map(extractTechniques(source, language).map((t) => [t.trait, t]))

describe("extractTechniques", () => {
  it("reads Hopper primitives and tile parameters out of a CUTLASS-style kernel", () => {
    const traits = byTrait(
      `
template <int kStages = 4>
__global__ void gemm(const CUtensorMap* a_map) {
  extern __shared__ char smem[];
  asm volatile("wgmma.mma_async.sync.aligned.m64n128k16.f32.bf16.bf16");
  if (threadIdx.x / 128 == 0) { setmaxnreg.dec.sync.aligned.u32 40; }
  cutlass::arch::fence_view_async_shared();
}
constexpr int BM = 128;
constexpr int BN = 256;
`,
      "cpp",
    )
    expect(traits.get("tma")?.evidence).toContain("CUtensorMap")
    expect(traits.has("wgmma")).toBe(true)
    expect(traits.has("warp-specialization")).toBe(true)
    expect(traits.has("inline-ptx")).toBe(true)
    expect(traits.get("stages")?.value).toBe("4")
    expect(traits.get("tile-m")?.value).toBe("128")
    expect(traits.get("tile-n")?.value).toBe("256")
    expect(traits.has("tile-k")).toBe(false)
  })

  it("reads Triton constexprs and skips comments", () => {
    const traits = byTrait(
      `
# This kernel is not persistent; the comment must not count.
@triton.autotune(configs=[triton.Config({"BLOCK_SIZE_M": 64}, num_warps=4)])
@triton.jit
def kernel(a_ptr, BLOCK_SIZE_M: tl.constexpr = 64, BLOCK_SIZE_K: tl.constexpr = 32, num_stages: tl.constexpr = 3):
    acc = tl.dot(a, b, acc)
`,
      "python",
    )
    expect(traits.has("persistent-kernel")).toBe(false)
    expect(traits.has("autotune")).toBe(true)
    expect(traits.has("mma")).toBe(true)
    expect(traits.get("tile-m")?.value).toBe("64")
    expect(traits.get("tile-k")?.value).toBe("32")
    expect(traits.get("stages")?.value).toBe("3")
    // Python-only detectors never fire on CUDA and vice versa.
    expect(byTrait('asm volatile("")', "python").has("inline-ptx")).toBe(false)
  })

  it("distinguishes bulk TMA from plain cp.async and stays silent otherwise", () => {
    const plain = byTrait(
      'asm("cp.async.cg.shared.global [%0], [%1], 16;");',
      "cpp",
    )
    expect(plain.has("async-copy")).toBe(true)
    expect(plain.has("tma")).toBe(false)
    const bulk = byTrait(
      'asm("cp.async.bulk.tensor.2d.shared::cluster");',
      "cpp",
    )
    expect(bulk.has("tma")).toBe(true)
    expect(bulk.has("async-copy")).toBe(false)
    expect(extractTechniques("return x * 2", "python")).toEqual([])
    // Embedded blobs contain every short token by accident; they never count.
    const blob = `_ACF_B64 = "dxWiJfp4YWCSCKQhmxe4m3uRcanucsplitkeCqhxDM2nM22IiPuEVMdEW4UsGPBXBUMu4"`
    expect(extractTechniques(blob, "python")).toEqual([])
  })
})
