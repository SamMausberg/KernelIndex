// Wire schemas for /api/v1 (§13.2–13.3). These mirror the catalog read
// models exactly — the `satisfies z.ZodType<…>` constraints fail the build
// if the API contract and the web models ever drift apart, which is the
// §22.6 gate ("web and API return the same resolver decision").
import { z } from "@hono/zod-openapi"
import type {
  Attestation,
  AxisSpec,
  Challenge,
  ChallengesModel,
  CohortContext,
  CohortOption,
  ComparePageModel,
  CoveragePageModel,
  CoverageSource,
  FeedEntry,
  FeedModel,
  HardwareCoverageEntry,
  ImplementationPageModel,
  ImplementationSummary,
  ModelCoverageModel,
  ModelPageModel,
  NearestCase,
  OperationIndexEntry,
  OperationListEntry,
  OperationPageModel,
  PrimaryMetric,
  ProjectPageModel,
  RecordHolder,
  ResultRow,
  RunListRow,
  RunPageModel,
  SourceRef,
  TensorBinding,
  WorkloadOption,
} from "../../lib/catalog-models.ts"
import type {
  ServingConfigurationSummary,
  ServingConstraint,
  ServingResolveInput,
  ServingResolveModel,
  ServingResultRow,
  ServingRunPageModel,
  ServingRunSummary,
} from "../../lib/serving-models.ts"

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

const comparisonProfile = z.enum([
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

const keyValue = z.object({ key: z.string(), value: z.string() })

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

// ---------------------------------------------------------------------------
// Serving (§12.7, §13.2 — Week 9). Same drift gate: these mirror the
// serving read models; no aggregate score field exists by construction.

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

const servingMeasurementView = z.object({
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

// ---------------------------------------------------------------------------
// Dossier wire schemas (§13.2): the dossier routes return the page models
// verbatim, so these mirrors carry the same drift gates — the OpenAPI
// document and the generated SDK now type every route instead of describing
// dossiers as open objects.

const axisValues = z.record(z.string(), z.union([z.number(), z.string()]))

const axisSpec = z.object({
  name: z.string(),
  role: z.enum(["variable", "constant", "derived"]),
  value: z.number().nullable(),
  constraint: z.string().nullable(),
}) satisfies z.ZodType<AxisSpec>

const tensorBinding = z.object({
  name: z.string(),
  dtype: z.string(),
  shape: z.string(),
  layout: z.string().nullable(),
}) satisfies z.ZodType<TensorBinding>

const workloadOption = z.object({
  id: z.string(),
  digest: z.string(),
  label: z.string(),
  axes: axisValues,
  dtypes: z.array(z.string()),
  toleranceSummary: z.string(),
}) satisfies z.ZodType<WorkloadOption>

const implementationSummary = z.object({
  slug: z.string(),
  name: z.string(),
  project: z.object({ name: z.string(), slug: z.string() }),
  language: z.string().nullable(),
  framework: z.string().nullable(),
  evidence: evidenceLevel.nullable(),
  bestPrimary: primaryMetric.nullable(),
  sourceAvailable: z.boolean(),
  installable: z.boolean(),
  license: licenseInfo,
}) satisfies z.ZodType<ImplementationSummary>

export const operationDossier = z.object({
  illustrative: z.boolean(),
  operation: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    family: z.string(),
    aliases: z.array(z.string()),
    equivalents: z.array(z.object({ name: z.string(), slug: z.string() })),
    models: z.array(z.string()),
    semanticDigest: z.string(),
    summary: z.string(),
    supersededById: z.string().nullable(),
  }),
  semantics: z.object({
    inputs: z.array(tensorBinding),
    outputs: z.array(tensorBinding),
    axes: z.array(axisSpec),
    expression: z.string().nullable(),
    determinism: z.string(),
    constraints: z.array(z.string()),
  }),
  workloads: z.array(workloadOption),
  selectedWorkloadId: z.string().nullable(),
  cohortOptions: z.array(cohortOption),
  cohort: cohortContext.nullable(),
  records: z.array(resultRow),
  sweep: z
    .object({
      axis: z.string(),
      unit: z.string(),
      metricLabel: z.string(),
      environmentLabel: z.string(),
      series: z.array(
        z.object({
          implementation: z.object({ name: z.string(), slug: z.string() }),
          points: z.array(
            z.object({
              x: z.number(),
              value: z.number(),
              workloadId: z.string(),
            }),
          ),
        }),
      ),
      overflow: z.number(),
    })
    .nullable(),
  implementations: z.array(implementationSummary),
  coverage: z.object({
    verified: z.number(),
    reproducible: z.number(),
    reported: z.number(),
    lastObservedAt: z.string().nullable(),
  }),
  sources: z.array(sourceRef),
}) satisfies z.ZodType<OperationPageModel>

// The route strips `content`/`diff` unless ?include=source, so the wire
// shape widens exactly those two fields to optional.
type SourceCodeView = NonNullable<ImplementationPageModel["sourceCode"]>
type ImplementationDossier = Omit<ImplementationPageModel, "sourceCode"> & {
  sourceCode:
    | (Omit<SourceCodeView, "content" | "diff"> & {
        content?: SourceCodeView["content"]
        diff?: SourceCodeView["diff"]
      })
    | null
}

export const implementationDossier = z.object({
  illustrative: z.boolean(),
  implementation: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    digest: z.string(),
    revision: z.string().nullable(),
    supersededById: z.string().nullable(),
  }),
  project: z.object({
    name: z.string(),
    slug: z.string(),
    repositoryUrl: z.string().nullable(),
  }),
  usage: z.object({
    install: z.object({ kind: z.string(), command: z.string() }).nullable(),
    invocationExample: z.string().nullable(),
    requirements: z.array(
      z.object({ name: z.string(), constraint: z.string() }),
    ),
  }),
  interface: z.object({
    language: z.string(),
    framework: z.string().nullable(),
    symbol: z.string().nullable(),
    sourcePath: z.string().nullable(),
  }),
  support: z.object({
    hardware: z.array(z.string()),
    architectures: z.array(z.string()),
    dtypes: z.array(z.string()),
    layouts: z.array(z.string()),
    axes: z.array(z.string()),
  }),
  source: z.object({
    available: z.boolean(),
    url: z.string().nullable(),
    commit: z.string().nullable(),
    treeDigest: z.string().nullable(),
  }),
  license: licenseInfo.extend({ evidencePath: z.string().nullable() }),
  trust: z.object({ evidence: evidenceLevel.nullable(), summary: z.string() }),
  standing: z.object({ records: z.number() }),
  bestResults: z.array(resultRow),
  limitations: z.array(z.string()),
  provenance: z.object({
    source: sourceRef.nullable(),
    authors: z.array(z.string()),
    importedAt: z.string().nullable(),
  }),
  sourceCode: z
    .object({
      fileName: z.string().nullable(),
      language: z.enum(["python", "cpp", "text"]),
      content: z.string().optional(),
      license: z.string().nullable(),
      attribution: z
        .object({ text: z.string(), url: z.string().nullable() })
        .nullable(),
      diff: z
        .object({
          previousSlug: z.string(),
          previousName: z.string(),
          lines: z.array(
            z.object({
              kind: z.enum(["add", "del", "ctx"]),
              text: z.string(),
            }),
          ),
        })
        .nullable()
        .optional(),
    })
    .nullable(),
}) satisfies z.ZodType<ImplementationDossier>

