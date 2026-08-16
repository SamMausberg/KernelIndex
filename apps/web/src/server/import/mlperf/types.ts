// MLPerf Inference results (docs/source-policy.md): official per-round
// summary_results.json from the Apache-2.0 result repos, closed division,
// datacenter suite, token-throughput LLM benchmarks only. Results import
// unmodified — never normalized per accelerator, never given a universal
// score, never mixed with kernel leaderboards (§22.10).
import { z } from "zod"

export const MLPERF_SOURCE = {
  slug: "mlperf-inference",
  kind: "benchmark",
  name: "MLPerf Inference",
  policy: {
    license: "Apache-2.0",
    attribution:
      "MLPerf™ Inference results by MLCommons; MLPerf™ is a trademark of MLCommons",
    url: "https://mlcommons.org/benchmarks/inference-datacenter/",
    terms:
      "Apache-2.0 result repos; official published results shown unmodified with round, division, submitter, system, and entry ID per the MLPerf Results Messaging Guidelines.",
    verified: "2026-08-16",
    freshnessDays: 90,
  },
} as const

export const PARSER = { name: "mlperf-inference", version: "1" } as const

/** Pinned per-round result repos (immutable official results). The round
 * date is the result repo's creation date — a verifiable publication fact. */
export const ROUNDS = [
  {
    round: "v5.1",
    repo: "mlcommons/inference_results_v5.1",
    ref: "5ea4f62ef62536e6bf4d78a9b440fb9035ddfb4a",
    publishedAt: "2025-09-04T19:30:14Z",
  },
  {
    round: "v6.0",
    repo: "mlcommons/inference_results_v6.0",
    ref: "4d3916ac9cf474b679cdfcf492d43a0559418ad1",
    publishedAt: "2026-03-26T19:39:54Z",
  },
] as const
export type MlperfRound = (typeof ROUNDS)[number]

/** The published inference rules; every declared SLO cites this document. */
export const RULES_URL =
  "https://github.com/mlcommons/inference_policies/blob/master/inference_rules.adoc"

type Slo = { ttftMs: number; tpotMs: number }

/** Token-throughput LLM benchmarks: base model identity, dataset, and the
 * per-scenario TTFT/TPOT p99 bounds transcribed from the inference rules
 * (RULES_URL). The -99/-99.9 suffix is an accuracy target, not a model:
 * it maps to the quality policy, never to model identity. */
export const BENCHMARKS: Record<
  string,
  {
    model: string
    dataset: string
    quality: string
    slo: { Server?: Slo; Interactive?: Slo }
  }
> = {
  "llama2-70b-99": {
    model: "Llama-2-70B (MLPerf reference)",
    dataset: "OpenOrca (max_seq_len=1024)",
    quality: "mlperf-closed-99",
    slo: {
      Server: { ttftMs: 2000, tpotMs: 200 },
      Interactive: { ttftMs: 450, tpotMs: 40 },
    },
  },
  "llama2-70b-99.9": {
    model: "Llama-2-70B (MLPerf reference)",
    dataset: "OpenOrca (max_seq_len=1024)",
    quality: "mlperf-closed-99.9",
    slo: {
      Server: { ttftMs: 2000, tpotMs: 200 },
      Interactive: { ttftMs: 450, tpotMs: 40 },
    },
  },
  "llama3.1-8b": {
    model: "Llama-3.1-8B (MLPerf reference)",
    dataset: "CNN DailyMail v3.0.0 (max_seq_len=2048)",
    quality: "mlperf-closed-99",
    slo: {
      Server: { ttftMs: 2000, tpotMs: 100 },
      Interactive: { ttftMs: 500, tpotMs: 30 },
    },
  },
  "llama3.1-405b": {
    model: "Llama-3.1-405B (MLPerf reference)",
    dataset: "LongBench/LongDataCollections/Ruler/GovReport subset",
    quality: "mlperf-closed-99",
    slo: {
      Server: { ttftMs: 6000, tpotMs: 175 },
      Interactive: { ttftMs: 4500, tpotMs: 80 },
    },
  },
  "mixtral-8x7b": {
    model: "Mixtral-8x7B (MLPerf reference)",
    dataset: "OpenOrca + GSM8K + MBXP (5k each)",
    quality: "mlperf-closed-99",
    slo: { Server: { ttftMs: 2000, tpotMs: 200 } },
  },
  "deepseek-r1": {
    model: "DeepSeek-R1 (MLPerf reference)",
    dataset: "mlperf_deepseek_r1",
    quality: "mlperf-closed-99",
    slo: {
      Server: { ttftMs: 2000, tpotMs: 80 },
      Interactive: { ttftMs: 1500, tpotMs: 15 },
    },
  },
  "gpt-oss-120b": {
    model: "GPT-OSS-120B (MLPerf reference)",
    dataset: "AIME25 + GPQA Diamond + LiveCodeBench v6",
    quality: "mlperf-closed-99",
    slo: {
      Server: { ttftMs: 3000, tpotMs: 80 },
      Interactive: { ttftMs: 2000, tpotMs: 20 },
    },
  },
}

/** One summary row; unknown extra fields are upstream metadata, kept loose. */
export const mlperfRow = z.looseObject({
  ID: z.string(),
  Submitter: z.string(),
  Availability: z.string(),
  Category: z.string(),
  Suite: z.string(),
  System: z.string(),
  Model: z.string(),
  Scenario: z.string(),
  Nodes: z.number().int().positive(),
  Accelerator: z.string(),
  "a#": z.number().int().positive(),
  Software: z.string(),
  weight_data_types: z.string().nullish(),
  Notes: z.string().nullish(),
  Details: z.string().nullish(),
  Performance_Result: z.number().positive(),
  Performance_Units: z.string(),
})
export type MlperfRow = z.output<typeof mlperfRow>
