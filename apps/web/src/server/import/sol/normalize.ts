// SOL-to-KernelIndex normalization (§14.5): Definition → OperationSpec,
// workload entries → WorkloadCase / WorkloadSuite, Solution → Implementation-
// Revision, Trace and leaderboard submission → BenchmarkRun. Nothing here
// invents facts: unknown methodology stays absent, and the leaderboard's
// suite-mean latency is imported as a suite-scoped source-native aggregate,
// never as a per-case measurement.
import type {
  BenchmarkProtocolManifest,
  BenchmarkRunManifest,
  ExecutionEnvironmentManifest,
  ImplementationRevisionManifest,
  OperationSpecManifest,
  SoftwareProjectManifest,
  WorkloadCaseManifest,
  WorkloadSuiteManifest,
} from "../../../schemas/kinds.ts"
import { parseManifestDocument } from "../../../schemas/parse.ts"
import type { BundleArtifact } from "../../catalog/publication.ts"
import { sha256Digest } from "../../identity/digest.ts"
import { evaluateAxisExpression, kebab, toUtcInstant } from "../shared.ts"

export { evaluateAxisExpression, kebab, toUtcInstant }

import type { ImportIssue } from "./parse.ts"
import type {
  SolDefinition,
  SolSolution,
  SolSubmission,
  SolTrace,
  SolWorkloadEntry,
} from "./types.ts"

const DTYPES: Record<string, string> = {
  bfloat16: "bf16",
  float16: "fp16",
  half: "fp16",
  float32: "fp32",
  float: "fp32",
  float64: "fp64",
  double: "fp64",
  float8_e4m3fn: "fp8_e4m3",
  float8_e4m3: "fp8_e4m3",
  float8_e5m2: "fp8_e5m2",
  nvfp4: "nvfp4",
  float4_e2m1: "fp4_e2m1",
  int8: "int8",
  int16: "int16",
  int32: "int32",
  int64: "int64",
  uint8: "uint8",
  bool: "bool",
}

const LANGUAGES: Record<string, string> = {
  cuda_cpp: "cuda",
  cute_dsl: "cute_dsl",
  cutile: "cutile",
  cutlass: "cutlass",
  cudnn: "cudnn",
  triton: "triton",
  pytorch: "pytorch",
}

const HARDWARE: Record<
  string,
  { vendor: string; product: string; architecture: string }
> = {
  B200: { vendor: "nvidia", product: "NVIDIA B200", architecture: "sm_100" },
  NVIDIA_B200: {
    vendor: "nvidia",
    product: "NVIDIA B200",
    architecture: "sm_100",
  },
  GB200: { vendor: "nvidia", product: "NVIDIA GB200", architecture: "sm_100" },
  H200: { vendor: "nvidia", product: "NVIDIA H200", architecture: "sm_90" },
  H100: { vendor: "nvidia", product: "NVIDIA H100", architecture: "sm_90" },
  NVIDIA_H100: {
    vendor: "nvidia",
    product: "NVIDIA H100",
    architecture: "sm_90",
  },
  A100: { vendor: "nvidia", product: "NVIDIA A100", architecture: "sm_80" },
}

export function mapHardware(name: string) {
  return (
    HARDWARE[name] ?? {
      vendor: "nvidia",
      product: name.replaceAll("_", " "),
      architecture: "unknown",
    }
  )
}

export function mapDtype(dtype: string): string {
  return DTYPES[dtype] ?? dtype.toLowerCase().replaceAll(/[^a-z0-9_]/g, "_")
}

export function mapLanguage(language: string): string {
  return (
    LANGUAGES[language] ?? language.toLowerCase().replaceAll(/[^a-z0-9_]/g, "_")
  )
}

const SUBSET_TAGS = new Set(["L1", "L2", "Quant", "FlashInfer-Bench"])

