// Upstream SOL-ExecBench shapes (§14.5). Objects are parsed loosely: the
// fields KernelIndex consumes are validated strictly, unknown upstream
// additions surface as drift warnings instead of silent mis-parses (§14.8).
import { z } from "zod"

export const SOL_SOURCE = {
  slug: "sol-execbench",
  kind: "leaderboard",
  name: "NVIDIA SOL-ExecBench",
} as const

export const PARSER_NAME = "sol-execbench"
export const PARSER_VERSION = "1"

export const LEADERBOARD_BASE =
  "https://research.nvidia.com/benchmarks/sol-execbench/api"
export const REPO_RAW_BASE =
  "https://raw.githubusercontent.com/nvidia/sol-execbench"

const solAxis = z.looseObject({
  type: z.enum(["var", "const", "expr"]),
  value: z.int().optional(),
  expression: z.string().nullish(),
  description: z.string().nullish(),
})

const solTensor = z.looseObject({
  // Null shape means a scalar input.
  shape: z.array(z.union([z.string(), z.int()])).nullish(),
  dtype: z.string(),
  description: z.string().nullish(),
})

/**
 * One workload case. Local workload.jsonl lines carry uuid, per-argument
 * input descriptors, and tolerances; the public kernel-detail API publishes
 * only the axes plus baseline/speed-of-light latencies. Absent fields stay
 * absent downstream — nothing is invented (§14.5).
 */
export const solWorkloadEntry = z.looseObject({
  uuid: z.string().nullish(),
  axes: z.record(z.string(), z.int()),
  inputs: z
    .record(
      z.string(),
      z.looseObject({
        type: z.string(),
        value: z.union([z.number(), z.boolean()]).optional(),
        path: z.string().optional(),
        tensor_key: z.string().optional(),
      }),
    )
    .nullish(),
  tolerance: z
    .looseObject({
      max_atol: z.number().nonnegative().optional(),
      max_rtol: z.number().nonnegative().optional(),
    })
    .nullish(),
  baseline_latency_ms: z.number().nullish(),
  sol_ms: z.number().nullish(),
})

/** definition.json — also the shape of /api/kernels/{id}, which adds the
 * leaderboard fields (workloads, baselines, speed-of-light metadata). */
export const solDefinition = z.looseObject({
  name: z.string(),
  op_type: z.string().nullish(),
  description: z.string().nullish(),
  title: z.string().nullish(),
  id: z.int().nullish(),
  gpu_types: z.array(z.string()).nullish(),
  workloads: z.array(solWorkloadEntry).nullish(),
  baseline: z.string().nullish(),
  baseline_latency_ms: z.number().nullish(),
  latency_unit: z.string().nullish(),
  sol_is_dummy: z.boolean().nullish(),
  axes: z.record(z.string(), solAxis),
  inputs: z.record(z.string(), solTensor),
  outputs: z.record(z.string(), solTensor),
  reference: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  hf_id: z.string().nullish(),
  custom_inputs_entrypoint: z.string().nullish(),
})

/** solution_*.json from the repository examples. */
export const solSolution = z.looseObject({
  name: z.string(),
  definition: z.string(),
  author: z.string().nullish(),
  spec: z.looseObject({
    languages: z.array(z.string()),
    target_hardware: z.array(z.string()).nullish(),
    entry_point: z.string().nullish(),
    binding: z.string().nullish(),
    dependencies: z.array(z.string()).nullish(),
    destination_passing_style: z.boolean().nullish(),
  }),
  sources: z
    .array(z.looseObject({ path: z.string(), content: z.string() }))
    .nullish(),
  description: z.string().nullish(),
})

/** Official Trace document (docs/trace.md): one benchmark run. */
export const solTrace = z.looseObject({
  definition: z.string(),
  solution: z.string().nullish(),
  workload: solWorkloadEntry,
  evaluation: z
    .looseObject({
      status: z.string(),
      log: z.string().nullish(),
      correctness: z
        .looseObject({
          max_relative_error: z.number(),
          max_absolute_error: z.number(),
          has_nan: z.boolean().nullish(),
          has_inf: z.boolean().nullish(),
        })
        .nullish(),
      performance: z
        .looseObject({
          latency_ms: z.number().positive(),
          reference_latency_ms: z.number().nullish(),
          speedup_factor: z.number().nullish(),
        })
        .nullish(),
      environment: z.looseObject({
        hardware: z.string(),
        libs: z.record(z.string(), z.string()),
      }),
      timestamp: z.string(),
    })
    .nullish(),
})

/** /api/kernels list entry. */
export const solKernelSummary = z.looseObject({
  id: z.int(),
  name: z.string(),
  title: z.string().nullish(),
  gpu_types: z.array(z.string()),
  tags: z.array(z.string()).nullish(),
  submission_count: z.int().nullish(),
})

const IGNORED_SUBMISSION_FIELDS = [
  "type",
  "user_id",
  "kernel_title",
  "collection_id",
  "collection_submission_id",
  "collection_title",
  "benchmark_results",
  "disqualification_reason",
  "disqualification_source",
  "disqualified_at",
  "error_log",
  "original_filename",
  "started_at",
  "profiling_results",
  "review_status",
  "review_decision",
  "review_summary",
  "review_reasons",
  "review_policy_version",
  "review_hard_rule_id",
  "review_reviewer",
  "review_model",
  "run_log",
] as const

/** /api/submissions?kernel_id= entry: real published evaluation results. */
export const solSubmission = z.looseObject({
  ...Object.fromEntries(
    IGNORED_SUBMISSION_FIELDS.map((field) => [field, z.unknown().optional()]),
  ),
  id: z.int(),
  username: z.string(),
  kernel_id: z.int(),
  kernel_name: z.string(),
  submission_mode: z.string().nullish(),
  status: z.string(),
  is_correct: z.boolean().nullish(),
  sol_score: z.number().nullish(),
  latency_ms: z.number().nullish(),
  avg_speedup: z.number().nullish(),
  fast_1_count: z.int().nullish(),
  fast_1_total: z.int().nullish(),
  gpu_type: z.string(),
  worker_id: z.string().nullish(),
  evaluation_stack_version: z.string().nullish(),
  is_disqualified: z.boolean().nullish(),
  submitted_at: z.string().nullish(),
  finished_at: z.string().nullish(),
})

export type SolDefinition = z.output<typeof solDefinition>
export type SolWorkloadEntry = z.output<typeof solWorkloadEntry>
export type SolSolution = z.output<typeof solSolution>
export type SolTrace = z.output<typeof solTrace>
export type SolKernelSummary = z.output<typeof solKernelSummary>
export type SolSubmission = z.output<typeof solSubmission>

/** Unknown upstream keys: reported as drift warnings, never silently used. */
export function unknownKeys(
  value: Record<string, unknown>,
  known: Iterable<string>,
): string[] {
  const knownSet = new Set(known)
  return Object.keys(value).filter((key) => !knownSet.has(key))
}
