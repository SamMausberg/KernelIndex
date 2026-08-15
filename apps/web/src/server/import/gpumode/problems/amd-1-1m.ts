// AMD $1.1M competition boards (problems/amd_202602, MI355X, aggregate
// scoring). Hand-transcribed from gpu-mode/reference-kernels task.yml +
// reference.py. problem_name/runner verified 2026-08-15 against the
// datasets-server filter slice of GPUMODE/kernelbot-data config
// amd_1_1m_competition: amd-mixed-mla (2295), amd-moe-mxfp4 (3233),
// amd-mxfp4-mm (6010) passed rows — all MI355X, sums to the full 11538.
import type { CuratedProblem } from "../problems.ts"

export const AMD_1_1M_PROBLEMS: CuratedProblem[] = [
  {
    leaderboard: "amd-mxfp4-mm",
    slug: "gpumode-amd-mxfp4-mm",
    title: "AMD MXFP4 GEMM",
    family: "gemm",
    description:
      "Block-scaled MXFP4 matrix multiply for MI355X: quantize bf16 A (m×k) to MXFP4 per-1x32 blocks, then an a4w4 GEMM against pre-quantized MXFP4 B (n×k), producing bf16 C (m×n); m, n, k are divisible by 64. B also arrives pre-shuffled to (16,16) tiles together with a row-padded E8M0 scale tensor for the CK kernel.",
    taskPath: "problems/amd_202602/mxfp4-mm/task.yml",
    axes: {
      m: { role: "variable" },
      n: { role: "variable" },
      k: { role: "variable" },
      seed: { role: "variable" },
      k_half: { role: "derived", expression: "k // 2" },
      k_blocks: { role: "derived", expression: "k // 32" },
    },
    // The fifth input tuple element, B_scale_sh ([padded, k//32] E8M0), has an
    // upstream-unspecified padded row count and is covered by the description.
    inputs: [
      { name: "a", shape: ["m", "k"], dtype: "bf16", layout: "row_major" },
      { name: "b", shape: ["n", "k"], dtype: "bf16", layout: "row_major" },
      {
        name: "b_q",
        shape: ["n", "k_half"],
        dtype: "mxfp4",
        layout: "row_major",
      },
      { name: "b_shuffle", shape: ["n", "k_half"], dtype: "mxfp4" },
    ],
    outputs: [{ name: "c", shape: ["m", "n"], dtype: "bf16" }],
    tags: ["gemm", "quantization"],
    config: "amd_1_1m_competition",
    scoring: "aggregate",
    suite: {
      statistic: "geomean",
      cases: [
        { externalId: "0", axes: { m: 4, n: 2880, k: 512, seed: 4565 } },
        { externalId: "1", axes: { m: 16, n: 2112, k: 7168, seed: 15 } },
        { externalId: "2", axes: { m: 32, n: 4096, k: 512, seed: 457 } },
        { externalId: "3", axes: { m: 32, n: 2880, k: 512, seed: 54 } },
        { externalId: "4", axes: { m: 64, n: 7168, k: 2048, seed: 687 } },
        { externalId: "5", axes: { m: 256, n: 3072, k: 1536, seed: 7856 } },
      ],
    },
    gpus: ["MI355X"],
  },
  {
    leaderboard: "amd-moe-mxfp4",
    slug: "gpumode-amd-moe-mxfp4",
    title: "AMD MXFP4 MoE",
    family: "moe",
    description:
      "DeepSeek-R1 style MXFP4 fused MoE layer for MI355X: dynamic per-1x32 MXFP4 quantization of bf16 activations, fused gate+up a4w4 GEMM with SwiGLU, down-projection a4w4 GEMM, and weighted reduction over top-k routed plus always-selected shared experts. Expert dims are padded to 256-alignment; pre-shuffled CK-layout weight/scale copies and a config dict accompany the tensors listed here.",
    taskPath: "problems/amd_202602/moe-mxfp4/task.yml",
    axes: {
      dhidden: { role: "variable" },
      dexpert: { role: "variable" },
      nroutedexperts: { role: "variable" },
      nexpertspertoken: { role: "variable" },
      nsharedexperts: { role: "variable" },
      bs: { role: "variable" },
      seed: { role: "variable" },
      d_hidden_pad: {
        role: "derived",
        expression: "((dhidden + 255) // 256) * 256",
      },
      d_expert_pad: {
        role: "derived",
        expression: "((dexpert + 255) // 256) * 256",
      },
      e_total: {
        role: "derived",
        expression: "nroutedexperts + nsharedexperts",
      },
      total_top_k: {
        role: "derived",
        expression: "nexpertspertoken + nsharedexperts",
      },
      gate_up_rows: { role: "derived", expression: "2 * d_expert_pad" },
      gu_k_half: { role: "derived", expression: "d_hidden_pad // 2" },
      down_k_half: { role: "derived", expression: "d_expert_pad // 2" },
      gu_scale_blocks: { role: "derived", expression: "d_hidden_pad // 32" },
      down_scale_blocks: { role: "derived", expression: "d_expert_pad // 32" },
    },
    inputs: [
      { name: "hidden_states", shape: ["bs", "dhidden"], dtype: "bf16" },
      {
        name: "gate_up_weight",
        shape: ["e_total", "gate_up_rows", "gu_k_half"],
        dtype: "mxfp4",
      },
      {
        name: "down_weight",
        shape: ["e_total", "d_hidden_pad", "down_k_half"],
        dtype: "mxfp4",
      },
      {
        name: "gate_up_weight_scale",
        shape: ["e_total", "gate_up_rows", "gu_scale_blocks"],
        dtype: "fp8_e8m0",
      },
      {
        name: "down_weight_scale",
        shape: ["e_total", "d_hidden_pad", "down_scale_blocks"],
        dtype: "fp8_e8m0",
      },
      { name: "topk_weights", shape: ["bs", "total_top_k"], dtype: "fp32" },
      { name: "topk_ids", shape: ["bs", "total_top_k"], dtype: "int32" },
    ],
    outputs: [{ name: "output", shape: ["bs", "dhidden"], dtype: "bf16" }],
    tags: ["moe", "quantization", "model:deepseek-r1"],
    config: "amd_1_1m_competition",
    scoring: "aggregate",
    suite: {
      statistic: "geomean",
      cases: [
        // TP=8
        {
          externalId: "0",
          axes: {
            dhidden: 7168,
            dexpert: 256,
            nroutedexperts: 256,
            nexpertspertoken: 8,
            nsharedexperts: 1,
            bs: 16,
            seed: 9371,
          },
        },
        {
          externalId: "1",
          axes: {
            dhidden: 7168,
            dexpert: 256,
            nroutedexperts: 256,
            nexpertspertoken: 8,
            nsharedexperts: 1,
            bs: 128,
            seed: 2291,
          },
        },
        {
          externalId: "2",
          axes: {
            dhidden: 7168,
            dexpert: 256,
            nroutedexperts: 256,
            nexpertspertoken: 8,
            nsharedexperts: 1,
            bs: 512,
            seed: 81934,
          },
        },
        // TP=4
        {
          externalId: "3",
          axes: {
            dhidden: 7168,
            dexpert: 512,
            nroutedexperts: 32,
            nexpertspertoken: 8,
            nsharedexperts: 1,
            bs: 16,
            seed: 2291,
          },
        },
        {
          externalId: "4",
          axes: {
            dhidden: 7168,
            dexpert: 512,
            nroutedexperts: 32,
            nexpertspertoken: 8,
            nsharedexperts: 1,
            bs: 128,
            seed: 81934,
          },
        },
        {
          externalId: "5",
          axes: {
            dhidden: 7168,
            dexpert: 512,
            nroutedexperts: 32,
            nexpertspertoken: 8,
            nsharedexperts: 1,
            bs: 512,
            seed: 81934,
          },
        },
        // EP on
        {
          externalId: "6",
          axes: {
            dhidden: 7168,
            dexpert: 2048,
            nroutedexperts: 32,
            nexpertspertoken: 8,
            nsharedexperts: 1,
            bs: 512,
            seed: 81934,
          },
        },
      ],
    },
    gpus: ["MI355X"],
  },
  {
    leaderboard: "amd-mixed-mla",
    slug: "gpumode-amd-mixed-mla",
    title: "AMD mixed-precision MLA decode",
    family: "mla-attention",
    description:
      "DeepSeek-R1 forward_absorb MLA decode attention for MI355X: absorbed bf16 queries against a compressed latent KV cache with indptr-based variable-length batching, one decode step (qseqlen 1, kvseqlen up to 8k). The KV buffer is supplied in bf16, fp8, and mxfp4 formats — the full 576 dims act as keys and the first 512 as values; a config dict accompanies the tensors listed here.",
    taskPath: "problems/amd_202602/mixed-mla/task.yml",
    axes: {
      batchsize: { role: "variable" },
      qseqlen: { role: "variable" },
      kvseqlen: { role: "variable" },
      seed: { role: "variable" },
      num_heads: { role: "constant", value: 16 },
      num_kv_heads: { role: "constant", value: 1 },
      kv_lora_rank: { role: "constant", value: 512 },
      qk_rope_head_dim: { role: "constant", value: 64 },
      v_head_dim: { role: "constant", value: 512 },
      qk_head_dim: {
        role: "derived",
        expression: "kv_lora_rank + qk_rope_head_dim",
      },
      total_q: { role: "derived", expression: "batchsize * qseqlen" },
      total_kv: { role: "derived", expression: "batchsize * kvseqlen" },
      indptr_len: { role: "derived", expression: "batchsize + 1" },
    },
    inputs: [
      {
        name: "q",
        shape: ["total_q", "num_heads", "qk_head_dim"],
        dtype: "bf16",
      },
      {
        name: "kv_buffer",
        shape: ["total_kv", "num_kv_heads", "qk_head_dim"],
        dtype: "bf16",
      },
      { name: "qo_indptr", shape: ["indptr_len"], dtype: "int32" },
      { name: "kv_indptr", shape: ["indptr_len"], dtype: "int32" },
    ],
    outputs: [
      {
        name: "output",
        shape: ["total_q", "num_heads", "v_head_dim"],
        dtype: "bf16",
      },
    ],
    tags: ["attention", "mla", "quantization", "model:deepseek-r1"],
    config: "amd_1_1m_competition",
    scoring: "aggregate",
    suite: {
      statistic: "geomean",
      cases: [
        {
          externalId: "0",
          axes: { batchsize: 4, qseqlen: 1, kvseqlen: 1024, seed: 4217 },
        },
        {
          externalId: "1",
          axes: { batchsize: 4, qseqlen: 1, kvseqlen: 8192, seed: 4220 },
        },
        {
          externalId: "2",
          axes: { batchsize: 32, qseqlen: 1, kvseqlen: 1024, seed: 5412 },
        },
        {
          externalId: "3",
          axes: { batchsize: 32, qseqlen: 1, kvseqlen: 8192, seed: 5415 },
        },
        {
          externalId: "4",
          axes: { batchsize: 64, qseqlen: 1, kvseqlen: 1024, seed: 1357 },
        },
        {
          externalId: "5",
          axes: { batchsize: 64, qseqlen: 1, kvseqlen: 8192, seed: 1360 },
        },
        {
          externalId: "6",
          axes: { batchsize: 256, qseqlen: 1, kvseqlen: 1024, seed: 9823 },
        },
        {
          externalId: "7",
          axes: { batchsize: 256, qseqlen: 1, kvseqlen: 8192, seed: 9826 },
        },
      ],
    },
    gpus: ["MI355X"],
  },
]