function familyOf(definition: SolDefinition): string {
  if (definition.op_type) return kebab(definition.op_type)
  const tag = (definition.tags ?? []).find(
    (candidate) =>
      !SUBSET_TAGS.has(candidate) && !candidate.startsWith("model:"),
  )
  return tag ? kebab(tag) : "uncategorized"
}

/**
 * Editorial operation tags (§8.2): leaderboard family tags kebab-cased plus
 * model workload provenance as `model:<kebab-slug>`. Difficulty-subset
 * markers (L1/L2/…) are import bookkeeping, not taxonomy.
 */
function taxonomyTags(definition: SolDefinition): string[] {
  return [
    ...new Set(
      (definition.tags ?? [])
        .filter((tag) => !SUBSET_TAGS.has(tag))
        .map((tag) =>
          tag.startsWith("model:")
            ? `model:${kebab(tag.slice(6))}`
            : kebab(tag),
        ),
    ),
  ]
}

/** Stable case identity: upstream uuid, else a digest of the bound axes. */
export function workloadEntryKey(entry: SolWorkloadEntry): string {
  if (entry.uuid) return entry.uuid
  const canonical = JSON.stringify(
    Object.fromEntries(
      Object.entries(entry.axes).sort(([a], [b]) => a.localeCompare(b)),
    ),
  )
  return sha256Digest(canonical).slice("sha256:".length, "sha256:".length + 12)
}

type SolArgument = {
  name: string
  shape: (string | number)[] | null
  dtype: string
}

/** Axis identifiers are case-normalized; SOL uses e.g. GEMM's M/N/K. */
const axisKey = (name: string) => name.toLowerCase()

/** Argument names normalize to the token grammar (GEMM uses A/B/C). */
function argumentKey(name: string): string {
  const lowered = name.toLowerCase().replaceAll(/[^a-z0-9_]/g, "_")
  return /^[a-z]/.test(lowered) ? lowered : `x_${lowered}`
}

/** Shape entries may be numeric strings ("2"); bound dims become integers. */
const dimension = (value: string | number): string | number =>
  typeof value === "number"
    ? value
    : /^\d+$/.test(value)
      ? Number(value)
      : axisKey(value)

function operationArguments(
  record: Record<string, { shape?: (string | number)[] | null; dtype: string }>,
) {
  return Object.entries(record).map(
    ([name, tensor]): SolArgument => ({
      name,
      shape: tensor.shape ?? null,
      dtype: tensor.dtype,
    }),
  )
}

// A null upstream shape means a scalar input.
function argumentSpec(argument: SolArgument) {
  if (argument.shape === null || argument.shape.length === 0) {
    return {
      name: argumentKey(argument.name),
      scalar: { dtype: mapDtype(argument.dtype) },
    }
  }
  return {
    name: argumentKey(argument.name),
    tensor: {
      shape: argument.shape.map(dimension),
      dtype: mapDtype(argument.dtype),
    },
  }
}

/** SOL Definition → immutable OperationSpec manifest. */
export function operationFromDefinition(
  definition: SolDefinition,
  sourceUrl: string,
): {
  manifest: OperationSpecManifest
  slug: string
  aliases: string[]
  tags: string[]
  externalId: string
} {
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "OperationSpec",
    metadata: {
      name: kebab(definition.name),
      title: definition.name,
      description: definition.description ?? undefined,
      sourceRefs: [{ url: sourceUrl }],
    },
    spec: {
      family: familyOf(definition),
      axes: Object.fromEntries(
        Object.entries(definition.axes).map(([name, axis]) => [
          axisKey(name),
          axis.type === "const"
            ? { role: "constant", type: "integer", value: axis.value }
            : axis.type === "expr"
              ? {
                  role: "derived",
                  type: "integer",
                  expression: axis.expression?.toLowerCase(),
                }
              : { role: "variable", type: "integer" },
        ]),
      ),
      inputs: operationArguments(definition.inputs).map(argumentSpec),
      outputs: operationArguments(definition.outputs).map(argumentSpec),
      // SOL states semantics through the reference implementation; it does
      // not declare determinism, so no stronger claim is made here.
      semantics: { mutation: "none", determinism: "unspecified" },
      reference: definition.reference ? { language: "python" } : undefined,
    },
  })
  if (manifest.kind !== "OperationSpec") throw new Error("unreachable")
  return {
    manifest,
    slug: kebab(definition.name),
    aliases: [definition.name.toLowerCase()],
    tags: taxonomyTags(definition),
    externalId: definition.name,
  }
}