/** The project dossier (§16.9 sibling): the web page's model, verbatim. */
export const projectDossier = z.object({
  illustrative: z.boolean(),
  project: z.object({
    slug: z.string(),
    name: z.string(),
    kind: z.enum(["library", "individual", "vendor"]),
    repositoryUrl: z.string().nullable(),
    host: z.object({ kind: z.string(), id: z.string() }).nullable(),
    licenses: z.array(z.string()),
  }),
  stats: z.object({
    implementations: z.number(),
    runs: z.number(),
    hardware: z.array(z.string()),
    lastObservedAt: z.string().nullable(),
  }),
  records: z.array(recordHolder),
  implementations: z.array(
    implementationSummary.extend({
      operation: z.object({ name: z.string(), slug: z.string() }),
    }),
  ),
  claim: z.object({
    state: z.enum(["unclaimed", "pending", "claimed"]),
    by: z.string().nullable(),
  }),
  sources: z.array(sourceRef),
}) satisfies z.ZodType<ProjectPageModel>

export const attestation = z.object({
  id: z.string(),
  type: z.enum([
    "reproduced",
    "could_not_reproduce",
    "environment_note",
    "regression_observed",
  ]),
  body: z.string(),
  evidenceUrl: z.string().nullable(),
  observedNs: z.number().nullable(),
  environmentSummary: z.string().nullable(),
  author: z.string(),
  at: z.string(),
}) satisfies z.ZodType<Attestation>

