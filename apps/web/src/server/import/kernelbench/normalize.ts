// KernelBench-to-KernelIndex normalization (§14.5): problem → one
// OperationSpec (its reference module's computation) and one WorkloadCase
// (the module's fixed inputs); timing mode → one implementation per
// problem, with the reference module mirrored as its source (MIT); timing
// host → one environment; (host, mode, problem) → one reported run. The
// upstream JSON records no torch or CUDA version, so environments carry
// hardware only — stated in the protocol's comparability notes.
import type {
  BenchmarkProtocolManifest,
  BenchmarkRunManifest,
  ExecutionEnvironmentManifest,
  ImplementationRevisionManifest,
  OperationSpecManifest,
  WorkloadCaseManifest,
} from "../../../schemas/kinds.ts"
import { parseManifestDocument } from "../../../schemas/parse.ts"
import type { BundleArtifact } from "../../catalog/publication.ts"
import { sha256Digest } from "../../identity/digest.ts"
// The GPU table and the PyTorch project manifest are shared with the Liger
// importer: both sources time PyTorch reference modules on the same hosts.
import { ligerHardware, projectManifest } from "../liger/normalize.ts"
import { kebab } from "../shared.ts"
import type { ProblemSpec } from "./problem.ts"
import {
  KB_REPO_URL,
  KB_SOURCE,
  type KbTiming,
  type Level,
  MACHINES,
  MODES,
  PROBLEMS_PATH,
} from "./types.ts"

export { projectManifest }

export const problemUrl = (commit: string, level: Level, file: string) =>
  `${KB_REPO_URL}/blob/${commit}/${PROBLEMS_PATH}/${level}/${file}`

export function operationFromProblem(
  spec: ProblemSpec,
  level: Level,
  file: string,
  commit: string,
  source: string,
): {
  manifest: OperationSpecManifest
  slug: string
  tags: string[]
  externalId: string
} {
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "OperationSpec",
    metadata: {
      name: kebab(`kernelbench-${spec.slug}`),
      title: spec.title,
      description: `KernelBench ${level} problem ${spec.number}: ${spec.title}. The computation is the reference PyTorch module's forward pass; the output shape follows the module (mirrored as each implementation's source).`,
      sourceRefs: [{ url: problemUrl(commit, level, file) }],
    },
    spec: {
      family: spec.family,
      axes: Object.fromEntries(
        [...Object.keys(spec.axes), "out"].map((name) => [
          name,
          { role: "variable", type: "integer" },
        ]),
      ),
      inputs: spec.inputs.map((input) => ({
        name: input.name,
        tensor: { shape: input.shape, dtype: input.dtype },
      })),
      // The reference module defines the output; its shape is not stated
      // statically, so the argument rides one symbolic axis no case binds.
      outputs: [{ name: "out", tensor: { shape: ["out"], dtype: "float" } }],
      semantics: { mutation: "none", determinism: "unspecified" },
      // The module is the computation's definition, and many problems share
      // one input signature (every conv fusion, every square GEMM), so its
      // digest is what keeps distinct problems distinct identities (§9.2).
      reference: {
        language: "python",
        artifact: {
          uri: problemUrl(commit, level, file),
          digest: sha256Digest(source),
        },
      },
    },
  })
  if (manifest.kind !== "OperationSpec") throw new Error("unreachable")
  return {
    manifest,
    slug: kebab(`kernelbench-${spec.slug}`),
    tags: [`kernelbench-${level}`],
    externalId: `${level}/${file}`,
  }
}

export function caseFromProblem(
  spec: ProblemSpec,
  operationSpecDigest: string,
): WorkloadCaseManifest {
  const bound = (dim: string | number) =>
    typeof dim === "number" ? dim : spec.axes[dim]
  const scalars = Object.entries(spec.scalars).filter(
    ([name]) => !(name in spec.axes),
  )
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "WorkloadCase",
    metadata: {
      name: kebab(`kernelbench-${spec.slug}-case`),
      title: `${spec.title} · ${Object.entries(spec.axes)
        .map(([axis, value]) => `${axis}=${value}`)
        .join(", ")}`,
    },
    spec: {
      operationSpecDigest,
      axes: spec.axes,
      tensors: Object.fromEntries(
        spec.inputs.map((input) => [
          input.name,
          { shape: input.shape.map(bound), dtype: input.dtype },
        ]),
      ),
      scalars:
        scalars.length > 0
          ? Object.fromEntries(
              scalars.map(([name, value]) => [
                name,
                { dtype: Number.isInteger(value) ? "int32" : "fp32", value },
              ]),
            )
          : undefined,
      // The timing harness asserts nothing; KernelBench checks candidate
      // kernels against the module separately, and these are the modules.
      correctness: { comparator: "not_asserted" },
    },
  })
  if (manifest.kind !== "WorkloadCase") throw new Error("unreachable")
  return manifest
}

export function kbProtocol(): BenchmarkProtocolManifest {
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "BenchmarkProtocol",
    metadata: {
      name: "kernelbench-timing-v1",
      title: "KernelBench baseline timing",
    },
    spec: {
      harness: { name: "KernelBench timing scripts", repository: KB_REPO_URL },
      measurement: { timer: "cuda_events", primaryStatistic: "mean" },
      comparability: {
        family: "kernelbench_baseline_timing",
        notes:
          "Mean of 100 timed forward passes (CUDA events, warm-up excluded) of the reference module on fixed inputs; the 95% interval is the mean's, from the reported standard deviation. The upstream JSON records no torch or CUDA version. Comparable only within one problem and one timing host.",
      },
    },
  })
  if (manifest.kind !== "BenchmarkProtocol") throw new Error("unreachable")
  return manifest
}