/** One workload.jsonl entry → exact WorkloadCase manifest. */
export function caseFromEntry(
  definition: SolDefinition,
  operationSpecDigest: string,
  entry: SolWorkloadEntry,
): WorkloadCaseManifest {
  const entryAxes = Object.fromEntries(
    Object.entries(entry.axes).map(([name, value]) => [axisKey(name), value]),
  )
  const bindings: Record<string, number> = { ...entryAxes }
  for (const [name, axis] of Object.entries(definition.axes)) {
    if (axis.type === "const" && axis.value !== undefined)
      bindings[axisKey(name)] = axis.value
  }
  for (const [name, axis] of Object.entries(definition.axes)) {
    if (
      axis.type === "expr" &&
      axis.expression &&
      bindings[axisKey(name)] === undefined
    ) {
      bindings[axisKey(name)] = evaluateAxisExpression(
        axis.expression.toLowerCase(),
        bindings,
      )
    }
  }
  const entryKey = workloadEntryKey(entry)
  const axisValue = (raw: string | number): number => {
    const dim = dimension(raw)
    if (typeof dim === "number") return dim
    const bound = bindings[dim]
    if (bound === undefined)
      throw new Error(`unbound axis '${dim}' in workload ${entryKey}`)
    return bound
  }
  const tensors: Record<string, unknown> = {}
  const scalars: Record<string, unknown> = {}
  for (const argument of operationArguments(definition.inputs)) {
    const descriptor = entry.inputs?.[argument.name]
    const dtype = mapDtype(argument.dtype)
    if (descriptor?.type === "scalar" && typeof descriptor.value === "number") {
      scalars[argumentKey(argument.name)] = { dtype, value: descriptor.value }
      continue
    }
    if (argument.shape === null || argument.shape.length === 0) continue
    tensors[argumentKey(argument.name)] = {
      shape: argument.shape.map(axisValue),
      dtype,
      // Leaderboard workload lists omit input descriptors; the generator
      // stays absent rather than guessed (§14.5).
      data: descriptor
        ? {
            generator:
              descriptor.type === "safetensors" ? "safetensors" : "random",
          }
        : undefined,
    }
  }
  // Axis-heavy kernels overflow the 200-char title budget; the axes stay
  // complete in spec.axes, only the display title truncates.
  const title = `${definition.name} · ${Object.entries(entry.axes)
    .map(([axis, value]) => `${axis}=${value}`)
    .join(", ")}`
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "WorkloadCase",
    metadata: {
      name: `${kebab(definition.name)}-${entryKey.slice(0, 8)}`,
      title: title.length > 200 ? `${title.slice(0, 199)}…` : title,
    },
    spec: {
      operationSpecDigest,
      axes: entryAxes,
      tensors,
      scalars: Object.keys(scalars).length > 0 ? scalars : undefined,
      // Dataset workload rows publish per-case tolerances; when absent the
      // comparator names the evaluation stack without inventing thresholds.
      correctness: {
        comparator: "sol_execbench_eval",
        maxAbsoluteError: entry.tolerance?.max_atol,
        maxRelativeError: entry.tolerance?.max_rtol,
      },
    },
  })
  if (manifest.kind !== "WorkloadCase") throw new Error("unreachable")
  return manifest
}

