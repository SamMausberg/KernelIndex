// Linear-algebra decomposition boards (problems/linalg, B200, aggregate
// scoring). Hand-transcribed from gpu-mode/reference-kernels task.yml +
// reference.py. problem_name/runner verified 2026-08-15 against the
// datasets-server filter slice of GPUMODE/kernelbot-data config
// linalg_submissions: cholesky (5428), eigh (3497), qr_v2 (5368) passed rows
// — all B200, sums to the full 14293; "qr" (the retired v1 board) has none.
// Leaderboard names drop the repo's _py directory suffix.
//
// Benchmark specs carry an optional non-integer `case` label (matrix
// structure); it is folded into the case's externalId.
import type { CuratedProblem } from "../problems.ts"

export const LINALG_PROBLEMS: CuratedProblem[] = [
  {
    leaderboard: "cholesky",
    slug: "gpumode-cholesky",
    title: "Batched Cholesky factorization",
    family: "cholesky",
    description:
      "Batched dense Cholesky factorization on B200: from a symmetric positive definite fp32 batch×n×n input A, return a lower-triangular fp32 L with positive diagonal such that A = L @ L.T. Correctness is property-based (structure plus reconstruction residual) rather than elementwise comparison, and the grid spans thousands of small matrices up to a single 32768×32768 factorization. cond is a deterministic dynamic-range control on the generated inputs.",
    taskPath: "problems/linalg/cholesky_py/task.yml",
    axes: {
      batch: { role: "variable" },
      n: { role: "variable" },
      cond: { role: "variable" },
      seed: { role: "variable" },
    },
    inputs: [{ name: "a", shape: ["batch", "n", "n"], dtype: "fp32" }],
    outputs: [{ name: "l", shape: ["batch", "n", "n"], dtype: "fp32" }],
    tags: ["cholesky"],
    config: "linalg_submissions",
    scoring: "aggregate",
    suite: {
      statistic: "geomean",
      cases: [
        { externalId: "0", axes: { batch: 4096, n: 32, cond: 2, seed: 41032 } },
        { externalId: "1", axes: { batch: 1024, n: 64, cond: 2, seed: 41064 } },
        { externalId: "2", axes: { batch: 256, n: 128, cond: 2, seed: 41128 } },
        { externalId: "3", axes: { batch: 64, n: 256, cond: 2, seed: 41256 } },
        { externalId: "4", axes: { batch: 16, n: 512, cond: 2, seed: 41512 } },
        {
          externalId: "5",
          axes: { batch: 640, n: 512, cond: 2, seed: 510512 },
        },
        { externalId: "6", axes: { batch: 4, n: 1024, cond: 2, seed: 42024 } },
        {
          externalId: "7",
          axes: { batch: 60, n: 1024, cond: 2, seed: 511024 },
        },
        { externalId: "8", axes: { batch: 2, n: 2048, cond: 2, seed: 44048 } },
        { externalId: "9", axes: { batch: 8, n: 2048, cond: 2, seed: 512048 } },
        { externalId: "10", axes: { batch: 1, n: 4096, cond: 2, seed: 48096 } },
        {
          externalId: "11",
          axes: { batch: 2, n: 4096, cond: 2, seed: 514096 },
        },
        { externalId: "12", axes: { batch: 1, n: 8192, cond: 2, seed: 48192 } },
        {
          externalId: "13",
          axes: { batch: 1, n: 16384, cond: 2, seed: 48284 },
        },
        {
          externalId: "14",
          axes: { batch: 1, n: 32768, cond: 2, seed: 48368 },
        },
      ],
    },
    gpus: ["B200"],
  },
  {
    leaderboard: "eigh",
    slug: "gpumode-eigh",
    title: "Batched symmetric eigendecomposition",
    family: "eigh",
    description:
      "Batched real symmetric eigendecomposition on B200: from a symmetric fp32 batch×n×n input A, return (Q, L) in the torch.linalg.eigh convention — orthonormal eigenvector columns and ascending eigenvalues. Correctness is gated on the eigen-equation, reconstruction, and orthogonality residuals measured in fp64, and the benchmark set includes mixed and ill-conditioned batches so robustness is ranked, not only gated. cond is a deterministic dynamic-range knob on the generated inputs.",
    taskPath: "problems/linalg/eigh_py/task.yml",
    axes: {
      batch: { role: "variable" },
      n: { role: "variable" },
      cond: { role: "variable" },
      seed: { role: "variable" },
    },
    inputs: [{ name: "a", shape: ["batch", "n", "n"], dtype: "fp32" }],
    outputs: [
      { name: "q", shape: ["batch", "n", "n"], dtype: "fp32" },
      { name: "l", shape: ["batch", "n"], dtype: "fp32" },
    ],
    tags: ["eigh"],
    config: "linalg_submissions",
    scoring: "aggregate",
    suite: {
      statistic: "geomean",
      cases: [
        { externalId: "0", axes: { batch: 20, n: 32, cond: 1, seed: 43214 } },
        { externalId: "1", axes: { batch: 40, n: 176, cond: 1, seed: 423011 } },
        { externalId: "2", axes: { batch: 40, n: 352, cond: 1, seed: 123456 } },
        { externalId: "3", axes: { batch: 640, n: 512, cond: 2, seed: 1029 } },
        { externalId: "4", axes: { batch: 60, n: 1024, cond: 2, seed: 75342 } },
        { externalId: "5", axes: { batch: 8, n: 2048, cond: 1, seed: 224466 } },
        {
          externalId: "6-mixed",
          axes: { batch: 640, n: 512, cond: 2, seed: 770001 },
        },
        {
          externalId: "7-mixed",
          axes: { batch: 60, n: 1024, cond: 2, seed: 770002 },
        },
        {
          externalId: "8-rankdef",
          axes: { batch: 640, n: 512, cond: 0, seed: 770003 },
        },
        {
          externalId: "9-clustered",
          axes: { batch: 640, n: 512, cond: 0, seed: 770004 },
        },
        {
          externalId: "10-nearrank",
          axes: { batch: 60, n: 1024, cond: 0, seed: 770005 },
        },
        {
          externalId: "11-lapack_dense_even_spectrum",
          axes: { batch: 640, n: 512, cond: 0, seed: 780001 },
        },
        {
          externalId: "12-lapack_dense_geometric_spectrum",
          axes: { batch: 60, n: 1024, cond: 0, seed: 780007 },
        },
      ],
    },
    gpus: ["B200"],
  },
  {
    leaderboard: "qr_v2",
    slug: "gpumode-qr-v2",
    title: "Batched compact-Householder QR",
    family: "qr",
    description:
      "Batched square compact-Householder QR factorization on B200: from an fp32 batch×n×n input A, return (H, tau) in the torch.geqrf convention — R in the upper triangle of H, Householder vectors below, reflector coefficients in tau. The checker validates the LAPACK-style factor residual and orthogonality of the materialized Q with purely relative fp32-accuracy gates, and the benchmark set includes mixed and ill-conditioned batches so conditioning robustness is ranked. cond is a deterministic column-scaling knob on the generated inputs.",
    taskPath: "problems/linalg/qr_v2/task.yml",
    axes: {
      batch: { role: "variable" },
      n: { role: "variable" },
      cond: { role: "variable" },
      seed: { role: "variable" },
    },
    inputs: [{ name: "a", shape: ["batch", "n", "n"], dtype: "fp32" }],
    outputs: [
      { name: "h", shape: ["batch", "n", "n"], dtype: "fp32" },
      { name: "tau", shape: ["batch", "n"], dtype: "fp32" },
    ],
    tags: ["qr"],
    config: "linalg_submissions",
    scoring: "aggregate",
    suite: {
      statistic: "geomean",
      cases: [
        { externalId: "0", axes: { batch: 20, n: 32, cond: 1, seed: 43214 } },
        { externalId: "1", axes: { batch: 40, n: 176, cond: 1, seed: 423011 } },
        { externalId: "2", axes: { batch: 40, n: 352, cond: 1, seed: 123456 } },
        { externalId: "3", axes: { batch: 640, n: 512, cond: 2, seed: 1029 } },
        { externalId: "4", axes: { batch: 60, n: 1024, cond: 2, seed: 75342 } },
        { externalId: "5", axes: { batch: 8, n: 2048, cond: 1, seed: 224466 } },
        { externalId: "6", axes: { batch: 2, n: 4096, cond: 1, seed: 32412 } },
        {
          externalId: "7-mixed",
          axes: { batch: 640, n: 512, cond: 2, seed: 770001 },
        },
        {
          externalId: "8-mixed",
          axes: { batch: 60, n: 1024, cond: 2, seed: 770002 },
        },
        {
          externalId: "9-rankdef",
          axes: { batch: 640, n: 512, cond: 0, seed: 770003 },
        },
        {
          externalId: "10-clustered",
          axes: { batch: 640, n: 512, cond: 0, seed: 770004 },
        },
        {
          externalId: "11-nearrank",
          axes: { batch: 60, n: 1024, cond: 0, seed: 770005 },
        },
      ],
    },
    gpus: ["B200"],
  },
]
