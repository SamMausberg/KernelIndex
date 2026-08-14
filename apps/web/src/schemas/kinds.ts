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
    role: z.enum(["variable", "constant"]),
    type: z.literal("integer"),
    value: z.int().optional(),
    minimum: z.int().optional(),
    maximum: z.int().optional(),
  })
  .refine((axis) => axis.role !== "constant" || axis.value !== undefined, {
    message: "a constant axis requires a value",
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
    determinism: z.enum(["deterministic", "nondeterministic"]),
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
    compileIncluded: z.boolean(),
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

const latencyStats = z.strictObject({
  median: durationNs,
  p05: durationNs.optional(),
  p95: durationNs.optional(),
  minimum: durationNs.optional(),
  maximum: durationNs.optional(),
  mad: durationNs.optional(),
  confidence95: z.tuple([durationNs, durationNs]).optional(),
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

export const anyManifest = z.discriminatedUnion("kind", [
  operationSpecManifest,
  workloadCaseManifest,
  softwareProjectManifest,
  implementationRevisionManifest,
  benchmarkProtocolManifest,
  executionEnvironmentManifest,
  benchmarkRunManifest,
])

export type OperationSpecManifest = z.output<typeof operationSpecManifest>
export type WorkloadCaseManifest = z.output<typeof workloadCaseManifest>
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
export type AnyManifest = z.output<typeof anyManifest>
export type ManifestKind = AnyManifest["kind"]

/** Registry used for JSON Schema generation and per-kind validation. */
export const manifestSchemas = {
  OperationSpec: operationSpecManifest,
  WorkloadCase: workloadCaseManifest,
  SoftwareProject: softwareProjectManifest,
  ImplementationRevision: implementationRevisionManifest,
  BenchmarkProtocol: benchmarkProtocolManifest,
  ExecutionEnvironment: executionEnvironmentManifest,
  BenchmarkRun: benchmarkRunManifest,
} as const
