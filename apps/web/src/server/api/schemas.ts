// Wire schemas for /api/v1 (§13.2–13.3). These mirror the catalog read
// models exactly — the `satisfies z.ZodType<…>` constraints fail the build
// if the API contract and the web models ever drift apart, which is the
// §22.6 gate ("web and API return the same resolver decision").
import { z } from "@hono/zod-openapi"
import type {
  AxisSpec,
  CohortContext,
  ComparePageModel,
  ImplementationPageModel,
  ImplementationSummary,
  OperationIndexEntry,
  OperationPageModel,
  PrimaryMetric,
  RecordHolder,
  ResultRow,
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

const runStatus = z.enum([
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

const keyValue = z.object({ key: z.string(), value: z.string() })

export const cohortContext = z.object({
  comparisonKey: z.string(),
  profile: comparisonProfile,
  description: z.string(),
  facts: z.array(keyValue),
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
  workloadSummary: z.string(),
  hardware: z.string(),
  environmentSummary: z.string(),
  current: resultRow,
  since: z.string(),
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
  cohortOptions: z.array(
    z.object({ key: z.string(), label: z.string(), runs: z.number() }),
  ),
  cohort: cohortContext.nullable(),
  records: z.array(resultRow),
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
