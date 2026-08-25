// Dossier wire schemas (§13.2): the dossier routes return the page models
// verbatim, so these mirrors carry the same drift gates — the OpenAPI
// document and the generated SDK type every route instead of describing
// dossiers as open objects.
import { z } from "@hono/zod-openapi"
import type {
  Attestation,
  AxisSpec,
  ImplementationPageModel,
  ImplementationSummary,
  OperationPageModel,
  ProjectPageModel,
  RunPageModel,
  TensorBinding,
  WorkloadOption,
} from "../../../lib/catalog-models.ts"
import type { ServingRunPageModel } from "../../../lib/serving-models.ts"
import {
  cohortContext,
  cohortOption,
  comparisonProfile,
  evidenceLevel,
  keyValue,
  licenseInfo,
  primaryMetric,
  recordHolder,
  resultRow,
  runStatus,
  sourceRef,
} from "./results.ts"
import { servingMeasurementView } from "./serving.ts"

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
  headroom: z
    .object({
      basis: z.literal("estimate"),
      policyVersion: z.string(),
      hardware: z.string(),
      bytes: z.number(),
      flops: z.number().nullable(),
      computeDtype: z.string().nullable(),
      dramFloorNs: z.number(),
      computeFloorNs: z.number().nullable(),
      floorNs: z.number(),
      bestNs: z.number(),
      ratio: z.number(),
      assumptions: z.array(z.string()),
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
    install: z
      .object({ kind: z.string(), command: z.string(), pinned: z.boolean() })
      .nullable(),
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
  techniques: z.array(
    z.object({
      trait: z.string(),
      value: z.string().nullable(),
      evidence: z.string(),
    }),
  ),
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
  recordsAsOf: z
    .string()
    .describe("Ledger snapshot the records were read from."),
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
