// Wire schemas for /api/v1 (§13.2–13.3): result rows, the resolver envelope,
// records, feed, challenges, and submission intake. These mirror the catalog
// read models exactly — the `satisfies z.ZodType<…>` constraints fail the
// build if the API contract and the web models ever drift apart (§22.6).
import { z } from "@hono/zod-openapi"
import type {
  Challenge,
  ChallengesModel,
  CohortContext,
  CohortOption,
  ComparePageModel,
  FeedEntry,
  FeedModel,
  NearestCase,
  OperationIndexEntry,
  Precedent,
  PrecedentInput,
  PrecedentsModel,
  PrimaryMetric,
  RecordHolder,
  ResultRow,
  SourceRef,
} from "../../../lib/catalog-models.ts"
import type { Placement, SubmissionReport } from "../../catalog/submissions.ts"
import { PRECEDENT_MAX_LIMIT } from "../../policy/precedents.ts"

export const primaryMetric = z.object({
  metric: z.string(),
  unit: z.string(),
  statistic: z.string(),
  value: z.number(),
  sampleCount: z.number().nullable(),
  uncertainty: z.object({ low: z.number(), high: z.number() }).nullable(),
}) satisfies z.ZodType<PrimaryMetric>

export const licenseInfo = z.object({
  declared: z.string().nullable(),
  concluded: z.string().nullable(),
})

export const evidenceLevel = z.enum([
  "verified",
  "replicated",
  "reproducible",
  "reported",
])

export const comparisonProfile = z.enum([
  "source_native",
  "strict_exact",
  "controlled_equivalent",
  "compatible_workload",
  "reported",
])

export const runStatus = z.enum([
  "passed",
  "incorrect_shape",
  "incorrect_dtype",
  "incorrect_numerical",
  "compile_error",
  "runtime_error",
  "timeout",
  "resource_exceeded",
  "invalid_reference",
  "policy_violation",
  "suspected_reward_hack",
  "incomplete_evidence",
  "revoked",
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
  solScore: z.number().nullable(),
  baseline: z.boolean(),
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
  cohortSize: z.number().nullable(),
  sourceAvailable: z.boolean(),
  installable: z.boolean(),
  license: licenseInfo,
  lastTestedAt: z.string().nullable(),
  indexedAt: z.string().nullable(),
  stale: z.boolean(),
  disputed: z.boolean(),
  caveats: z.array(z.string()),
  attestations: z.number(),
}) satisfies z.ZodType<ResultRow>

export const keyValue = z.object({ key: z.string(), value: z.string() })

export const cohortContext = z.object({
  comparisonKey: z.string(),
  profile: comparisonProfile,
  description: z.string(),
  facts: z.array(keyValue),
}) satisfies z.ZodType<CohortContext>

export const cohortOption = z.object({
  key: z.string(),
  label: z.string(),
  runs: z.number(),
  head: z
    .object({
      runId: z.string(),
      implementation: z.object({ name: z.string(), slug: z.string() }),
      primary: primaryMetric,
    })
    .nullable(),
}) satisfies z.ZodType<CohortOption>

export const nearestCase = z.object({
  workloadId: z.string(),
  label: z.string(),
  value: z.number(),
  runs: z.number(),
  head: cohortOption.shape.head,
  cohortKey: z.string().nullable(),
  query: z.string(),
}) satisfies z.ZodType<NearestCase>

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
  match: z
    .object({
      matching: z.number(),
      withSource: z.number(),
      best: z.object({ value: z.number(), unit: z.string() }).nullable(),
      facetLabel: z.string(),
    })
    .nullish(),
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
  workloadId: z.string(),
  workloadSummary: z.string(),
  hardware: z.string(),
  environmentSummary: z.string(),
  current: resultRow,
  since: z.string(),
  indexedAt: z.string(),
  history: z.array(recordEvent),
}) satisfies z.ZodType<RecordHolder>