/** The definition's full workload list → suite manifest (§11.7). */
export function suiteFromEntries(
  definition: SolDefinition,
  operationSpecDigest: string,
  entries: SolWorkloadEntry[],
): WorkloadSuiteManifest {
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "WorkloadSuite",
    metadata: {
      name: `${kebab(definition.name)}-suite`,
      title: `SOL workload suite: ${definition.name}`,
    },
    spec: {
      operationSpecDigest,
      cases: entries.map((entry) => ({
        externalId: workloadEntryKey(entry),
        axes: Object.fromEntries(
          Object.entries(entry.axes).map(([name, value]) => [
            axisKey(name),
            value,
          ]),
        ),
      })),
      correctness: {
        comparator: "sol_execbench_eval",
        description:
          "Correctness must pass on every case in the SOL evaluation stack.",
      },
      aggregation: { metric: "latency", statistic: "mean" },
    },
  })
  if (manifest.kind !== "WorkloadSuite") throw new Error("unreachable")
  return manifest
}

export function projectForUser(username: string): {
  manifest: SoftwareProjectManifest
  slug: string
} {
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "SoftwareProject",
    metadata: { name: `sol-user-${kebab(username)}` },
    spec: {
      name: username,
      host: { kind: "other", id: `sol-execbench/user/${username}` },
    },
  })
  if (manifest.kind !== "SoftwareProject") throw new Error("unreachable")
  return { manifest, slug: `sol-user-${kebab(username)}` }
}

/**
 * A leaderboard submission's implementation identity. The leaderboard does
 * not publish submission source code, so this is an explicit no-source,
 * unknown-license revision — deployability stays honest (§8.15).
 */
export function implementationFromSubmission(
  submission: SolSubmission,
  definition: SolDefinition,
  operationSpecDigest: string,
): {
  manifest: ImplementationRevisionManifest
  slug: string
  projectSlug: string
  externalId: string
} {
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "ImplementationRevision",
    metadata: {
      name: `sol-submission-${submission.id}`,
      title: `${submission.username} · ${submission.kernel_name}`,
      authors: [{ name: submission.username }],
    },
    spec: {
      projectRevision: { version: `submission-${submission.id}` },
      operation: { specDigest: operationSpecDigest },
      callable: { language: "unknown" },
      support: {
        hardwareArchitectures: [mapHardware(submission.gpu_type).architecture],
        productsTested: [mapHardware(submission.gpu_type).product],
        dtypes: operationArguments(definition.inputs).map((argument) =>
          mapDtype(argument.dtype),
        ),
      },
      licensing: {},
    },
  })
  if (manifest.kind !== "ImplementationRevision") throw new Error("unreachable")
  return {
    manifest,
    slug: kebab(`sol-${submission.kernel_name}-${submission.username}`),
    projectSlug: `sol-user-${kebab(submission.username)}`,
    externalId: `submission/${submission.id}`,
  }
}

/** Shared protocol manifest for one leaderboard evaluation stack version. */
export function leaderboardProtocol(
  stackVersion: string,
): BenchmarkProtocolManifest {
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "BenchmarkProtocol",
    metadata: {
      name: `sol-execbench-leaderboard-${kebab(stackVersion)}`,
      title: `SOL-ExecBench evaluation stack ${stackVersion}`,
    },
    spec: {
      harness: {
        name: "SOL-ExecBench evaluation stack",
        version: stackVersion,
      },
      // The leaderboard publishes a suite-mean latency; further timing
      // methodology is not public, so those fields stay absent.
      measurement: { timer: "harness_reported", primaryStatistic: "mean" },
      correctness: {
        reference: "definition reference implementation",
        comparator: "sol_execbench_eval",
      },
      comparability: {
        family: "sol_execbench_leaderboard",
        notes:
          "Suite-mean latency and SOL-Score as published by the SOL-ExecBench leaderboard. Comparable only within one definition, GPU type, and evaluation stack version.",
      },
    },
  })
  if (manifest.kind !== "BenchmarkProtocol") throw new Error("unreachable")
  return manifest
}

