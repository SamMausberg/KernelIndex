// Serving manifest bodies (§8.16, §9.1 — Week 9). Serving is a separate
// resolver surface: these kinds share the envelope, canonicalization, and
// provenance rules with kernel kinds but never a run table, comparison key,
// or universal score. Fields are §8.16 trimmed to what sources actually
// state; what a source does not state stays optional and is never guessed.
import { z } from "zod"
import {
  digestString,
  gitCommit,
  httpsUrl,
  slug,
  token,
  utcInstant,
} from "./common.ts"

/** Prompt/output token shape: a named distribution, its scale, or a trace. */
const tokenDistribution = z.strictObject({
  distribution: token,
  mean: z.number().positive().optional(),
  maximum: z.int().positive().optional(),
  artifactDigest: digestString.optional(),
})

/** Same shape as kernel measurements (§10.2): percentile in `statistic`. */
const servingMeasurement = z.strictObject({
  metric: token,
  unit: token,
  statistic: token,
  value: z.number().finite(),
  sampleCount: z.int().positive().optional(),
})

/** A declared SLO bound the harness enforces — a cited fact of the workload
 * definition (metadata.sourceRefs names the rules), never a measurement. */
const sloBound = z.strictObject({
  metric: token,
  statistic: token,
  operator: z.enum(["<=", "<"]),
  value: z.number().positive(),
  unit: token,
})

/** Model identity for serving cohorts (§8.16; closes the §9.1 kind gap). */
export const modelRevisionBody = z.strictObject({
  /** The model's name as its source states it (e.g. an MLPerf reference
   * model such as "llama2-70b-99"); the identity within that source. */
  model: z.string().max(200),
  repository: z
    .strictObject({
      host: z.enum(["huggingface", "github", "other"]),
      id: z.string().max(200),
      revision: z.string().max(100).optional(),
    })
    .optional(),
  tokenizer: z
    .strictObject({
      name: z.string().max(200).optional(),
      revision: z.string().max(100).optional(),
      digest: digestString.optional(),
    })
    .optional(),
  architecture: z.string().max(100).optional(),
  parameterCount: z.int().positive().optional(),
  contextLength: z.int().positive().optional(),
  modality: token.optional(),
  license: z.string().max(200).optional(),
})

export const servingStackRevisionBody = z.strictObject({
  project: z.strictObject({
    name: z.string().max(200),
    repository: httpsUrl.optional(),
  }),
  revision: z.strictObject({
    version: z.string().max(120).optional(),
    commit: gitCommit.optional(),
    containerDigest: digestString.optional(),
  }),
  /** Backend composition, e.g. ["pytorch", "rocm"] or ["trtllm", "triton"]. */
  backends: z.array(token).max(8).optional(),
  apiProtocol: token.optional(),
  license: z.string().max(200).optional(),
})

export const servingConfigurationBody = z.strictObject({
  stackDigest: digestString,
  dtype: token.optional(),
  quantization: token.optional(),
  parallelism: z
    .strictObject({
      tensor: z.int().positive().optional(),
      pipeline: z.int().positive().optional(),
      data: z.int().positive().optional(),
      expert: z.int().positive().optional(),
      context: z.int().positive().optional(),
    })
    .optional(),
  attentionBackend: token.optional(),
  kvCache: z
    .strictObject({
      dtype: token.optional(),
      capacityTokens: z.int().positive().optional(),
    })
    .optional(),
  limits: z
    .strictObject({
      maxSequenceLength: z.int().positive().optional(),
      maxBatchSize: z.int().positive().optional(),
      maxNumTokens: z.int().positive().optional(),
    })
    .optional(),
  speculative: z
    .strictObject({
      method: token,
      draftModel: z.string().max(200).optional(),
    })
    .optional(),
  /** Bounded backend-specific options that materially affect results
   * (§8.16); plain string values only — no expression language (§9.1). */
  options: z.record(token, z.string().max(500)).optional(),
})

export const servingWorkloadBody = z.strictObject({
  dataset: z
    .strictObject({
      name: z.string().max(200),
      digest: digestString.optional(),
    })
    .optional(),
  tokens: z
    .strictObject({
      prompt: tokenDistribution.optional(),
      output: tokenDistribution.optional(),
    })
    .optional(),
  streaming: z.boolean(),
  loadGeneration: z.enum(["open_loop", "closed_loop", "offline"]),
  arrival: token.optional(),
  requestRatePerSecond: z.number().positive().optional(),
  slo: z.array(sloBound).max(8).optional(),
  sampling: z
    .strictObject({
      temperature: z.number().optional(),
      seeded: z.boolean().optional(),
    })
    .optional(),
  durationSeconds: z.int().positive().optional(),
  requestCount: z.int().positive().optional(),
})

export const servingRunStatus = z.enum([
  "valid",
  "invalid",
  "incomplete_evidence",
])

export const servingRunBody = z.strictObject({
  modelDigest: digestString,
  configurationDigest: digestString,
  workloadDigest: digestString,
  topology: z.strictObject({
    acceleratorVendor: token.optional(),
    acceleratorModel: z.string().max(200),
    acceleratorsPerNode: z.int().positive(),
    nodeCount: z.int().positive(),
    interconnect: z.string().max(200).optional(),
  }),
  harness: z.strictObject({
    name: token,
    version: z.string().max(100),
  }),
  placement: token.optional(),
  /** Comparability gate input (§11.1): e.g. mlperf-closed-99, exact_model. */
  qualityPolicy: token,
  status: servingRunStatus,
  /** Multi-objective by design: no single primary metric exists (§8.16). */
  measurements: z.array(servingMeasurement).min(1).max(64),
  sourceNative: z
    .strictObject({
      source: slug,
      benchmark: z.string().max(200),
      scenario: token,
      division: token,
      category: token,
      externalId: z.string().max(500),
      metrics: z
        .record(token, z.union([z.number(), z.string().max(500)]))
        .optional(),
    })
    .optional(),
  caveats: z.array(z.string().max(500)).max(16).optional(),
  observedAt: utcInstant,
})