const compareRun = z.object({
  runId: z.string(),
  digest: z.string(),
  implementation: z.object({ name: z.string(), slug: z.string() }),
  project: z.object({ name: z.string(), slug: z.string() }),
  operation: z.object({ name: z.string(), slug: z.string() }),
  workloadLabel: z.string(),
  hardware: z.string(),
  primary: primaryMetric.nullable(),
  evidence: evidenceLevel,
  status: runStatus,
  comparisonKey: z.string(),
  rank: z.number().nullable(),
  tiedWithPrevious: z.boolean(),
  eligible: z.boolean(),
  ineligibleReasons: z.array(z.string()),
  license: licenseInfo,
  install: z.object({ kind: z.string(), command: z.string() }).nullable(),
  sourceAvailable: z.boolean(),
  observedAt: z.string(),
})

export const compareResponse = z.object({
  illustrative: z.boolean(),
  runs: z.array(compareRun),
  comparable: z.boolean(),
  profile: comparisonProfile.nullable(),
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
}) satisfies z.ZodType<ComparePageModel>

/** §13.3 resolver envelope shared by /search and /resolve/kernel. */
export const resolveResponse = z.object({
  query: z.string(),
  interpretation: z.string(),
  /** exact = one operation resolved; chooser = several plausible; none. */
  mode: z.enum(["exact", "chooser", "browse", "none"]),
  operation: z.object({ name: z.string(), slug: z.string() }).nullable(),
  policyVersion: z.string(),
  cohort: cohortContext.nullable(),
  cohortOptions: z.array(cohortOption),
  bestVerified: resultRow.nullable(),
  bestDeployable: resultRow.nullable(),
  groups: z.object({
    exact: z.array(resultRow),
    compatible: z.array(resultRow),
    supportedUnmeasured: z.array(resultRow),
    reported: z.array(resultRow),
  }),
  overflow: z.object({
    exact: z.number(),
    compatible: z.number(),
    supportedUnmeasured: z.number(),
    reported: z.number(),
  }),
  matches: z.array(operationIndexEntry).nullable(),
  /** §12.5 bracketing: set only when the request bound an unmeasured case. */
  nearest: z
    .object({
      axis: z.string(),
      requested: z.number(),
      below: nearestCase.nullable(),
      above: nearestCase.nullable(),
    })
    .nullable(),
  sources: z.array(sourceRef),
  generatedAt: z.string(),
})

/** Many workloads in one call (agents planning a whole model): the same
 * envelope per request, bounded so one call never becomes a bulk export. */
export const resolveBatchResponse = z.object({
  results: z.array(resolveResponse),
  generatedAt: z.string(),
})

const feedMatch = z.object({
  cohort: z.string().nullable(),
  operation: z.string().nullable(),
  projects: z.array(z.string()),
  gpu: z.string().nullable(),
  models: z.array(z.string()),
})
const ref = z.object({ name: z.string(), slug: z.string() })
const feedBase = { at: z.string(), match: feedMatch }

export const feedEntry = z.discriminatedUnion("kind", [
  z.object({
    ...feedBase,
    kind: z.literal("record"),
    runId: z.string(),
    operation: ref,
    workloadId: z.string(),
    workloadSummary: z.string(),
    hardware: z.string(),
    implementation: ref,
    project: ref,
    value: primaryMetric,
    previous: z.object({ implementation: ref, value: primaryMetric }),
    improvementPct: z.number().nullable(),
    cohortKey: z.string(),
  }),
  z.object({
    ...feedBase,
    kind: z.literal("import"),
    source: z.object({ slug: z.string(), name: z.string() }),
    runs: z.number(),
    firstRecords: z.number(),
    operations: z.number(),
    hardware: z.array(z.string()),
  }),
  z.object({
    ...feedBase,
    kind: z.literal("correction"),
    runId: z.string(),
    action: z.enum(["retracted", "superseded"]),
    reason: z.string().nullable(),
    operation: ref,
    implementation: ref,
  }),
  z.object({
    ...feedBase,
    kind: z.literal("claim"),
    project: ref,
    by: z.string(),
  }),
]) satisfies z.ZodType<FeedEntry>

export const feedResponse = z.object({
  illustrative: z.boolean(),
  days: z.array(z.object({ date: z.string(), entries: z.array(feedEntry) })),
  generatedAt: z.string(),
}) satisfies z.ZodType<FeedModel & { generatedAt: string }>

