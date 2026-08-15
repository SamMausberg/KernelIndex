// AMD $100K competition boards (MI300X, per-shape run_result evidence).
// Entries moved verbatim from the original problems.ts — the operation
// manifests (and so their digests) are unchanged.
import type { CuratedProblem } from "../problems.ts"

export const AMD_PROBLEMS: CuratedProblem[] = [
  {
    leaderboard: "amd-fp8-mm",
    slug: "gpumode-amd-fp8-mm",
    title: "AMD FP8 blockwise GEMM",
    family: "gemm",
    description:
      "FP8-blockwise matrix multiply optimized for MI300: A (m×k) and B (n×k) in e4m3fnuz column-major with fp32 blockwise scales (128-wide k blocks), output C (m×n) in bf16 row-major. Shapes are drawn from DeepSeek-R1.",
    taskPath: "problems/amd/fp8-mm/task.yml",
    axes: {
      m: { role: "variable" },
      n: { role: "variable" },
      k: { role: "variable" },
      seed: { role: "variable" },
      k_blocks: { role: "derived", expression: "k // 128" },
      n_blocks: { role: "derived", expression: "n // 128" },
    },
    inputs: [
      {
        name: "a",
        shape: ["m", "k"],
        dtype: "fp8_e4m3fnuz",
        layout: "col_major",
      },
      {
        name: "b",
        shape: ["n", "k"],
        dtype: "fp8_e4m3fnuz",
        layout: "col_major",
      },
      {
        name: "a_scale",
        shape: ["m", "k_blocks"],
        dtype: "fp32",
        layout: "col_major",
      },
      {
        name: "b_scale",
        shape: ["n_blocks", "k_blocks"],
        dtype: "fp32",
        layout: "col_major",
      },
    ],
    outputs: [
      { name: "c", shape: ["m", "n"], dtype: "bf16", layout: "row_major" },
    ],
    tags: ["gemm", "quantization", "model:deepseek-r1"],
    config: "amd_successful_submissions",
    scoring: "per-shape",
  },
  {
    leaderboard: "amd-mla-decode",
    slug: "gpumode-amd-mla-decode",
    title: "AMD MLA decode",
    family: "mla-attention",
    description:
      "Multi-head latent attention decode for MI300: bf16 Q/K/V, non-paged pre-allocated latent KV cache, single decode step over a variable prefill length. Dimensions follow DeepSeek-R1/V3 (hidden 7168, 128 heads, kv-lora rank 512, rope dim 64).",
    taskPath: "problems/amd/mla-decode/task.yml",
    axes: {
      batchsize: { role: "variable" },
      dim: { role: "variable" },
      dq: { role: "variable" },
      prefill: { role: "variable" },
      seed: { role: "variable" },
      sq: { role: "constant", value: 1 },
      n_heads: { role: "constant", value: 128 },
      v_head_dim: { role: "constant", value: 128 },
      kv_lora_rank: { role: "constant", value: 512 },
      qk_rope_head_dim: { role: "constant", value: 64 },
      kv_dim: {
        role: "derived",
        expression: "kv_lora_rank + qk_rope_head_dim",
      },
    },
    inputs: [
      { name: "input", shape: ["batchsize", "sq", "dim"], dtype: "bf16" },
      {
        name: "kv_cache",
        shape: ["batchsize", "prefill", "kv_dim"],
        dtype: "bf16",
      },
    ],
    outputs: [
      {
        name: "attn_output",
        shape: ["batchsize", "n_heads", "sq", "v_head_dim"],
        dtype: "bf16",
      },
      {
        name: "kv_cache_out",
        shape: ["batchsize", "prefill", "kv_dim"],
        dtype: "bf16",
      },
    ],
    tags: ["attention", "mla", "model:deepseek-r1", "model:deepseek-v3"],
    config: "amd_successful_submissions",
    scoring: "per-shape",
  },
  {
    leaderboard: "amd-mixture-of-experts",
    slug: "gpumode-amd-moe",
    title: "AMD DeepSeek-style MoE layer",
    family: "moe",
    description:
      "DeepSeek-style mixture-of-experts layer on a single MI300X: softmax router, top-k routing to routed plus shared experts, fp16 activations. Expert/router weights and configuration accompany the input tensor as described upstream.",
    taskPath: "problems/amd/moe/task.yml",
    axes: {
      bs: { role: "variable" },
      seqlen: { role: "variable" },
      dhidden: { role: "variable" },
      dexpert: { role: "variable" },
      nroutedexperts: { role: "variable" },
      nsharedexperts: { role: "variable" },
      nexpertspertoken: { role: "variable" },
      seed: { role: "variable" },
    },
    inputs: [
      { name: "input", shape: ["bs", "seqlen", "dhidden"], dtype: "fp16" },
    ],
    outputs: [
      { name: "output", shape: ["bs", "seqlen", "dhidden"], dtype: "fp16" },
    ],
    tags: ["moe", "model:deepseek-r1", "model:deepseek-v3"],
    config: "amd_successful_submissions",
    scoring: "per-shape",
  },
]
