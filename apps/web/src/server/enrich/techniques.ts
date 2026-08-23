// Static technique extraction over mirrored kernel source (§8.7 traits).
// Lexical detectors only: every trait is a hard fact with the matched line
// as evidence, never an inferred description. A detector that does not fire
// stays silent; nothing here guesses. Bump EXTRACTOR_VERSION whenever a
// detector's meaning changes so stored traits can be re-derived.
export const EXTRACTOR_VERSION = "techniques-v1"

export type Trait = {
  trait: string
  /** Extracted value for parametric traits (tile sizes, stages); null for
   * boolean traits. */
  value: string | null
  /** The source line that matched, trimmed. */
  evidence: string
}

type Detector = {
  trait: string
  /** Matches one line; a capture group becomes the value. */
  pattern: RegExp
  languages?: ("python" | "cpp")[]
}

// Each entry documents exactly what it matches. Patterns are line-scoped so
// the evidence is one readable line; the first match per trait wins.
const DETECTORS: Detector[] = [
  // Hopper/Blackwell bulk-async tensor memory accelerator loads.
  {
    trait: "tma",
    pattern:
      /cp\.async\.bulk|cuTensorMap|CUtensorMap|SM90_TMA|TMA_LOAD|_experimental_descriptor_load|tma_descriptor|make_tma_copy/,
  },
  // Warpgroup MMA (sm_90a) and the CUTLASS/CuTe atoms that emit it.
  {
    trait: "wgmma",
    pattern:
      /wgmma\.mma_async|SM90_64x\d+x\d+|GMMA::|warpgroup_arrive|warpgroup_commit_batch/,
  },
  // Blackwell tensor-core MMA issued through tensor memory (tcgen05).
  { trait: "tcgen05", pattern: /tcgen05\.|SM100_MMA|UMMA::/ },
  // Warp-level tensor-core MMA (mma.sync / wmma) below the warpgroup tier.
  {
    trait: "mma",
    pattern:
      /mma\.sync|wmma::|nvcuda::wmma|SM80_16x8x\d+|MMA_Atom|tl\.dot\([^)]|@triton.*dot/,
  },
  // Producer/consumer warp roles with register reallocation.
  {
    trait: "warp-specialization",
    pattern:
      /setmaxnreg|warp_specializ|producer_warp|consumer_warp|WarpSpecialized|PRODUCER|is_producer/i,
  },
  // Split-K reduction across thread blocks.
  { trait: "split-k", pattern: /split[_-]?k|SPLIT_K|splitk/i },
  // Persistent kernels: a grid-stride loop over tiles instead of one tile
  // per block.
  {
    trait: "persistent-kernel",
    pattern:
      /persistent|tl\.num_programs\(|for\s*\(\s*int\s+tile\w*\s*=\s*blockIdx|tile_scheduler/i,
  },
  // Ampere+ asynchronous global-to-shared copies (non-bulk).
  {
    trait: "async-copy",
    pattern: /cp\.async(?!\.bulk)|cp_async|SM80_CP_ASYNC|cuda::memcpy_async/,
  },
  // Software pipelining depth (stages / num_stages).
  {
    trait: "stages",
    pattern:
      /(?:num_stages|NUM_STAGES|kStages|Stages|STAGES)\s*[:=]\s*(?:tl\.constexpr\s*=\s*)?(\d+)/,
  },
  {
    trait: "num-warps",
    pattern: /(?:num_warps|NUM_WARPS)\s*[:=]\s*(?:tl\.constexpr\s*=\s*)?(\d+)/,
  },
  {
    trait: "tile-m",
    pattern:
      /(?:BLOCK_M|BLOCK_SIZE_M|TILE_M|kTileM|BM)\s*[:=]\s*(?:tl\.constexpr\s*=\s*)?(\d+)/,
  },
  {
    trait: "tile-n",
    pattern:
      /(?:BLOCK_N|BLOCK_SIZE_N|TILE_N|kTileN|BN)\s*[:=]\s*(?:tl\.constexpr\s*=\s*)?(\d+)/,
  },
  {
    trait: "tile-k",
    pattern:
      /(?:BLOCK_K|BLOCK_SIZE_K|TILE_K|kTileK|BK)\s*[:=]\s*(?:tl\.constexpr\s*=\s*)?(\d+)/,
  },
  // Vectorized global memory access width.
  {
    trait: "vector-width",
    pattern:
      /\b(float4|int4|uint4|float2|__nv_bfloat162|half2|ld\.global\.v4|st\.global\.v4|uint4_t)\b/,
  },
  { trait: "shared-memory", pattern: /__shared__|extern __shared__|smem_/ },
  // Dynamic shared memory beyond the 48 KB default opt-in.
  {
    trait: "large-smem",
    pattern:
      /cudaFuncAttributeMaxDynamicSharedMemorySize|MaxDynamicSharedMemorySize/,
  },
  // Named barriers / mbarrier pipelines.
  {
    trait: "mbarrier",
    pattern: /mbarrier|ClusterBarrier|NamedBarrier|bar\.sync\s+\d/,
  },
  // Thread block clusters and distributed shared memory (sm_90+).
  {
    trait: "cluster",
    pattern: /__cluster_dims__|cluster\.sync|ClusterShape|cluster_launch|dsmem/,
  },
  // Epilogue fusion: activation / bias / residual applied on the accumulator.
  {
    trait: "fused-epilogue",
    pattern:
      /epilogue|EPILOGUE|fused_(?:bias|gelu|silu|relu|residual)|with_bias/i,
  },
  // FP8 / FP4 tensor-core datatypes.
  {
    trait: "fp8",
    pattern:
      /__nv_fp8|float_e4m3|float_e5m2|\bfp8e4\w*\b|\be4m3\b|\be5m2\b|tl\.float8/,
  },
  { trait: "fp4", pattern: /\b(?:nvfp4|mxfp4|fp4)\b|float_e2m1/i },
  // Triton autotune search space present.
  {
    trait: "autotune",
    pattern: /@triton\.autotune|triton\.Config\(|autotune/,
    languages: ["python"],
  },
  // Inline PTX inside a CUDA source.
  {
    trait: "inline-ptx",
    pattern: /asm\s+volatile|asm\s*\(/,
    languages: ["cpp"],
  },
  // Online-softmax / flash-style attention loop (rescaling running max).
  {
    trait: "online-softmax",
    pattern: /\b(?:m_new|m_i_new|row_max_new|running_max)\b/,
  },
]

/**
 * Extract technique traits from one mirrored source file. `language` is the
 * highlight grammar already derived for the file (sourceLanguage); "text"
 * still runs every language-agnostic detector.
 */
export function extractTechniques(
  source: string,
  language: "python" | "cpp" | "text",
): Trait[] {
  const lines = source.split("\n")
  const traits: Trait[] = []
  for (const detector of DETECTORS) {
    if (
      detector.languages &&
      (language === "text" || !detector.languages.includes(language))
    )
      continue
    for (const raw of lines) {
      // Embedded data blobs (base64 payloads, packed configs) contain every
      // short token by accident; long unbroken runs are scrubbed before any
      // detector sees the line.
      const line = raw.trim().replace(/[A-Za-z0-9+/=]{40,}/g, "…")
      // Comments never count as a technique in use — but '#' introduces
      // preprocessor directives in C++/CUDA (#define SPLIT_K 4 is a real
      // technique declaration), so it is a comment marker only in Python.
      if (/^(\/\/|\*|\/\*)/.test(line)) continue
      if (language === "python" && line.startsWith("#")) continue
      const match = detector.pattern.exec(line)
      if (!match) continue
      // The cited line is bounded, windowed around the match so the proof
      // itself is never cut off by a long prefix.
      const start = Math.max(0, match.index - 60)
      const evidence =
        line.length <= 200
          ? line
          : `${start > 0 ? "…" : ""}${line.slice(start, start + 180)}…`
      traits.push({
        trait: detector.trait,
        value: match[1] ?? null,
        evidence,
      })
      break
    }
  }
  return traits
}

/** Rows for implementation_traits from one mirrored file; empty when the
 * source yields nothing. Shared by the publication transaction and the
 * backfill script so both store identical facts. */
export function traitRows(
  implementationId: string,
  language: "python" | "cpp" | "text",
  content: string,
) {
  return extractTechniques(content, language).map((trait) => ({
    implementationId,
    trait: trait.trait,
    value: trait.value,
    evidence: trait.evidence,
    extractorVersion: EXTRACTOR_VERSION,
  }))
}

/** Trait names a precedent search may count as a memory-pattern overlap. */
export const MEMORY_PATTERN_TRAITS = new Set([
  "tma",
  "async-copy",
  "persistent-kernel",
  "shared-memory",
  "vector-width",
  "mbarrier",
  "cluster",
])
