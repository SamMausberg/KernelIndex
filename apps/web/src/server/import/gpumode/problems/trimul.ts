// BioML Triangle Multiplicative Update board (problems/bioml/trimul,
// aggregate scoring). Hand-transcribed from gpu-mode/reference-kernels
// task.yml + reference.py. problem_name/runner verified 2026-08-15 against
// the datasets-server filter slice of GPUMODE/kernelbot-data config
// trimul_submissions: trimul on A100 (1858), B200 (1264), H100 (1893),
// MI300 (21) — sums to the full 5036 passed rows.
//
// Benchmark specs carry non-integer `nomask` (bool) and `distribution`
// (string) parameters; both are folded into each case's externalId.
import type { CuratedProblem } from "../problems.ts"

export const TRIMUL_PROBLEMS: CuratedProblem[] = [
  {
    leaderboard: "trimul",
    slug: "gpumode-trimul",
    title: "Triangle multiplicative update",
    family: "trimul",
    description:
      "Forward pass of the outgoing Triangle Multiplicative Update (TriMul) module from the AlphaFold3 paper, a core operation of protein structure prediction models (AlphaFold3, Chai, Protenix). The operator maps an fp32 tensor (bs, seqlen, seqlen, dim) to the same shape; a pair mask (bs, seqlen, seqlen), a model-weights dict, and a config dict accompany the input tensor. No gradients are required.",
    taskPath: "problems/bioml/trimul/task.yml",
    axes: {
      seqlen: { role: "variable" },
      bs: { role: "variable" },
      dim: { role: "variable" },
      hiddendim: { role: "variable" },
      seed: { role: "variable" },
    },
    inputs: [
      {
        name: "input",
        shape: ["bs", "seqlen", "seqlen", "dim"],
        dtype: "fp32",
      },
    ],
    outputs: [
      {
        name: "output",
        shape: ["bs", "seqlen", "seqlen", "dim"],
        dtype: "fp32",
      },
    ],
    tags: ["trimul", "model:alphafold3"],
    config: "trimul_submissions",
    scoring: "aggregate",
    suite: {
      statistic: "geomean",
      cases: [
        {
          externalId: "0-normal-nomask",
          axes: { seqlen: 256, bs: 2, dim: 128, hiddendim: 128, seed: 9371 },
        },
        {
          externalId: "1-cauchy-nomask",
          axes: { seqlen: 768, bs: 1, dim: 128, hiddendim: 128, seed: 381 },
        },
        {
          externalId: "2-normal-masked",
          axes: { seqlen: 256, bs: 2, dim: 384, hiddendim: 128, seed: 2301 },
        },
        {
          externalId: "3-normal-nomask",
          axes: { seqlen: 512, bs: 1, dim: 128, hiddendim: 128, seed: 12819 },
        },
        {
          externalId: "4-cauchy-nomask",
          axes: { seqlen: 1024, bs: 1, dim: 128, hiddendim: 128, seed: 381 },
        },
        {
          externalId: "5-normal-masked",
          axes: { seqlen: 768, bs: 1, dim: 384, hiddendim: 128, seed: 481 },
        },
        {
          externalId: "6-normal-nomask",
          axes: { seqlen: 1024, bs: 1, dim: 384, hiddendim: 128, seed: 23291 },
        },
      ],
    },
    gpus: ["A100", "B200", "H100", "MI300"],
  },
]