export function leaderboardEnvironment(
  gpuType: string,
  stackVersion: string,
): ExecutionEnvironmentManifest {
  const hardware = mapHardware(gpuType)
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "ExecutionEnvironment",
    metadata: {
      name: `sol-execbench-${kebab(gpuType)}-${kebab(stackVersion)}`,
      title: `SOL-ExecBench ${hardware.product}, stack ${stackVersion}`,
    },
    spec: {
      hardware,
      software: { libraries: { evaluation_stack: stackVersion } },
    },
  })
  if (manifest.kind !== "ExecutionEnvironment") throw new Error("unreachable")
  return manifest
}

export type NormalizedRun = {
  manifest: BenchmarkRunManifest
  protocol: BenchmarkProtocolManifest
  environment: ExecutionEnvironmentManifest
  externalId: string
  /** Run-level evidence artifacts (trace logs on the gold-record path). */
  artifacts?: BundleArtifact[]
}

/** Correct, non-disqualified leaderboard submission → suite-aggregate run. */
export function runFromSubmission(input: {
  submission: SolSubmission
  implementationDigest: string
  workloadDigest: string
  protocol: BenchmarkProtocolManifest
  protocolDigest: string
  environment: ExecutionEnvironmentManifest
  environmentDigest: string
}): NormalizedRun {
  const { submission } = input
  if (submission.latency_ms === null || submission.latency_ms === undefined) {
    throw new Error(`submission ${submission.id} has no latency`)
  }
  const metrics: Record<string, number> = { latency_ms: submission.latency_ms }
  if (typeof submission.sol_score === "number")
    metrics.sol_score = submission.sol_score
  if (typeof submission.avg_speedup === "number")
    metrics.avg_speedup = submission.avg_speedup
  if (typeof submission.fast_1_count === "number")
    metrics.fast_1_count = submission.fast_1_count
  if (typeof submission.fast_1_total === "number")
    metrics.fast_1_total = submission.fast_1_total

  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "BenchmarkRun",
    metadata: {
      name: `sol-submission-${submission.id}`,
      title: `${submission.username} · ${submission.kernel_name} · ${submission.gpu_type}`,
      labels: submission.worker_id
        ? { worker: submission.worker_id }
        : undefined,
    },
    spec: {
      implementationDigest: input.implementationDigest,
      workloadDigest: input.workloadDigest,
      protocolDigest: input.protocolDigest,
      environmentDigest: input.environmentDigest,
      status: "passed",
      timing: {
        primaryStatistic: "mean",
        // Suite-mean converted to integer nanoseconds; the raw millisecond
        // value is preserved in sourceNative.metrics (§11.5.10).
        latencyNs: { mean: Math.round(submission.latency_ms * 1e6) },
      },
      sourceNative: {
        source: "sol-execbench",
        benchmark: submission.kernel_name,
        externalId: String(submission.id),
        metrics,
      },
      observedAt: toUtcInstant(
        submission.finished_at ??
          submission.submitted_at ??
          new Date().toISOString(),
      ),
    },
  })
  if (manifest.kind !== "BenchmarkRun") throw new Error("unreachable")
  return {
    manifest,
    protocol: input.protocol,
    environment: input.environment,
    externalId: `submission/${submission.id}`,
  }
}

const TRACE_STATUS: Record<string, BenchmarkRunManifest["spec"]["status"]> = {
  PASSED: "passed",
  INCORRECT_SHAPE: "incorrect_shape",
  INCORRECT_NUMERICAL: "incorrect_numerical",
  INCORRECT_DTYPE: "incorrect_dtype",
  RUNTIME_ERROR: "runtime_error",
  COMPILE_ERROR: "compile_error",
  TIMEOUT: "timeout",
  REWARD_HACK: "suspected_reward_hack",
  INVALID_REFERENCE: "invalid_reference",
}

