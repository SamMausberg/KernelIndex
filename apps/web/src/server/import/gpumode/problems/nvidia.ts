// NVIDIA Blackwell NVFP4 boards (problems/nvidia, B200, aggregate scoring).
// Hand-transcribed from gpu-mode/reference-kernels task.yml + reference.py.
// problem_name/runner verified 2026-08-15 against the datasets-server filter
// slice of GPUMODE/kernelbot-data config nvidia_nvfp4_submissions: nvfp4_gemv
// (4860, runner NVIDIA), nvfp4_gemm (26123, NVIDIA), nvfp4_dual_gemm (73802,
// NVIDIA), modal_nvfp4_dual_gemm (3949, B200), nvfp4_group_gemm (8749,
// NVIDIA + B200) — sums to the full 117483 passed rows.
//
// task.yml prose calls the scale dtype fp8 e4m3fnuz, but reference.py builds
// torch.float8_e4m3fn tensors; we transcribe the actual dtype (fp8_e4m3).
// reference.py also returns extra cuBLAS-layout permuted scale tensors beyond
// the task.yml input tuple; those convenience copies are not listed here.
import type { CuratedProblem } from "../problems.ts"

export const NVIDIA_PROBLEMS: CuratedProblem[] = [
  {
    leaderboard: "nvfp4_gemv",
    slug: "gpumode-nvfp4-gemv",
    title: "NVFP4 GEMV",
    family: "gemv",
    description:
      "Batched NVFP4 block-scaled matrix-vector multiply for B200: A (m×k×l) and vector b (1×k×l) in nvfp4 e2m1 with fp8 scale factors per 16 elements of k, output c (m×1×l) in fp16. All operands are K-major; m is divisible by the kernel's mma tile and k by 64.",
    taskPath: "problems/nvidia/nvfp4_gemv/task.yml",
    axes: {
      m: { role: "variable" },
      k: { role: "variable" },
      l: { role: "variable" },
      seed: { role: "variable" },
      k_scales: { role: "derived", expression: "k // 16" },
    },
    inputs: [
      { name: "a", shape: ["m", "k", "l"], dtype: "nvfp4" },
      { name: "b", shape: [1, "k", "l"], dtype: "nvfp4" },
      { name: "sfa", shape: ["m", "k_scales", "l"], dtype: "fp8_e4m3" },
      { name: "sfb", shape: [1, "k_scales", "l"], dtype: "fp8_e4m3" },
    ],
    outputs: [{ name: "c", shape: ["m", 1, "l"], dtype: "fp16" }],
    tags: ["gemv", "quantization"],
    config: "nvidia_nvfp4_submissions",
    scoring: "aggregate",
    suite: {
      statistic: "geomean",
      cases: [
        { externalId: "0", axes: { m: 7168, k: 16384, l: 1, seed: 1111 } },
        { externalId: "1", axes: { m: 4096, k: 7168, l: 8, seed: 1111 } },
        { externalId: "2", axes: { m: 7168, k: 2048, l: 4, seed: 1111 } },
      ],
    },
    gpus: ["NVIDIA"],
  },
  {
    leaderboard: "nvfp4_gemm",
    slug: "gpumode-nvfp4-gemm",
    title: "NVFP4 GEMM",
    family: "gemm",
    description:
      "NVFP4 block-scaled matrix multiply for B200: A (m×k×l) and B (n×k×l) in nvfp4 e2m1 with fp8 scale factors per 16 elements of k, output c (m×n×l) in fp16. All operands are K-major; m and n are divisible by the kernel's mma tile and k by 256.",
    taskPath: "problems/nvidia/nvfp4_gemm/task.yml",
    axes: {
      m: { role: "variable" },
      n: { role: "variable" },
      k: { role: "variable" },
      l: { role: "variable" },
      seed: { role: "variable" },
      k_scales: { role: "derived", expression: "k // 16" },
    },
    inputs: [
      { name: "a", shape: ["m", "k", "l"], dtype: "nvfp4" },
      { name: "b", shape: ["n", "k", "l"], dtype: "nvfp4" },
      { name: "sfa", shape: ["m", "k_scales", "l"], dtype: "fp8_e4m3" },
      { name: "sfb", shape: ["n", "k_scales", "l"], dtype: "fp8_e4m3" },
    ],
    outputs: [{ name: "c", shape: ["m", "n", "l"], dtype: "fp16" }],
    tags: ["gemm", "quantization"],
    config: "nvidia_nvfp4_submissions",
    scoring: "aggregate",
    suite: {
      statistic: "geomean",
      cases: [
        {
          externalId: "0",
          axes: { m: 128, n: 7168, k: 16384, l: 1, seed: 1111 },
        },
        {
          externalId: "1",
          axes: { m: 128, n: 4096, k: 7168, l: 1, seed: 1111 },
        },
        {
          externalId: "2",
          axes: { m: 128, n: 7168, k: 2048, l: 1, seed: 1111 },
        },
      ],
    },
    gpus: ["NVIDIA"],
  },
  {
    leaderboard: "nvfp4_dual_gemm",
    slug: "gpumode-nvfp4-dual-gemm",
    title: "NVFP4 dual GEMM",
    family: "gemm",
    description:
      "NVFP4 block-scaled dual matrix multiply with SiLU for B200: C = silu(A @ B1) * (A @ B2), with A (m×k×l), B1 and B2 (n×k×l) in nvfp4 e2m1, fp8 scale factors per 16 elements of k, and fp16 output (m×n×l). All operands are K-major; m and n are divisible by the kernel's mma tile and k by 256.",
    taskPath: "problems/nvidia/nvfp4_dual_gemm/task.yml",
    axes: {
      m: { role: "variable" },
      n: { role: "variable" },
      k: { role: "variable" },
      l: { role: "variable" },
      seed: { role: "variable" },
      k_scales: { role: "derived", expression: "k // 16" },
    },
    inputs: [
      { name: "a", shape: ["m", "k", "l"], dtype: "nvfp4" },
      { name: "b1", shape: ["n", "k", "l"], dtype: "nvfp4" },
      { name: "b2", shape: ["n", "k", "l"], dtype: "nvfp4" },
      { name: "sfa", shape: ["m", "k_scales", "l"], dtype: "fp8_e4m3" },
      { name: "sfb1", shape: ["n", "k_scales", "l"], dtype: "fp8_e4m3" },
      { name: "sfb2", shape: ["n", "k_scales", "l"], dtype: "fp8_e4m3" },
    ],
    outputs: [{ name: "c", shape: ["m", "n", "l"], dtype: "fp16" }],
    tags: ["gemm", "quantization"],
    config: "nvidia_nvfp4_submissions",
    scoring: "aggregate",
    suite: {
      statistic: "geomean",
      cases: [
        {
          externalId: "0",
          axes: { m: 256, n: 4096, k: 7168, l: 1, seed: 1111 },
        },
        {
          externalId: "1",
          axes: { m: 512, n: 4096, k: 7168, l: 1, seed: 1111 },
        },
        {
          externalId: "2",
          axes: { m: 256, n: 3072, k: 4096, l: 1, seed: 1111 },
        },
        {
          externalId: "3",
          axes: { m: 512, n: 3072, k: 7168, l: 1, seed: 1111 },
        },
      ],
    },
    gpus: ["NVIDIA"],
  },
  {
    leaderboard: "modal_nvfp4_dual_gemm",
    slug: "gpumode-modal-nvfp4-dual-gemm",
    title: "NVFP4 dual GEMM (Modal)",
    family: "gemm",
    description:
      "NVFP4 block-scaled dual matrix multiply with SiLU for B200: C = silu(A @ B1) * (A @ B2), with A (m×k×l), B1 and B2 (n×k×l) in nvfp4 e2m1, fp8 scale factors per 16 elements of k, and fp16 output (m×n×l). Identical task definition to nvfp4_dual_gemm, published as a separate board on a different runner fleet.",
    taskPath: "problems/nvidia/modal_nvfp4_dual_gemm/task.yml",
    axes: {
      m: { role: "variable" },
      n: { role: "variable" },
      k: { role: "variable" },
      l: { role: "variable" },
      seed: { role: "variable" },
      k_scales: { role: "derived", expression: "k // 16" },
    },
    inputs: [
      { name: "a", shape: ["m", "k", "l"], dtype: "nvfp4" },
      { name: "b1", shape: ["n", "k", "l"], dtype: "nvfp4" },
      { name: "b2", shape: ["n", "k", "l"], dtype: "nvfp4" },
      { name: "sfa", shape: ["m", "k_scales", "l"], dtype: "fp8_e4m3" },
      { name: "sfb1", shape: ["n", "k_scales", "l"], dtype: "fp8_e4m3" },
      { name: "sfb2", shape: ["n", "k_scales", "l"], dtype: "fp8_e4m3" },
    ],
    outputs: [{ name: "c", shape: ["m", "n", "l"], dtype: "fp16" }],
    tags: ["gemm", "quantization"],
    config: "nvidia_nvfp4_submissions",
    scoring: "aggregate",
    suite: {
      statistic: "geomean",
      cases: [
        {
          externalId: "0",
          axes: { m: 256, n: 4096, k: 7168, l: 1, seed: 1111 },
        },
        {
          externalId: "1",
          axes: { m: 512, n: 4096, k: 7168, l: 1, seed: 1111 },
        },
        {
          externalId: "2",
          axes: { m: 256, n: 3072, k: 4096, l: 1, seed: 1111 },
        },
        {
          externalId: "3",
          axes: { m: 512, n: 3072, k: 7168, l: 1, seed: 1111 },
        },
      ],
    },
    gpus: ["B200"],
  },
  {
    leaderboard: "nvfp4_group_gemm",
    slug: "gpumode-nvfp4-group-gemm",
    title: "NVFP4 group GEMM",
    family: "gemm",
    description:
      "NVFP4 block-scaled group matrix multiply for B200: g independent GEMMs, each with its own (m, n, k) problem size, over nvfp4 e2m1 operands with fp8 scale factors per 16 elements of k and fp16 outputs. Per-group m and n are divisible by the kernel's mma tile, k by 256, and the batch dim l is always 1. Tensor shapes below are per group.",
    taskPath: "problems/nvidia/nvfp4_group_gemm/task.yml",
    // m, n, k vary per group within a case; benchmark specs carry them as
    // per-group lists, folded into each case's externalId (dot-joined).
    axes: {
      g: { role: "variable" },
      m: { role: "variable" },
      n: { role: "variable" },
      k: { role: "variable" },
      seed: { role: "variable" },
      l: { role: "constant", value: 1 },
      k_scales: { role: "derived", expression: "k // 16" },
    },
    inputs: [
      { name: "a", shape: ["m", "k", "l"], dtype: "nvfp4" },
      { name: "b", shape: ["n", "k", "l"], dtype: "nvfp4" },
      { name: "sfa", shape: ["m", "k_scales", "l"], dtype: "fp8_e4m3" },
      { name: "sfb", shape: ["n", "k_scales", "l"], dtype: "fp8_e4m3" },
    ],
    outputs: [{ name: "c", shape: ["m", "n", "l"], dtype: "fp16" }],
    tags: ["gemm", "quantization"],
    config: "nvidia_nvfp4_submissions",
    scoring: "aggregate",
    suite: {
      statistic: "geomean",
      cases: [
        {
          externalId:
            "0-m80.176.128.72.64.248.96.160-n4096.4096.4096.4096.4096.4096.4096.4096-k7168.7168.7168.7168.7168.7168.7168.7168",
          axes: { g: 8, seed: 1111 },
        },
        {
          externalId:
            "1-m40.76.168.72.164.148.196.160-n7168.7168.7168.7168.7168.7168.7168.7168-k2048.2048.2048.2048.2048.2048.2048.2048",
          axes: { g: 8, seed: 1111 },
        },
        {
          externalId: "2-m192.320-n3072.3072-k4096.4096",
          axes: { g: 2, seed: 1111 },
        },
        {
          externalId: "3-m128.384-n4096.4096-k1536.1536",
          axes: { g: 2, seed: 1111 },
        },
      ],
    },
    gpus: ["NVIDIA", "B200"],
  },
]
