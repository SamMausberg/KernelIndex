// Corpus enumeration wire schemas (§13.2 at 20k records): flat listings
// agents filter and page, plus coverage, introspection, and corrections.
// Same drift gates against the catalog models.
import { z } from "@hono/zod-openapi"
import type {
  CoveragePageModel,
  CoverageSource,
  HardwareCoverageEntry,
  ModelCoverageModel,
  ModelPageModel,
  OperationListEntry,
  RunListRow,
} from "../../../lib/catalog-models.ts"
import {
  cohortContext,
  evidenceLevel,
  primaryMetric,
  resultRow,
  runStatus,
  sourceRef,
} from "./results.ts"

export const runListRow = z.object({
  id: z.string(),
  digest: z.string(),
  operation: z.string(),
  implementation: z.string(),
  hardware: z.string(),
  status: runStatus,
  primary: primaryMetric.nullable(),
  evidence: evidenceLevel,
  sourceAvailable: z.boolean(),
  source: z.string(),
  observedAt: z.string(),
}) satisfies z.ZodType<RunListRow>

export const runsResponse = z.object({
  runs: z.array(runListRow),
  nextCursor: z.string().nullable(),
  generatedAt: z.string(),
})

export const operationListEntry = z.object({
  slug: z.string(),
  name: z.string(),
  family: z.string(),
  tags: z.array(z.string()),
  workloads: z.number(),
  runs: z.number(),
}) satisfies z.ZodType<OperationListEntry>

export const operationsResponse = z.object({
  operations: z.array(operationListEntry),
  generatedAt: z.string(),
})

export const hardwareCoverageEntry = z.object({
  slug: z.string(),
  model: z.string(),
  vendor: z.string().nullable(),
  architecture: z.string().nullable(),
  kernelRuns: z.number(),
  servingRuns: z.number(),
  operations: z.number(),
  families: z.number(),
  lastObservedAt: z.string().nullable(),
}) satisfies z.ZodType<HardwareCoverageEntry>

export const hardwareResponse = z.object({
  hardware: z.array(hardwareCoverageEntry),
  generatedAt: z.string(),
})

const modelCoverage = z.object({
  serving: z.array(
    z.object({
      slug: z.string(),
      name: z.string(),
      parameterCount: z.number().nullable(),
      runs: z.number(),
    }),
  ),
  kernel: z.array(z.object({ model: z.string(), operations: z.number() })),
}) satisfies z.ZodType<ModelCoverageModel>

export const modelsResponse = modelCoverage.extend({
  generatedAt: z.string(),
})

/** The model dossier (§16.21): the web page's model, verbatim. */
export const modelDossier = z.object({
  illustrative: z.boolean(),
  model: z.object({ slug: z.string(), relatedTags: z.array(z.string()) }),
  resolved: z.boolean(),
  stats: z.object({
    operations: z.number(),
    families: z.number(),
    runs: z.number(),
  }),
  gpus: z.array(z.object({ model: z.string(), runs: z.number() })),
  selectedGpu: z.string().nullable(),
  groups: z.array(
    z.object({
      family: z.string(),
      entries: z.array(
        z.object({
          operation: z.object({ name: z.string(), slug: z.string() }),
          family: z.string(),
          fastest: resultRow,
          deployable: resultRow.nullable(),
          cohort: cohortContext,
          workloadId: z.string(),
          alternatives: z.number(),
        }),
      ),
    }),
  ),
  gaps: z.array(
    z.object({
      operation: z.object({ name: z.string(), slug: z.string() }),
      family: z.string(),
      measuredOn: z.array(z.string()),
    }),
  ),
  serving: z
    .object({ slug: z.string(), name: z.string(), runs: z.number() })
    .nullable(),
  sources: z.array(sourceRef),
}) satisfies z.ZodType<ModelPageModel>

export const coverageSource = z.object({
  slug: z.string(),
  kind: z.enum(["kernel", "serving"]),
  runs: z.number(),
  indexed: z.number(),
  breadth: z.number(),
  hardware: z.number(),
  lastFetched: z.string().nullable(),
}) satisfies z.ZodType<CoverageSource>

export const coverageResponse = z.object({
  illustrative: z.boolean(),
  sources: z.array(coverageSource),
  hero: z.object({
    gpus: z.array(z.string()),
    rows: z.array(
      z.object({
        family: z.string(),
        runs: z.array(z.number()),
        total: z.number(),
      }),
    ),
  }),
}) satisfies z.ZodType<CoveragePageModel>

export const sourcesResponse = z.object({
  sources: z.array(coverageSource),
  generatedAt: z.string(),
})

/** /me introspection response (§13.6); `ki auth status` consumes it. */
export const meResponse = z.object({
  keyId: z.string(),
  scopes: z.array(z.string()),
  name: z.string().nullable(),
  usedToday: z.number().nullable(),
  quotaPerDay: z.number().nullable(),
})

/** §10.7 corrections: request and the two transaction outcomes. */
export const correctionRequest = z.object({
  action: z.enum(["retract", "supersede"]),
  runId: z.uuid(),
  supersedesRunId: z.uuid().optional(),
  reason: z.string().min(3).max(2000),
})

export const correctionResponse = z.union([
  z.object({
    retracted: z.literal(true),
    newLeaderRunId: z.string().nullable(),
  }),
  z.object({ superseded: z.literal(true) }),
])
