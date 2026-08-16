// Canonical manifest schemas for kernelindex.dev/v1alpha1 (§9.1).
// One strict Zod schema per kind; unknown fields are rejected. `spec` is the
// digest-bearing semantic body; `metadata` is editorial and excluded from
// identity (§9.2). Kinds not yet stored by the catalog arrive with their
// features.
import { z } from "zod"
import {
  artifactRef,
  axisName,
  digestString,
  dimension,
  durationNs,
  gitCommit,
  httpsUrl,
  layout,
  manifestName,
  setLike,
  slug,
  token,
  utcInstant,
} from "./common.ts"

import {
  modelRevisionBody,
  servingConfigurationBody,
  servingRunBody,
  servingStackRevisionBody,
  servingWorkloadBody,
} from "./serving-kinds.ts"

export const API_VERSION = "kernelindex.dev/v1alpha1"

const metadata = z.strictObject({
  name: manifestName,
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  labels: z.record(token, z.string().max(200)).optional(),
  authors: z
    .array(
      z.strictObject({
        name: z.string().max(200).optional(),
        github: z.string().max(100).optional(),
      }),
    )
    .optional(),
  sourceRefs: z.array(z.strictObject({ url: httpsUrl })).optional(),
})

// ---------------------------------------------------------------------------
// OperationSpec (§8.3, example §9.4)

const axisSpec = z
  .strictObject({
    role: z.enum(["variable", "constant", "derived"]),
    type: z.literal("integer"),
    value: z.int().optional(),
    minimum: z.int().optional(),
    maximum: z.int().optional(),
    // Deliberately tiny validated grammar (§9.1): integers, axis names,
    // + - * % and floor division, parentheses.
    expression: z
      .string()
      .regex(/^[a-z0-9_+\-*%/() ]+$/)
      .max(200)
      .optional(),
  })
  .refine((axis) => axis.role !== "constant" || axis.value !== undefined, {
    message: "a constant axis requires a value",
  })
  .refine((axis) => axis.role !== "derived" || axis.expression !== undefined, {
    message: "a derived axis requires an expression",
  })

const tensorSpec = z.strictObject({
  shape: z.array(dimension).min(1),
  dtype: token,
  layout: layout.optional(),
})

const scalarSpec = z.strictObject({ dtype: token })

const operationArgument = z
  .strictObject({
    name: token,
    tensor: tensorSpec.optional(),
    scalar: scalarSpec.optional(),
  })
  .refine(
    (argument) =>
      (argument.tensor === undefined) !== (argument.scalar === undefined),
    {
      message: "an argument is exactly one of tensor or scalar",
    },
  )

const operationSpecBody = z.strictObject({
  family: slug,
  axes: z.record(axisName, axisSpec),
  inputs: z.array(operationArgument).min(1),
  outputs: z.array(operationArgument).min(1),
  semantics: z.strictObject({
    expression: z.string().max(2000).optional(),
    mutation: z.enum(["none", "in_place", "destination"]),
    // "unspecified" is for imports whose source does not state determinism —
    // never guess a stronger claim than the source makes.
    determinism: z.enum(["deterministic", "nondeterministic", "unspecified"]),
  }),
  reference: z
    .strictObject({ language: token, artifact: artifactRef.optional() })
    .optional(),
})

// ---------------------------------------------------------------------------
// WorkloadCase (§8.5, example §9.5)

const tensorData = z.strictObject({
  generator: token,
  seed: z.int().nonnegative().optional(),
  parameters: z.record(token, z.number()).optional(),
  artifact: artifactRef.optional(),
})

const workloadTensor = z.strictObject({
  shape: z.array(z.int().nonnegative()).min(1),
  dtype: token,
  strides: z.array(z.int()).optional(),
  alignmentBytes: z.int().positive().optional(),
  data: tensorData.optional(),
})