export function traceProtocol(): BenchmarkProtocolManifest {
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "BenchmarkProtocol",
    metadata: {
      name: "sol-execbench-trace",
      title: "SOL-ExecBench trace harness",
    },
    spec: {
      harness: {
        name: "sol-execbench",
        repository: "https://github.com/nvidia/sol-execbench",
      },
      measurement: { timer: "harness_reported", primaryStatistic: "mean" },
      correctness: {
        reference: "definition reference implementation",
        comparator: "sol_execbench_eval",
      },
      comparability: { family: "sol_execbench_trace" },
    },
  })
  if (manifest.kind !== "BenchmarkProtocol") throw new Error("unreachable")
  return manifest
}

export function traceEnvironment(environment: {
  hardware: string
  libs: Record<string, string>
}): ExecutionEnvironmentManifest {
  const hardware = mapHardware(environment.hardware)
  const { cuda, torch, ...rest } = environment.libs
  const libraries = Object.fromEntries(
    Object.entries(rest).map(([name, version]) => [mapLanguage(name), version]),
  )
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "ExecutionEnvironment",
    metadata: {
      name: kebab(
        `sol-trace-${environment.hardware}-${Object.values(environment.libs).join("-")}`,
      ),
      title: `${hardware.product} (trace-reported software)`,
    },
    spec: {
      hardware,
      software: {
        cudaToolkit: cuda,
        framework: torch ? { name: "pytorch", version: torch } : undefined,
        libraries: Object.keys(libraries).length > 0 ? libraries : undefined,
      },
    },
  })
  if (manifest.kind !== "ExecutionEnvironment") throw new Error("unreachable")
  return manifest
}

/** Official SOL Trace → exact per-case run (§14.5 Trace mapping). */
export function runFromTrace(input: {
  trace: SolTrace
  implementationDigest: string
  workloadDigest: string
  protocol: BenchmarkProtocolManifest
  protocolDigest: string
  environment: ExecutionEnvironmentManifest
  environmentDigest: string
}): NormalizedRun {
  const { trace } = input
  const evaluation = trace.evaluation
  if (!evaluation) throw new Error("trace has no evaluation")
  const status = TRACE_STATUS[evaluation.status]
  if (!status) throw new Error(`unknown trace status ${evaluation.status}`)
  const performance = evaluation.performance
  const correctness = evaluation.correctness

  // The eval log is the trace's raw evidence (§22.15): content-addressed,
  // referenced from the manifest, stored inline as a run artifact. Without
  // it the gold record could never derive above `reported` (§8.14).
  const log =
    typeof evaluation.log === "string" && evaluation.log.length > 0
      ? evaluation.log
      : null
  const logDigest = log !== null ? sha256Digest(log) : null

  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "BenchmarkRun",
    metadata: {
      name: kebab(
        `sol-trace-${trace.definition}-${workloadEntryKey(trace.workload).slice(0, 8)}`,
      ),
      title: `${trace.solution ?? "unknown solution"} · ${trace.definition}`,
    },
    spec: {
      implementationDigest: input.implementationDigest,
      workloadDigest: input.workloadDigest,
      protocolDigest: input.protocolDigest,
      environmentDigest: input.environmentDigest,
      status,
      correctness: correctness
        ? {
            comparator: "sol_execbench_eval",
            maximumAbsoluteError: correctness.max_absolute_error,
            maximumRelativeError: correctness.max_relative_error,
          }
        : undefined,
      timing: performance
        ? {
            primaryStatistic: "mean",
            latencyNs: { mean: Math.round(performance.latency_ms * 1e6) },
          }
        : undefined,
      sourceNative: {
        source: "sol-execbench",
        benchmark: trace.definition,
        metrics: performance
          ? {
              latency_ms: performance.latency_ms,
              ...(typeof performance.reference_latency_ms === "number"
                ? { reference_latency_ms: performance.reference_latency_ms }
                : {}),
              ...(typeof performance.speedup_factor === "number"
                ? { speedup_factor: performance.speedup_factor }
                : {}),
            }
          : undefined,
      },
      evidence:
        logDigest !== null
          ? {
              logs: {
                uri: `kernelindex:artifact/${logDigest}`,
                digest: logDigest,
              },
            }
          : undefined,
      observedAt: toUtcInstant(evaluation.timestamp),
    },
  })
  if (manifest.kind !== "BenchmarkRun") throw new Error("unreachable")
  return {
    manifest,
    protocol: input.protocol,
    environment: input.environment,
    externalId: `trace/${trace.solution ?? "unknown"}/${workloadEntryKey(trace.workload)}`,
    artifacts:
      log !== null && logDigest !== null
        ? [
            {
              role: "logs",
              kind: "log",
              mediaType: "text/plain",
              digest: logDigest,
              sizeBytes: Buffer.byteLength(log),
              storage: "inline",
              content: log,
            },
          ]
        : undefined,
  }
}