export function kbEnvironment(
  machine: string,
  gpuName: string,
): ExecutionEnvironmentManifest | null {
  const hardware = ligerHardware(gpuName)
  const host = MACHINES[machine]
  if (!hardware || !host) return null
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "ExecutionEnvironment",
    metadata: {
      name: kebab(`kernelbench-${machine}`),
      title: `KernelBench host · ${gpuName.replace(/^NVIDIA /, "")} (${host.host})`,
    },
    spec: { hardware, software: {} },
  })
  if (manifest.kind !== "ExecutionEnvironment") throw new Error("unreachable")
  return manifest
}

export function implementationFromMode(input: {
  spec: ProblemSpec
  modeFile: string
  level: Level
  file: string
  commit: string
  source: string
  operationSpecDigest: string
}): {
  manifest: ImplementationRevisionManifest
  slug: string
  projectSlug: string
  externalId: string
  artifacts: BundleArtifact[]
} {
  const mode = MODES[input.modeFile]
  const url = problemUrl(input.commit, input.level, input.file)
  const slug = kebab(`kernelbench-${input.spec.slug}-${mode.key}`)
  const contentDigest = sha256Digest(input.source)
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "ImplementationRevision",
    metadata: {
      name: slug,
      title: `${input.spec.title} · ${mode.title}`,
      description: mode.description,
      labels: mode.baseline ? { role: "baseline" } : undefined,
      sourceRefs: [{ url }],
    },
    spec: {
      projectRevision: {},
      operation: { specDigest: input.operationSpecDigest },
      // Same module under two execution paths: the interface token is what
      // keeps eager and compiled implementations distinct identities.
      callable: {
        language: "python",
        symbol: "Model.forward",
        interface: mode.interface,
      },
      support: { hardwareArchitectures: [], dtypes: [] },
      // Mirrored source identity (§8.13): the module file is the source.
      source: {
        contentDigest,
        fileName: input.file,
        sizeBytes: Buffer.byteLength(input.source),
      },
      licensing: { declared: "MIT", concluded: "MIT" },
    },
  })
  if (manifest.kind !== "ImplementationRevision") throw new Error("unreachable")
  return {
    manifest,
    slug,
    projectSlug: projectManifest("pytorch").slug,
    externalId: `${input.level}/${input.file}/${mode.key}`,
    artifacts: [
      {
        role: "source",
        kind: "source",
        mediaType: "text/x-python",
        digest: contentDigest,
        sizeBytes: Buffer.byteLength(input.source),
        storage: "inline",
        content: input.source,
        uri: url,
        license: KB_SOURCE.policy.license,
      },
    ],
  }
}

const MS_TO_NS = 1_000_000
const ns = (ms: number) => Math.round(ms * MS_TO_NS)

export function runFromTiming(input: {
  timing: KbTiming
  spec: ProblemSpec
  observedAt: string
  implementationDigest: string
  workloadDigest: string
  protocol: BenchmarkProtocolManifest
  protocolDigest: string
  environment: ExecutionEnvironmentManifest
  environmentDigest: string
}): {
  manifest: BenchmarkRunManifest
  protocol: BenchmarkProtocolManifest
  environment: ExecutionEnvironmentManifest
  externalId: string
} {
  const { timing, spec } = input
  const { entry } = timing
  const mode = MODES[timing.mode]
  const halfWidth = (1.96 * entry.std) / Math.sqrt(entry.num_trials)
  const externalId = `${timing.machine}/${mode.key}/${timing.level}/${timing.file}`
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "BenchmarkRun",
    metadata: {
      name: kebab(`kernelbench-${timing.machine}-${mode.key}-${spec.slug}`),
      title: `${spec.title} · ${mode.title} · ${MACHINES[timing.machine].host}`,
    },
    spec: {
      implementationDigest: input.implementationDigest,
      workloadDigest: input.workloadDigest,
      protocolDigest: input.protocolDigest,
      environmentDigest: input.environmentDigest,
      status: "passed",
      timing: {
        primaryStatistic: "mean",
        samples: entry.num_trials,
        latencyNs: {
          mean: ns(entry.mean),
          minimum: ns(entry.min),
          maximum: ns(entry.max),
          confidence95: [
            ns(Math.max(entry.mean - halfWidth, entry.min)),
            ns(entry.mean + halfWidth),
          ],
        },
      },
      measurements: [
        {
          metric: "latency",
          unit: "ns",
          statistic: "std",
          value: ns(entry.std),
        },
      ],
      sourceNative: {
        source: KB_SOURCE.slug,
        benchmark: `${timing.machine}/${timing.mode}`,
        externalId,
        metrics: {
          mean_ms: entry.mean,
          std_ms: entry.std,
          min_ms: entry.min,
          max_ms: entry.max,
        },
      },
      observedAt: input.observedAt,
    },
  })
  if (manifest.kind !== "BenchmarkRun") throw new Error("unreachable")
  return {
    manifest,
    protocol: input.protocol,
    environment: input.environment,
    externalId,
  }
}