const workloadCaseBody = z.strictObject({
  operationSpecDigest: digestString,
  axes: z.record(axisName, z.int()),
  tensors: z.record(token, workloadTensor),
  scalars: z
    .record(token, z.strictObject({ dtype: token, value: z.number() }))
    .optional(),
  correctness: z.strictObject({
    comparator: token,
    maxAbsoluteError: z.number().nonnegative().optional(),
    maxRelativeError: z.number().nonnegative().optional(),
    requiredMatchedRatio: z.number().min(0).max(1).optional(),
    nanPolicy: z.enum(["reject", "exact_match", "ignore"]).optional(),
    infinityPolicy: z.enum(["reject", "exact_match", "ignore"]).optional(),
  }),
})

// ---------------------------------------------------------------------------
// WorkloadSuite (§8.5, §11.7): an ordered case list with a published
// aggregation rule. A suite-scoped result is a source-native aggregate, never
// a per-case measurement.

const workloadSuiteBody = z.strictObject({
  operationSpecDigest: digestString,
  cases: z
    .array(
      z.strictObject({
        externalId: z.string().max(200),
        axes: z.record(axisName, z.int()),
      }),
    )
    .min(1),
  correctness: z.strictObject({
    comparator: token,
    description: z.string().max(500).optional(),
  }),
  aggregation: z.strictObject({ metric: token, statistic: token }),
})

// ---------------------------------------------------------------------------
// SoftwareProject (§8.6)

const softwareProjectBody = z.strictObject({
  name: z.string().max(200),
  repository: httpsUrl.optional(),
  homepage: httpsUrl.optional(),
  host: z
    .strictObject({
      kind: z.enum(["github", "huggingface", "gitlab", "other"]),
      id: z.string().max(200),
    })
    .optional(),
  packages: z
    .array(z.strictObject({ ecosystem: token, name: z.string().max(200) }))
    .optional(),
})

// ---------------------------------------------------------------------------
// ImplementationRevision (§8.7, example §9.6)

const installRecipe = z.strictObject({
  kind: z.enum(["git", "pip", "package", "container", "source"]),
  repository: httpsUrl.optional(),
  commit: gitCommit.optional(),
  package: z.string().max(200).optional(),
  version: z.string().max(100).optional(),
  command: z.string().max(1000).optional(),
})

const buildVariant = z.strictObject({
  name: manifestName,
  install: installRecipe,
  requirements: z.record(token, z.string().max(200)).optional(),
})

const implementationRevisionBody = z.strictObject({
  projectRevision: z.strictObject({
    repository: httpsUrl.optional(),
    commit: gitCommit.optional(),
    version: z.string().max(100).optional(),
    treeDigest: digestString.optional(),
  }),
  operation: z.strictObject({ specDigest: digestString }),
  callable: z.strictObject({
    language: token,
    path: z.string().max(500).optional(),
    symbol: z.string().max(200).optional(),
    interface: token.optional(),
  }),
  support: z.strictObject({
    hardwareArchitectures: setLike(token),
    productsTested: setLike(z.string().max(100)).optional(),
    axes: setLike(z.string().max(200)).optional(),
    dtypes: setLike(token),
    layouts: setLike(z.string().max(50)).optional(),
  }),
  // Content identity of the revision's own source file when the source is
  // mirrored as an artifact (§8.13): different code ⇒ different digest ⇒
  // different implementation. Optional, so pointer-only revisions are
  // unchanged.
  source: z
    .strictObject({
      contentDigest: digestString,
      fileName: z.string().max(200).optional(),
      sizeBytes: z.int().positive().optional(),
    })
    .optional(),
  buildVariants: z.array(buildVariant).optional(),
  licensing: z.strictObject({
    declared: z.string().max(200).optional(),
    concluded: z.string().max(200).optional(),
    evidence: z
      .strictObject({
        path: z.string().max(500),
        digest: digestString.optional(),
      })
      .optional(),
  }),
})

// ---------------------------------------------------------------------------
// BenchmarkProtocol (§8.9)

