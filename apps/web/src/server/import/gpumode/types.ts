// Upstream GPU MODE KernelBot shapes: the Hugging Face dataset
// GPUMODE/kernelbot-data read through the datasets-server rows/filter API.
// Redistribution is licensed (June 9 Researcher Reciprocity License v1.0)
// with attribution to GPU Mode — see docs/source-policy.md.
import { z } from "zod"

export const DATASET = "GPUMODE/kernelbot-data"
export const DATASETS_SERVER = "https://datasets-server.huggingface.co"
export const DATASET_URL = `https://huggingface.co/datasets/${DATASET}`
export const REFERENCE_KERNELS_REPO = "gpu-mode/reference-kernels"

export const GPUMODE_SOURCE = {
  slug: "gpumode-kernelbot",
  kind: "leaderboard",
  name: "GPU MODE KernelBot",
  /** Rendered as the mandatory attribution + terms line (§14.10). */
  policy: {
    license: "June 9 Researcher Reciprocity License v1.0",
    attribution: "GPU Mode and the KernelBot dataset",
    url: DATASET_URL,
    terms:
      "Redistribution and public display permitted with notice retention and attribution; use for AI training requires researcher reciprocity.",
    verified: "2026-08-15",
    freshnessDays: 10,
  },
} as const

/** version 2: flat aggregate configs + mirrored submission source code. */
export const PARSER = { name: "gpumode-kernelbot", version: "2" } as const

/** The only config publishing per-shape timings plus system info today. */
export const SUBMISSIONS_CONFIG = "amd_successful_submissions"

/** One row of the leaderboards config. */
export const gmLeaderboard = z.looseObject({
  id: z.int(),
  name: z.string(),
  description: z.string().nullish(),
  deadline: z.string().nullish(),
  gpu_types: z.array(z.string()).nullish(),
})

/** One amd_successful_submissions row (per-shape ns stats in run_result). */
export const gmSubmissionRow = z.looseObject({
  submission_id: z.int(),
  leaderboard_id: z.int(),
  user_id: z.union([z.int(), z.string()]),
  submission_time: z.string(),
  file_name: z.string().nullish(),
  code: z.string().nullish(),
  code_id: z.union([z.int(), z.string()]).nullish(),
  run_id: z.union([z.int(), z.string()]).nullish(),
  run_mode: z.string().nullish(),
  run_score: z.number().nullish(),
  run_passed: z.boolean().nullish(),
  /** Flattened map: benchmark-count plus benchmark.N.{spec,mean,best,...}. */
  run_result: z.record(z.string(), z.unknown()).nullish(),
  run_system_info: z
    .looseObject({
      cpu: z.string().nullish(),
      gpu: z.string().nullish(),
      platform: z.string().nullish(),
      torch: z.string().nullish(),
    })
    .nullish(),
})

/** One flat-config row (aggregate leaderboard score per submission). The
 * pmpp variant adds nullable extras; looseObject tolerates them. */
export const gmFlatRow = z.looseObject({
  submission_id: z.int(),
  leaderboard_id: z.int().nullish(),
  problem_name: z.string(),
  user_id: z.union([z.int(), z.string()]),
  user_name: z.string().nullish(),
  code_id: z.union([z.int(), z.string()]).nullish(),
  file_name: z.string().nullish(),
  submission_time: z.string(),
  status: z.string().nullish(),
  score: z.number().nullish(),
  passed: z.boolean().nullish(),
  mode: z.string().nullish(),
  runner: z.string().nullish(),
  code: z.string().nullish(),
})

export type GmLeaderboard = z.output<typeof gmLeaderboard>
export type GmSubmissionRow = z.output<typeof gmSubmissionRow>
export type GmFlatRow = z.output<typeof gmFlatRow>

/**
 * Source-agnostic candidate envelope discovery hands to selection: the
 * fields ranking, progression chains, and code mirroring need, plus the raw
 * row for per-shape evidence unfolding.
 */
export type GmCandidate = {
  submissionId: number
  userId: string
  submissionTime: string
  fileName: string | null
  /** Leaderboard score in seconds; lower is better. */
  score: number
  code: string | null
  /** Cohort label: flat runner column, or the per-shape system GPU name. */
  runner: string
  raw: GmSubmissionRow | GmFlatRow
}

/** One benchmark case unfolded from the flattened run_result map. Some
 * competitions recorded only mean/std/runs — best/worst may be absent. */
export type GmBenchmark = {
  index: number
  axes: Record<string, number>
  meanNs: number
  bestNs: number | null
  worstNs: number | null
  stdNs: number | null
  runs: number | null
}
