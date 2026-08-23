// Serving wire schemas (§12.7, §13.2 — Week 9). Same drift gate: these
// mirror the serving read models; no aggregate score field exists by
// construction.
import { z } from "@hono/zod-openapi"
import type {
  ServingConfigurationSummary,
  ServingConstraint,
  ServingResolveInput,
  ServingResolveModel,
  ServingResultRow,
  ServingRunSummary,
} from "../../../lib/serving-models.ts"

export const servingConstraint = z.object({
  metric: z.string().max(60),
  statistic: z.string().max(30).optional(),
  operator: z.enum(["<=", "<"]),
  value: z.number().positive(),
}) satisfies z.ZodType<ServingConstraint>

export const resolveServingRequest = z.object({
  model: z.string().max(200).optional(),
  workload: z.string().max(200).optional(),
  hardware: z
    .object({
      model: z.string().max(200).optional(),
      countMaximum: z.number().int().positive().optional(),
    })
    .optional(),
  objective: z
    .object({
      direction: z.enum(["maximize", "minimize"]),
      metric: z.string().max(60),
      statistic: z.string().max(30).optional(),
    })
    .optional(),
  constraints: z.array(servingConstraint).max(8).optional(),
}) satisfies z.ZodType<ServingResolveInput>

export const servingMeasurementView = z.object({
  metric: z.string(),
  statistic: z.string(),
  value: z.number(),
  unit: z.string(),
})

const servingResultRow = z.object({
  runId: z.string(),
  rank: z.number().nullable(),
  onFrontier: z.boolean(),
  model: z.object({ name: z.string(), slug: z.string() }),
  stack: z.string(),
  configuration: z.string(),
  dtype: z.string().nullable(),
  qualityPolicy: z.string(),
  scenario: z.string(),
  hardware: z.object({
    model: z.string(),
    perNode: z.number(),
    nodes: z.number(),
    total: z.number(),
  }),
  harness: z.string(),
  measurements: z.array(servingMeasurementView),
  constraints: z.array(
    z.object({
      constraint: z.string(),
      state: z.enum(["measured", "declared", "unknown"]),
      satisfied: z.boolean().nullable(),
      detail: z.string(),
    }),
  ),
  caveats: z.array(z.string()),
  observedAt: z.string(),
  source: z.object({
    name: z.string(),
    externalId: z.string().nullable(),
    url: z.string().nullable(),
  }),
}) satisfies z.ZodType<ServingResultRow>

export const servingResolveResponse = z.object({
  illustrative: z.boolean(),
  input: resolveServingRequest,
  facets: z.object({
    models: z.array(
      z.object({ slug: z.string(), name: z.string(), runs: z.number() }),
    ),
    workloads: z.array(
      z.object({ slug: z.string(), name: z.string(), runs: z.number() }),
    ),
    hardware: z.array(z.string()),
    metrics: z.array(z.string()),
  }),
  groups: z.array(
    z.object({
      cohortKey: z.string(),
      description: z.string(),
      identity: z.object({
        model: z.string(),
        workload: z.string(),
        scenario: z.string(),
        topology: z.string(),
        quality: z.string(),
      }),
      rows: z.array(servingResultRow),
      excluded: z.array(
        z.object({
          runId: z.string(),
          configuration: z.string(),
          reasons: z.array(z.string()),
        }),
      ),
      sharedAxes: z.array(z.string()),
    }),
  ),
  totalRuns: z.number(),
  policyVersion: z.string(),
  generatedAt: z.string(),
}) satisfies z.ZodType<ServingResolveModel>

export const servingRunSummary = z.object({
  id: z.string(),
  model: z.string(),
  stack: z.string(),
  configuration: z.string(),
  scenario: z.string(),
  hardware: z.string(),
  totalAccelerators: z.number(),
  observedAt: z.string(),
}) satisfies z.ZodType<ServingRunSummary>

export const servingRunsResponse = z.object({
  runs: z.array(servingRunSummary),
  nextCursor: z.string().nullable(),
})

export const servingConfigurationSummary = z.object({
  id: z.string(),
  digest: z.string(),
  stack: z.string(),
  summary: z.string(),
  dtype: z.string().nullable(),
  runs: z.number(),
}) satisfies z.ZodType<ServingConfigurationSummary>