/** Machine attestation intake (API key with submissions:write). */
export const attestationRequest = z.object({
  type: attestation.shape.type,
  body: z.string().min(1).max(2000),
  evidenceUrl: z.string().max(2000).optional(),
  observedNs: z.number().positive().optional(),
  environmentSummary: z.string().max(200).optional(),
})

export const runDossier = z.object({
  illustrative: z.boolean(),
  run: z.object({
    id: z.string(),
    digest: z.string(),
    status: runStatus,
    observedAt: z.string(),
    publishedAt: z.string().nullable(),
  }),
  evidence: evidenceLevel,
  lifecycle: z.object({
    supersedesId: z.string().nullable(),
    supersededById: z.string().nullable(),
    retracted: z.object({ at: z.string(), reason: z.string() }).nullable(),
    disputed: z.object({ reason: z.string() }).nullable(),
    stale: z.boolean(),
  }),
  primary: primaryMetric,
  sourceNativeMetrics: z.record(z.string(), z.number()).nullable(),
  cohort: z.object({
    comparisonKey: z.string(),
    profile: comparisonProfile,
    rank: z.number().nullable(),
    eligible: z.boolean(),
    ineligibleReasons: z.array(z.string()),
    headRunId: z.string().nullable(),
  }),
  implementation: z.object({
    name: z.string(),
    slug: z.string(),
    revision: z.string().nullable(),
  }),
  project: z.object({ name: z.string(), slug: z.string() }),
  operation: z.object({ name: z.string(), slug: z.string() }),
  workload: z.object({
    id: z.string(),
    digest: z.string(),
    label: z.string(),
    axes: axisValues,
    tensors: z.array(keyValue),
    tolerance: z.array(keyValue),
  }),
  correctness: z
    .object({
      comparator: z.string(),
      maxAbsoluteError: z.number().nullable(),
      maxRelativeError: z.number().nullable(),
      matchedRatio: z.number().nullable(),
      passed: z.boolean(),
    })
    .nullable(),
  measurements: z.array(
    z.object({
      metric: z.string(),
      statistic: z.string(),
      value: z.number(),
      unit: z.string(),
      sampleCount: z.number().nullable(),
    }),
  ),
  protocol: z.array(keyValue),
  environment: z.array(keyValue),
  artifacts: z.array(
    z.object({
      role: z.string(),
      digest: z.string(),
      mediaType: z.string(),
      sizeBytes: z.number().nullable(),
      uri: z.string().nullable(),
      availability: z.enum(["public", "upstream", "unavailable"]),
    }),
  ),
  provenance: z.object({
    source: sourceRef,
    externalId: z.string().nullable(),
    parserVersion: z.string().nullable(),
    snapshotDigest: z.string().nullable(),
  }),
  attestations: z.array(attestation),
  manifest: z.unknown(),
}) satisfies z.ZodType<RunPageModel>

export const servingRunDossier = z.object({
  illustrative: z.boolean(),
  run: z.object({
    id: z.string(),
    digest: z.string(),
    status: z.string(),
    observedAt: z.string(),
    publishedAt: z.string().nullable(),
  }),
  cohort: z.object({
    key: z.string(),
    description: z.string(),
    qualityPolicy: z.string(),
    scenario: z.string(),
  }),
  model: z.object({
    name: z.string(),
    slug: z.string(),
    license: z.string().nullable(),
  }),
  stack: z.object({ name: z.string(), version: z.string().nullable() }),
  configuration: z.object({
    summary: z.string(),
    dtype: z.string().nullable(),
    quantization: z.string().nullable(),
    facts: z.array(keyValue),
  }),
  workload: z.object({
    name: z.string(),
    streaming: z.boolean(),
    loadGeneration: z.string(),
  }),
  topology: z.object({
    acceleratorModel: z.string(),
    perNode: z.number(),
    nodes: z.number(),
    total: z.number(),
  }),
  harness: z.string(),
  measurements: z.array(servingMeasurementView),
  caveats: z.array(z.string()),
  lifecycle: z.object({
    retracted: z.object({ at: z.string(), reason: z.string() }).nullable(),
  }),
  attribution: z.object({ line: z.string(), url: z.string().nullable() }),
  manifest: z.unknown(),
}) satisfies z.ZodType<ServingRunPageModel>

// ---------------------------------------------------------------------------
// Corpus enumeration surfaces (§13.2 at 20k records): flat listings agents
// filter and page. Same drift gates against the catalog models.

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
