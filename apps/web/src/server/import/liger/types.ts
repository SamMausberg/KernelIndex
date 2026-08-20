// Upstream Liger-Kernel benchmark shapes: the committed CSV
// benchmark/data/all_benchmark_data.csv in linkedin/Liger-Kernel, pinned to
// the latest commit touching it. BSD-2-Clause — see docs/source-policy.md.
import { z } from "zod"

export const LIGER_REPO = "linkedin/Liger-Kernel"
export const LIGER_REPO_URL = `https://github.com/${LIGER_REPO}`
export const CSV_PATH = "benchmark/data/all_benchmark_data.csv"

export const LIGER_SOURCE = {
  slug: "liger-kernel-bench",
  kind: "benchmark",
  name: "Liger-Kernel benchmarks",
  policy: {
    license: "BSD-2-Clause",
    attribution: "LinkedIn Liger-Kernel",
    url: LIGER_REPO_URL,
    terms: "Redistribution permitted with copyright notice retention.",
    verified: "2026-08-14",
    freshnessDays: 30,
  },
} as const

export const PARSER = { name: "liger-kernel-bench", version: "1" } as const

/** One CSV row. Numeric columns arrive as strings; coercion happens after
 * the curation guard decides the row is understood. */
export const ligerRow = z.strictObject({
  kernel_name: z.string(),
  kernel_provider: z.string(),
  kernel_operation_mode: z.string(),
  metric_name: z.string(),
  metric_unit: z.string(),
  x_name: z.string(),
  x_label: z.string(),
  x_value: z.string(),
  y_value_50: z.string(),
  y_value_20: z.string(),
  y_value_80: z.string(),
  extra_benchmark_config_str: z.string(),
  gpu_name: z.string(),
  timestamp: z.string(),
  liger_version: z.string(),
})

export type LigerRow = z.output<typeof ligerRow>

/** The dtype tokens the benchmark configs use. */
export const DTYPES: Record<string, string> = {
  "torch.bfloat16": "bf16",
  "torch.float16": "fp16",
  "torch.float32": "fp32",
}

export type LigerBinding = {
  /** Concrete integer axis bindings for the workload case. */
  axes: Record<string, number>
  /** Float dtype token for the signature's "cfg" tensors. */
  dtype: string
  scalars?: Record<string, number>
}

type Cfg = Record<string, unknown>

export type LigerKernelSpec = {
  csvName: string
  slug: string
  family: string
  title: string
  description: string
  /** Signature dims are axis names or literal ints; dtype "cfg" means the
      workload's float dtype, anything else is a fixed token. */
  inputs: { name: string; shape: (string | number)[]; dtype: string }[]
  outputs: { name: string; shape: (string | number)[]; dtype: string }[]
  /** Derived axes (§9.1 tiny grammar) computed from the bound axes. */
  derived?: Record<string, string>
  /** Row config → axes, or null when the config shape is not understood. */
  bind: (x: number, xName: string, config: Cfg) => LigerBinding | null
}

export const int = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null

export const dtypeOf = (value: unknown): string | null =>
  typeof value === "string" ? (DTYPES[value] ?? null) : null

export const eps = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null
