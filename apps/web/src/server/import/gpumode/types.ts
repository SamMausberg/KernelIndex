// Upstream GPU MODE KernelBot shapes: the Hugging Face dataset
// GPUMODE/kernelbot-data read through the datasets-server rows/filter API.
// Redistribution is licensed (June 9 Researcher Reciprocity License v1.0)
// with attribution to GPU Mode — see docs/source-policy.md.
import { z } from "zod"

export const GPUMODE_SOURCE = {
  slug: "gpumode-kernelbot",
  kind: "leaderboard",
  name: "GPU MODE KernelBot",
} as const

export const PARSER = { name: "gpumode-kernelbot", version: "1" } as const

export const DATASET = "GPUMODE/kernelbot-data"
export const DATASETS_SERVER = "https://datasets-server.huggingface.co"
/** The only config publishing per-shape timings plus system info today. */
export const SUBMISSIONS_CONFIG = "amd_successful_submissions"
export const DATASET_URL = `https://huggingface.co/datasets/${DATASET}`
export const REFERENCE_KERNELS_REPO = "gpu-mode/reference-kernels"

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

export type GmLeaderboard = z.output<typeof gmLeaderboard>
export type GmSubmissionRow = z.output<typeof gmSubmissionRow>

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