const benchmarkProtocolBody = z.strictObject({
  harness: z.strictObject({
    name: z.string().max(200),
    version: z.string().max(100).optional(),
    repository: httpsUrl.optional(),
    commit: gitCommit.optional(),
  }),
  measurement: z.strictObject({
    timer: token,
    synchronization: token.optional(),
    // Absent means the source did not state it — never guess methodology.
    compileIncluded: z.boolean().optional(),
    setupIncluded: z.boolean().optional(),
    warmupIterations: z.int().nonnegative().optional(),
    warmupDuration: durationNs.optional(),
    measuredIterations: z.int().positive().optional(),
    samples: z.int().positive().optional(),
    inputRegeneration: token.optional(),
    outlierPolicy: z.string().max(500).optional(),
    primaryStatistic: token,
  }),
  correctness: z
    .strictObject({ reference: z.string().max(500), comparator: token })
    .optional(),
  devicePolicy: z
    .strictObject({
      clocksLocked: z.boolean().optional(),
      powerLimitWatts: z.number().positive().optional(),
      persistenceMode: z.boolean().optional(),
    })
    .optional(),
  comparability: z
    .strictObject({ family: token, notes: z.string().max(1000).optional() })
    .optional(),
})

// ---------------------------------------------------------------------------
// ExecutionEnvironment (§8.10)

const executionEnvironmentBody = z.strictObject({
  hardware: z.strictObject({
    vendor: token,
    product: z.string().max(200),
    architecture: token,
    formFactor: z.string().max(100).optional(),
    memoryBytes: z.int().positive().optional(),
    count: z.int().positive().optional(),
    interconnect: z.string().max(200).optional(),
  }),
  software: z.strictObject({
    operatingSystem: z.string().max(200).optional(),
    kernel: z.string().max(200).optional(),
    driver: z.string().max(100).optional(),
    cudaToolkit: z.string().max(100).optional(),
    compiler: z.string().max(200).optional(),
    framework: z
      .strictObject({ name: token, version: z.string().max(100) })
      .optional(),
    libraries: z.record(token, z.string().max(100)).optional(),
  }),
  settings: z
    .strictObject({
      clocksLocked: z.boolean().optional(),
      powerLimitWatts: z.number().positive().optional(),
      persistenceMode: z.boolean().optional(),
      eccEnabled: z.boolean().optional(),
      environmentVariables: z
        .record(z.string().max(200), z.string().max(500))
        .optional(),
    })
    .optional(),
  imageDigest: digestString.optional(),
})

// ---------------------------------------------------------------------------
// BenchmarkRun (§8.11, example §9.7)

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

const latencyStats = z
  .strictObject({
    // A source reports whichever central statistic it defines; at least one
    // of median or mean is required and the protocol names the primary one.
    median: durationNs.optional(),
    mean: durationNs.optional(),
    p05: durationNs.optional(),
    p95: durationNs.optional(),
    minimum: durationNs.optional(),
    maximum: durationNs.optional(),
    mad: durationNs.optional(),
    confidence95: z.tuple([durationNs, durationNs]).optional(),
  })
  .refine((stats) => stats.median !== undefined || stats.mean !== undefined, {
    message: "latencyNs requires median or mean",
  })

const measurement = z.strictObject({
  metric: token,
  unit: token,
  statistic: token,
  value: z.number().finite(),
  sampleCount: z.int().positive().optional(),
})

const benchmarkRunBody = z.strictObject({
  implementationDigest: digestString,
  workloadDigest: digestString,
  protocolDigest: digestString,
  environmentDigest: digestString,
  status: runStatus,
  correctness: z
    .strictObject({
      comparator: token,
      maximumAbsoluteError: z.number().nonnegative().optional(),
      maximumRelativeError: z.number().nonnegative().optional(),
      matchedRatio: z.number().min(0).max(1).optional(),
    })
    .optional(),
  timing: z
    .strictObject({
      primaryStatistic: token,
      samples: z.int().positive().optional(),
      latencyNs: latencyStats,
      rawSamples: artifactRef.optional(),
    })
    .optional(),
  measurements: z.array(measurement).optional(),
  sourceNative: z
    .strictObject({
      source: slug,
      benchmark: z.string().max(200).optional(),
      externalId: z.string().max(500).optional(),
      metrics: z.record(token, z.number().finite()).optional(),
    })
    .optional(),
  evidence: z
    .strictObject({
      logs: artifactRef.optional(),
      rawSamples: artifactRef.optional(),
      harness: z
        .strictObject({ repository: httpsUrl, commit: gitCommit })
        .optional(),
    })
    .optional(),
  observedAt: utcInstant,
})

// ---------------------------------------------------------------------------
// Envelope and kind registry