/** Repository example Solution → implementation with real pinned source. */
export function implementationFromSolution(input: {
  solution: SolSolution
  definition: SolDefinition
  operationSpecDigest: string
  repository: string
  commit: string
  examplePath: string
}): {
  manifest: ImplementationRevisionManifest
  slug: string
  projectSlug: string
  externalId: string
} {
  const { solution } = input
  const language = mapLanguage(solution.spec.languages[0] ?? "unknown")
  const products = (solution.spec.target_hardware ?? [])
    .filter((name) => name !== "LOCAL")
    .map((name) => mapHardware(name))
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "ImplementationRevision",
    metadata: {
      name: kebab(solution.name),
      title: solution.name,
      description: solution.description ?? undefined,
      authors: solution.author ? [{ name: solution.author }] : undefined,
      sourceRefs: [
        {
          url: `${input.repository}/tree/${input.commit}/${input.examplePath}`,
        },
      ],
    },
    spec: {
      projectRevision: { repository: input.repository, commit: input.commit },
      operation: { specDigest: input.operationSpecDigest },
      callable: {
        language,
        path: input.examplePath,
        symbol: solution.spec.entry_point ?? undefined,
        interface: solution.spec.binding === "torch" ? "pytorch" : undefined,
      },
      support: {
        hardwareArchitectures:
          products.length > 0
            ? products.map((product) => product.architecture)
            : ["unknown"],
        productsTested: products.map((product) => product.product),
        dtypes: operationArguments(input.definition.inputs).map((argument) =>
          mapDtype(argument.dtype),
        ),
      },
      buildVariants: [
        {
          name: "source",
          install: {
            kind: "git",
            repository: input.repository,
            commit: input.commit,
          },
        },
      ],
      licensing: {
        declared: "Apache-2.0",
        concluded: "Apache-2.0",
        evidence: { path: "LICENSE" },
      },
    },
  })
  if (manifest.kind !== "ImplementationRevision") throw new Error("unreachable")
  return {
    manifest,
    slug: kebab(`sol-example-${solution.name}`),
    projectSlug: "nvidia-sol-execbench",
    externalId: `solution/${solution.name}`,
  }
}

export function solExecbenchProject(repository: string): {
  manifest: SoftwareProjectManifest
  slug: string
} {
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "SoftwareProject",
    metadata: { name: "nvidia-sol-execbench", title: "NVIDIA SOL-ExecBench" },
    spec: {
      name: "NVIDIA SOL-ExecBench",
      repository,
      host: { kind: "github", id: "nvidia/sol-execbench" },
    },
  })
  if (manifest.kind !== "SoftwareProject") throw new Error("unreachable")
  return { manifest, slug: "nvidia-sol-execbench" }
}

export type { ImportIssue }