export const challenge = z.object({
  kind: z.enum([
    "requested",
    "gap",
    "model_gap",
    "unbeaten_baseline",
    "unchallenged",
    "stale",
  ]),
  operation: z.object({ name: z.string(), slug: z.string() }).nullable(),
  family: z.string().nullable(),
  hardware: z.string().nullable(),
  detail: z.string(),
  since: z.string().nullable(),
  count: z.number(),
  href: z.string(),
}) satisfies z.ZodType<Challenge>

export const challengesResponse = z.object({
  illustrative: z.boolean(),
  challenges: z.array(challenge),
  generatedAt: z.string(),
}) satisfies z.ZodType<ChallengesModel & { generatedAt: string }>

export const recordsResponse = z.object({
  records: z.array(recordHolder),
  nextCursor: z.string().nullable(),
  generatedAt: z.string(),
})

/** One document in, for preview and submission alike (§15.5): the
 * multi-manifest YAML or a flat bench record as JSON text. */
export const submissionDocumentRequest = z.object({
  document: z.string().min(1).max(262_144),
})

export const submissionReport = z.object({
  valid: z.boolean(),
  issues: z.array(z.string()),
  objects: z.array(
    z.object({ kind: z.string(), name: z.string(), digest: z.string() }),
  ),
}) satisfies z.ZodType<SubmissionReport>

export const placementRow = z.object({
  name: z.string(),
  operation: z.object({ name: z.string(), slug: z.string() }).nullable(),
  workload: z.string(),
  cohort: z
    .object({
      key: z.string(),
      size: z.number(),
      head: z
        .object({ implementation: z.string(), valueNs: z.number() })
        .nullable(),
    })
    .nullable(),
  wouldRank: z.number().nullable(),
  note: z.string(),
}) satisfies z.ZodType<Placement>

export const previewResponse = z.object({
  report: submissionReport,
  placement: z.array(placementRow),
  generatedAt: z.string(),
})

export const submissionReceipt = z.object({
  id: z.string(),
  state: z.string(),
  report: submissionReport,
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

export const resolveKernelBatchRequest = z.object({
  requests: z.array(resolveKernelRequest).min(1).max(20),
})

/** Precedent search request (§12.8): the resolve shape without policy
 * facets, plus the cut and the unsourced opt-in. */
export const precedentsRequest = z.object({
  query: resolveKernelRequest.shape.query,
  operation: resolveKernelRequest.shape.operation,
  environment: resolveKernelRequest.shape.environment,
  limit: z.number().int().min(1).max(PRECEDENT_MAX_LIMIT).optional(),
  includeUnsourced: z.boolean().optional(),
}) satisfies z.ZodType<PrecedentInput>

const precedent = z.object({
  implementation: z.object({ name: z.string(), slug: z.string() }),
  project: z.object({ name: z.string(), slug: z.string() }),
  operation: z.object({ name: z.string(), slug: z.string() }),
  score: z.number(),
  reasons: z.array(z.string()),
  dimensions: z.object({
    computation: z.number(),
    hardware: z.number(),
    workload: z.number(),
    quality: z.number(),
    techniques: z.number(),
  }),
  bestRun: z
    .object({
      runId: z.string(),
      hardware: z.string(),
      primary: primaryMetric.nullable(),
      rank: z.number().nullable(),
      cohortSize: z.number().nullable(),
      evidence: evidenceLevel,
    })
    .nullable(),
  language: z.string().nullable(),
  framework: z.string().nullable(),
  license: licenseInfo,
  sourceAvailable: z.boolean(),
  techniques: z.array(z.string()),
}) satisfies z.ZodType<Precedent>

export const precedentsResponse = z.object({
  illustrative: z.boolean(),
  interpretation: z.string(),
  target: z
    .object({ name: z.string(), slug: z.string(), family: z.string() })
    .nullable(),
  policyVersion: z.string(),
  precedents: z.array(precedent),
  considered: z.number(),
  generatedAt: z.string(),
}) satisfies z.ZodType<PrecedentsModel & { generatedAt: string }>