function manifest<K extends string, B extends z.ZodType>(kind: K, body: B) {
  return z.strictObject({
    apiVersion: z.literal(API_VERSION),
    kind: z.literal(kind),
    metadata,
    spec: body,
  })
}

export const operationSpecManifest = manifest(
  "OperationSpec",
  operationSpecBody,
)
export const workloadCaseManifest = manifest("WorkloadCase", workloadCaseBody)
export const workloadSuiteManifest = manifest(
  "WorkloadSuite",
  workloadSuiteBody,
)
export const softwareProjectManifest = manifest(
  "SoftwareProject",
  softwareProjectBody,
)
export const implementationRevisionManifest = manifest(
  "ImplementationRevision",
  implementationRevisionBody,
)
export const benchmarkProtocolManifest = manifest(
  "BenchmarkProtocol",
  benchmarkProtocolBody,
)
export const executionEnvironmentManifest = manifest(
  "ExecutionEnvironment",
  executionEnvironmentBody,
)
export const benchmarkRunManifest = manifest("BenchmarkRun", benchmarkRunBody)

// Serving kinds (§8.16, Week 9): separate resolver surface, shared envelope.
export const modelRevisionManifest = manifest(
  "ModelRevision",
  modelRevisionBody,
)
export const servingStackRevisionManifest = manifest(
  "ServingStackRevision",
  servingStackRevisionBody,
)
export const servingConfigurationManifest = manifest(
  "ServingConfiguration",
  servingConfigurationBody,
)
export const servingWorkloadManifest = manifest(
  "ServingWorkload",
  servingWorkloadBody,
)
export const servingRunManifest = manifest("ServingRun", servingRunBody)

export const anyManifest = z.discriminatedUnion("kind", [
  operationSpecManifest,
  workloadCaseManifest,
  workloadSuiteManifest,
  softwareProjectManifest,
  implementationRevisionManifest,
  benchmarkProtocolManifest,
  executionEnvironmentManifest,
  benchmarkRunManifest,
  modelRevisionManifest,
  servingStackRevisionManifest,
  servingConfigurationManifest,
  servingWorkloadManifest,
  servingRunManifest,
])

export type OperationSpecManifest = z.output<typeof operationSpecManifest>
export type WorkloadCaseManifest = z.output<typeof workloadCaseManifest>
export type WorkloadSuiteManifest = z.output<typeof workloadSuiteManifest>
export type SoftwareProjectManifest = z.output<typeof softwareProjectManifest>
export type ImplementationRevisionManifest = z.output<
  typeof implementationRevisionManifest
>
export type BenchmarkProtocolManifest = z.output<
  typeof benchmarkProtocolManifest
>
export type ExecutionEnvironmentManifest = z.output<
  typeof executionEnvironmentManifest
>
export type BenchmarkRunManifest = z.output<typeof benchmarkRunManifest>
export type ModelRevisionManifest = z.output<typeof modelRevisionManifest>
export type ServingStackRevisionManifest = z.output<
  typeof servingStackRevisionManifest
>
export type ServingConfigurationManifest = z.output<
  typeof servingConfigurationManifest
>
export type ServingWorkloadManifest = z.output<typeof servingWorkloadManifest>
export type ServingRunManifest = z.output<typeof servingRunManifest>
export type AnyManifest = z.output<typeof anyManifest>
export type ManifestKind = AnyManifest["kind"]

/** Registry used for JSON Schema generation and per-kind validation. */
export const manifestSchemas = {
  OperationSpec: operationSpecManifest,
  WorkloadCase: workloadCaseManifest,
  WorkloadSuite: workloadSuiteManifest,
  SoftwareProject: softwareProjectManifest,
  ImplementationRevision: implementationRevisionManifest,
  BenchmarkProtocol: benchmarkProtocolManifest,
  ExecutionEnvironment: executionEnvironmentManifest,
  BenchmarkRun: benchmarkRunManifest,
  ModelRevision: modelRevisionManifest,
  ServingStackRevision: servingStackRevisionManifest,
  ServingConfiguration: servingConfigurationManifest,
  ServingWorkload: servingWorkloadManifest,
  ServingRun: servingRunManifest,
} as const
