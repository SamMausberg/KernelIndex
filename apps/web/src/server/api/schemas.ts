// Wire schemas for /api/v1 (§13.2–13.3). These mirror the catalog read
// models exactly — the `satisfies z.ZodType<…>` constraints fail the build
// if the API contract and the web models ever drift apart, which is the
// §22.6 gate ("web and API return the same resolver decision").
import { z } from "@hono/zod-openapi"
import type {
  CohortContext,
  ComparePageModel,
  OperationIndexEntry,
  PrimaryMetric,
  RecordHolder,
  ResultRow,
  SourceRef,
} from "../../lib/catalog-models.ts"

export const primaryMetric = z.object({
  metric: z.string(),
  unit: z.string(),
  statistic: z.string(),
  value: z.number(),
  sampleCount: z.number().nullable(),
  uncertainty: z.object({ low: z.number(), high: z.number() }).nullable(),
}) satisfies z.ZodType<PrimaryMetric>

const licenseInfo = z.object({
  declared: z.string().nullable(),
  concluded: z.string().nullable(),
})

const evidenceLevel = z.enum([
  "verified",
  "replicated",
  "reproducible",
  "reported",
])

export const resultRow = z.object({
  runId: z.string().nullable(),
  implementation: z.object({ name: z.string(), slug: z.string() }),
  install: z.object({ kind: z.string(), command: z.string() }).nullable(),
  project: z.object({ name: z.string(), slug: z.string() }),
  revision: z.string().nullable(),
  operation: z.object({ name: z.string(), slug: z.string() }),
  workloadSummary: z.string(),
  hardware: z.object({
    model: z.string(),
    architecture: z.string().nullable(),
  }),
  framework: z.string().nullable(),
  language: z.string().nullable(),
  primary: primaryMetric.nullable(),
  evidence: evidenceLevel.nullable(),
  match: z.enum(["exact", "compatible", "supported_unobserved", "related"]),
  mismatches: z.array(
    z.object({
      field: z.string(),
      requested: z.string(),
      observed: z.string(),
    }),
  ),
  rank: z.number().nullable(),
  tiedWithPrevious: z.boolean(),
  sourceAvailable: z.boolean(),
  installable: z.boolean(),
  license: licenseInfo,
  lastTestedAt: z.string().nullable(),
  stale: z.boolean(),
  disputed: z.boolean(),
  caveats: z.array(z.string()),
}) satisfies z.ZodType<ResultRow>

export const cohortContext = z.object({
  comparisonKey: z.string(),
  profile: z.enum([
    "source_native",
    "strict_exact",
    "controlled_equivalent",
    "compatible_workload",
    "reported",
  ]),
  description: z.string(),
  facts: z.array(z.object({ key: z.string(), value: z.string() })),
}) satisfies z.ZodType<CohortContext>

export const sourceRef = z.object({
  name: z.string(),
  kind: z.string(),
  url: z.string().nullable(),
  license: z.string().nullable(),
  externalId: z.string().nullable(),
  observedAt: z.string().nullable(),
}) satisfies z.ZodType<SourceRef>

export const operationIndexEntry = z.object({
  name: z.string(),
  slug: z.string(),
  family: z.string(),
  aliases: z.array(z.string()),
  runs: z.number(),
  lastObservedAt: z.string().nullable(),
}) satisfies z.ZodType<OperationIndexEntry>

const recordEvent = z.object({
  at: z.string(),
  runId: z.string(),
  implementation: z.object({ name: z.string(), slug: z.string() }),
  value: primaryMetric,
  previousValue: primaryMetric.nullable(),
  improvementPct: z.number().nullable(),
})

export const recordHolder = z.object({
  cohortKey: z.string(),
  operation: z.object({ name: z.string(), slug: z.string() }),
  workloadSummary: z.string(),
  hardware: z.string(),
  environmentSummary: z.string(),
  current: resultRow,
  since: z.string(),
  history: z.array(recordEvent),
}) satisfies z.ZodType<RecordHolder>

export const compareResponse = z.object({
  illustrative: z.boolean(),
  runs: z.array(z.record(z.string(), z.unknown())),
  comparable: z.boolean(),
  profile: z
    .enum([
      "source_native",
      "strict_exact",
      "controlled_equivalent",
      "compatible_workload",
      "reported",
    ])
    .nullable(),
  comparisonKey: z.string().nullable(),
  fields: z.array(
    z.object({
      field: z.string(),
      material: z.boolean(),
      values: z.array(z.string().nullable()),
      differs: z.boolean(),
    }),
  ),
  firstMaterialMismatch: z.string().nullable(),
  explanation: z.string(),
  missingIds: z.array(z.string()),
  policyVersion: z.string(),
}) satisfies z.ZodType<
  Omit<ComparePageModel, "runs"> & { runs: Record<string, unknown>[] }
>

/** §13.3 resolver envelope shared by /search and /resolve/kernel. */
export const resolveResponse = z.object({
  query: z.string(),
  interpretation: z.string(),
  /** exact = one operation resolved; chooser = several plausible; none. */
  mode: z.enum(["exact", "chooser", "browse", "none"]),
  operation: z.object({ name: z.string(), slug: z.string() }).nullable(),
  policyVersion: z.string(),
  cohort: cohortContext.nullable(),
  bestVerified: resultRow.nullable(),
  bestDeployable: resultRow.nullable(),
  groups: z.object({
    exact: z.array(resultRow),
    compatible: z.array(resultRow),
    supportedUnmeasured: z.array(resultRow),
    reported: z.array(resultRow),
  }),
  compatibleOverflow: z.number(),
  matches: z.array(operationIndexEntry).nullable(),
  sources: z.array(sourceRef),
  generatedAt: z.string(),
})

export const recordsResponse = z.object({
  records: z.array(recordHolder),
  nextCursor: z.string().nullable(),
  generatedAt: z.string(),
})

/** RFC 9457 Problem Details with a stable KernelIndex code (§13.5). */
export const problemDetails = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  code: z.string(),
  detail: z.string().optional(),
  requestId: z.string(),
})

export const resolveKernelRequest = z.object({
  /** Free-text or `op:<slug>` query, same grammar as the web search box. */
  query: z.string().max(500).optional(),
  operation: z
    .object({
      family: z.string().max(100).optional(),
      name: z.string().max(200).optional(),
      axes: z.record(z.string(), z.number()).optional(),
    })
    .optional(),
  environment: z
    .object({
      hardwareProduct: z.string().max(100).optional(),
      dtype: z.string().max(50).optional(),
    })
    .optional(),
  policy: z
    .object({
      minimumTrust: evidenceLevel.optional(),
      sourceRequired: z.boolean().optional(),
      installableRequired: z.boolean().optional(),
      license: z.string().max(100).optional(),
    })
    .optional(),
})
export type ResolveKernelRequest = z.output<typeof resolveKernelRequest>
