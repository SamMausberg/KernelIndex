// Liger-to-KernelIndex normalization (§14.5): curated kernel → one
// OperationSpec covering the module computation, the timed pass (forward /
// backward / full) → one protocol each, provider → implementation, row →
// exact per-case reported run. The upstream CSV records no CUDA, driver, or
// torch version, so environments carry hardware only and the Liger release
// rides each run's labels — stated in the protocol's comparability notes.
import type {
  BenchmarkProtocolManifest,
  BenchmarkRunManifest,
  ExecutionEnvironmentManifest,
  ImplementationRevisionManifest,
  OperationSpecManifest,
  SoftwareProjectManifest,
  WorkloadCaseManifest,
} from "../../../schemas/kinds.ts"
import { parseManifestDocument } from "../../../schemas/parse.ts"
import { evaluateAxisExpression, kebab, toUtcInstant } from "../shared.ts"
import type { LigerBinding, LigerKernelSpec } from "./kernels.ts"
import { MODES } from "./kernels.ts"
import { LIGER_REPO_URL, LIGER_SOURCE, type LigerRow } from "./types.ts"

const HARDWARE: Record<
  string,
  { vendor: string; product: string; architecture: string; formFactor?: string }
> = {
  "NVIDIA A100-SXM4-80GB": {
    vendor: "nvidia",
    product: "NVIDIA A100",
    architecture: "sm_80",
    formFactor: "SXM4-80GB",
  },
  "NVIDIA H100 80GB HBM3": {
    vendor: "nvidia",
    product: "NVIDIA H100",
    architecture: "sm_90",
    formFactor: "80GB HBM3",
  },
  "NVIDIA H100 PCIe": {
    vendor: "nvidia",
    product: "NVIDIA H100",
    architecture: "sm_90",
    formFactor: "PCIe",
  },
  "NVIDIA B200": {
    vendor: "nvidia",
    product: "NVIDIA B200",
    architecture: "sm_100",
  },
  "NVIDIA GeForce RTX 3090": {
    vendor: "nvidia",
    product: "NVIDIA GeForce RTX 3090",
    architecture: "sm_86",
  },
  "NVIDIA GeForce RTX 4090": {
    vendor: "nvidia",
    product: "NVIDIA GeForce RTX 4090",
    architecture: "sm_89",
  },
}

export function ligerHardware(name: string) {
  return HARDWARE[name] ?? null
}

/** Baseline providers ride their real upstream projects; every liger_*
 * provider is a Liger-Kernel callable. Unknown providers skip with review. */
const PROJECTS: Record<
  string,
  { slug: string; manifest: () => SoftwareProjectManifest }
> = {
  "liger-kernel": {
    slug: "liger-kernel",
    manifest: () =>
      project("liger-kernel", "Liger-Kernel", LIGER_REPO_URL, {
        kind: "github",
        id: "linkedin/Liger-Kernel",
      }),
  },
  pytorch: {
    slug: "pytorch",
    manifest: () =>
      project("pytorch", "PyTorch", "https://github.com/pytorch/pytorch", {
        kind: "github",
        id: "pytorch/pytorch",
      }),
  },
  "megatron-lm": {
    slug: "megatron-lm",
    manifest: () =>
      project(
        "megatron-lm",
        "NVIDIA Megatron-LM",
        "https://github.com/NVIDIA/Megatron-LM",
        { kind: "github", id: "NVIDIA/Megatron-LM" },
      ),
  },
  deepspeed: {
    slug: "deepspeed",
    manifest: () =>
      project(
        "deepspeed",
        "DeepSpeed",
        "https://github.com/deepspeedai/DeepSpeed",
        { kind: "github", id: "deepspeedai/DeepSpeed" },
      ),
  },
  transformers: {
    slug: "transformers",
    manifest: () =>
      project(
        "transformers",
        "Hugging Face Transformers",
        "https://github.com/huggingface/transformers",
        { kind: "github", id: "huggingface/transformers" },
      ),
  },
}

function project(
  name: string,
  display: string,
  repository: string,
  host: { kind: "github"; id: string },
): SoftwareProjectManifest {
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "SoftwareProject",
    metadata: { name },
    spec: { name: display, repository, host },
  })
  if (manifest.kind !== "SoftwareProject") throw new Error("unreachable")
  return manifest
}

export const PROVIDERS: Record<
  string,
  {
    projectSlug: keyof typeof PROJECTS
    title: string
    language: string
    description: string
    /** Declared upstream license; concluded only where source policy did. */
    declared: string
    concluded?: string
    pipPackage?: string
    /** Eager reference modules are the benchmark's comparison baselines;
     * torch.compile competes. */
    role?: "baseline"
  }
> = {
  liger: {
    projectSlug: "liger-kernel",
    title: "Liger",
    language: "triton",
    description: "Liger-Kernel Triton implementation.",
    declared: "BSD-2-Clause",
    concluded: "BSD-2-Clause",
    pipPackage: "liger-kernel",
  },
  liger_fused_add_rms_norm: {
    projectSlug: "liger-kernel",
    title: "Liger fused",
    language: "triton",
    description: "Liger-Kernel fused add + RMSNorm Triton implementation.",
    declared: "BSD-2-Clause",
    concluded: "BSD-2-Clause",
    pipPackage: "liger-kernel",
  },
  liger_rms_norm: {
    projectSlug: "liger-kernel",
    title: "Liger unfused",
    language: "triton",
    description:
      "Residual add in PyTorch followed by the Liger RMSNorm Triton kernel (unfused baseline).",
    declared: "BSD-2-Clause",
    concluded: "BSD-2-Clause",
    pipPackage: "liger-kernel",
  },
  huggingface: {
    projectSlug: "transformers",
    title: "Transformers",
    language: "python",
    description: "Hugging Face Transformers reference module.",
    declared: "Apache-2.0",
    role: "baseline",
  },
  torch: {
    projectSlug: "pytorch",
    title: "PyTorch",
    language: "python",
    description: "PyTorch reference module.",
    declared: "BSD-3-Clause",
    role: "baseline",
  },
  torch_compile: {
    projectSlug: "pytorch",
    title: "torch.compile",
    language: "python",
    description: "PyTorch reference module compiled with torch.compile.",
    declared: "BSD-3-Clause",
  },
  liger_in_place: {
    projectSlug: "liger-kernel",
    title: "Liger in-place",
    language: "triton",
    description: "Liger-Kernel Triton implementation, in-place variant.",
    declared: "BSD-2-Clause",
    concluded: "BSD-2-Clause",
    pipPackage: "liger-kernel",
  },
  liger_tiled: {
    projectSlug: "liger-kernel",
    title: "Liger tiled",
    language: "triton",
    description:
      "Liger-Kernel MLP under seq-sharded tiled execution (same computation, chunked over the sequence).",
    declared: "BSD-2-Clause",
    concluded: "BSD-2-Clause",
    pipPackage: "liger-kernel",
  },
  megatron: {
    projectSlug: "megatron-lm",
    title: "Megatron",
    language: "python",
    description: "Megatron-Core module for the benchmarked operation.",
    declared: "BSD-3-Clause",
  },
  "megatron-fused": {
    projectSlug: "megatron-lm",
    title: "Megatron fused",
    language: "python",
    description:
      "Megatron-Core fused_vocab_parallel_cross_entropy (fused kernel path).",
    declared: "BSD-3-Clause",
  },
  "megatron-unfused": {
    projectSlug: "megatron-lm",
    title: "Megatron unfused",
    language: "python",
    description:
      "Megatron-Core vocab_parallel_cross_entropy (unfused reference path).",
    declared: "BSD-3-Clause",
    role: "baseline",
  },
  deepspeed_tiled: {
    projectSlug: "deepspeed",
    title: "DeepSpeed tiled",
    language: "python",
    description: "DeepSpeed TiledMLP seq-sharded execution.",
    declared: "Apache-2.0",
  },
}

export function projectManifest(slug: keyof typeof PROJECTS): {
  manifest: SoftwareProjectManifest
  slug: string
} {
  const entry = PROJECTS[slug]
  return { manifest: entry.manifest(), slug: entry.slug }
}

/** The symbolic axes a signature references, in declaration order. */
function signatureAxes(spec: LigerKernelSpec): string[] {
  const names = new Set<string>()
  for (const argument of [...spec.inputs, ...spec.outputs])
    for (const dim of argument.shape)
      if (typeof dim === "string" && !(dim in (spec.derived ?? {})))
        names.add(dim)
  return [...names]
}

export function operationFromKernel(
  spec: LigerKernelSpec,
  commit: string,
): { manifest: OperationSpecManifest; slug: string; externalId: string } {
  const argument = (entry: LigerKernelSpec["inputs"][number]) => ({
    name: entry.name,
    tensor: {
      shape: entry.shape,
      // "cfg" tensors take the workload's float dtype; the exact dtype is
      // bound per case, so the signature declares the family.
      dtype: entry.dtype === "cfg" ? "float" : entry.dtype,
    },
  })
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "OperationSpec",
    metadata: {
      name: spec.slug,
      title: spec.title,
      description: spec.description,
      sourceRefs: [
        {
          url: `${LIGER_REPO_URL}/blob/${commit}/benchmark/scripts/benchmark_${spec.csvName}.py`,
        },
      ],
    },
    spec: {
      family: spec.family,
      axes: {
        ...Object.fromEntries(
          signatureAxes(spec).map((name) => [
            name,
            { role: "variable", type: "integer" },
          ]),
        ),
        ...Object.fromEntries(
          Object.entries(spec.derived ?? {}).map(([name, expression]) => [
            name,
            { role: "derived", type: "integer", expression },
          ]),
        ),
      },
      inputs: spec.inputs.map(argument),
      outputs: spec.outputs.map(argument),
      semantics: { mutation: "none", determinism: "unspecified" },
    },
  })
  if (manifest.kind !== "OperationSpec") throw new Error("unreachable")
  return { manifest, slug: spec.slug, externalId: spec.csvName }
}

/** Stable case identity: sorted axis bindings plus the bound float dtype. */
export function caseKey(binding: LigerBinding): string {
  const axes = Object.entries(binding.axes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([axis, value]) => `${axis}${value}`)
    .join("-")
  return `${axes}-${binding.dtype}`
}

export function caseFromRow(
  spec: LigerKernelSpec,
  operationSpecDigest: string,
  binding: LigerBinding,
): WorkloadCaseManifest {
  const bindings: Record<string, number> = { ...binding.axes }
  for (const [name, expression] of Object.entries(spec.derived ?? {}))
    bindings[name] = evaluateAxisExpression(expression, bindings)
  const bound = (dim: string | number): number => {
    if (typeof dim === "number") return dim
    const value = bindings[dim]
    if (value === undefined)
      throw new Error(`unbound axis '${dim}' in ${spec.csvName}`)
    return value
  }
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "WorkloadCase",
    metadata: {
      name: kebab(`${spec.slug}-${caseKey(binding)}`),
      title: `${spec.title} · ${Object.entries(binding.axes)
        .map(([axis, value]) => `${axis}=${value}`)
        .join(", ")} · ${binding.dtype}`,
    },
    spec: {
      operationSpecDigest,
      axes: binding.axes,
      tensors: Object.fromEntries(
        spec.inputs.map((entry) => [
          entry.name,
          {
            shape: entry.shape.map(bound),
            dtype: entry.dtype === "cfg" ? binding.dtype : entry.dtype,
          },
        ]),
      ),
      scalars: binding.scalars
        ? Object.fromEntries(
            Object.entries(binding.scalars).map(([name, value]) => [
              name,
              { dtype: "fp32", value },
            ]),
          )
        : undefined,
      // The benchmark harness asserts nothing per run; Liger's own test
      // suite validates kernels separately (§8.14 keeps that distinct).
      correctness: { comparator: "not_asserted" },
    },
  })
  if (manifest.kind !== "WorkloadCase") throw new Error("unreachable")
  return manifest
}

/** One protocol per timed pass: do_bench methodology is shared; what is
 * being timed differs, which is exactly what a protocol states (§8.9). */
export function ligerProtocol(mode: string): BenchmarkProtocolManifest {
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "BenchmarkProtocol",
    metadata: {
      name: kebab(`liger-bench-do-bench-${mode}`),
      title: `Liger benchmark harness · ${mode} pass`,
    },
    spec: {
      harness: {
        name: "Liger-Kernel benchmark scripts",
        repository: LIGER_REPO_URL,
      },
      measurement: { timer: "cuda_events", primaryStatistic: "median" },
      comparability: {
        family: "liger_kernel_bench",
        notes: `Timed: ${MODES[mode] ?? mode}, via triton.testing.do_bench with quantiles 0.5/0.2/0.8 (median with p20/p80 spread). The upstream CSV records no CUDA, driver, or torch version; the Liger release rides each run's labels. Comparable only within one kernel, workload, timed pass, and GPU.`,
      },
    },
  })
  if (manifest.kind !== "BenchmarkProtocol") throw new Error("unreachable")
  return manifest
}

export function ligerEnvironment(
  gpuName: string,
): ExecutionEnvironmentManifest | null {
  const hardware = ligerHardware(gpuName)
  if (!hardware) return null
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "ExecutionEnvironment",
    metadata: {
      name: kebab(`liger-bench-${gpuName}`),
      title: `Liger benchmark host · ${gpuName.replace(/^NVIDIA /, "")}`,
    },
    spec: { hardware, software: {} },
  })
  if (manifest.kind !== "ExecutionEnvironment") throw new Error("unreachable")
  return manifest
}

export function implementationFromProvider(
  spec: LigerKernelSpec,
  provider: string,
  operationSpecDigest: string,
): {
  manifest: ImplementationRevisionManifest
  slug: string
  projectSlug: string
  externalId: string
} | null {
  const entry = PROVIDERS[provider]
  if (!entry) return null
  const project = PROJECTS[entry.projectSlug]
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "ImplementationRevision",
    metadata: {
      name: kebab(`liger-bench-${spec.csvName}-${provider}`),
      title: `${spec.title} · ${entry.title}`,
      description: entry.description,
      labels: entry.role ? { role: entry.role } : undefined,
      sourceRefs: [{ url: LIGER_REPO_URL }],
    },
    spec: {
      projectRevision: {},
      operation: { specDigest: operationSpecDigest },
      callable: { language: entry.language },
      support: { hardwareArchitectures: [], dtypes: [] },
      buildVariants: entry.pipPackage
        ? [
            {
              name: "pip",
              install: { kind: "pip", package: entry.pipPackage },
            },
          ]
        : undefined,
      licensing: { declared: entry.declared, concluded: entry.concluded },
    },
  })
  if (manifest.kind !== "ImplementationRevision") throw new Error("unreachable")
  return {
    manifest,
    slug: kebab(`liger-bench-${spec.csvName}-${provider}`),
    projectSlug: project.slug,
    externalId: `${spec.csvName}/${provider}`,
  }
}

const MS_TO_NS = 1_000_000

export function runFromRow(input: {
  row: LigerRow
  spec: LigerKernelSpec
  binding: LigerBinding
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
  const { row, spec, binding } = input
  const ms50 = Number(row.y_value_50)
  const ms20 = Number(row.y_value_20)
  const ms80 = Number(row.y_value_80)
  if (!Number.isFinite(ms50) || ms50 <= 0)
    throw new Error(`invalid median '${row.y_value_50}'`)
  const spread = Number.isFinite(ms20) && Number.isFinite(ms80)
  const externalId = [
    spec.csvName,
    row.kernel_operation_mode,
    row.kernel_provider,
    kebab(row.gpu_name),
    caseKey(binding),
    kebab(row.timestamp),
  ].join("/")
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "BenchmarkRun",
    metadata: {
      name: kebab(
        `liger-${spec.csvName}-${row.kernel_operation_mode}-${row.kernel_provider}-${row.gpu_name}-${caseKey(binding)}-${row.timestamp}`,
      ),
      title: `${spec.title} · ${row.kernel_provider} · ${row.kernel_operation_mode}`,
      labels: { liger_version: row.liger_version },
    },
    spec: {
      implementationDigest: input.implementationDigest,
      workloadDigest: input.workloadDigest,
      protocolDigest: input.protocolDigest,
      environmentDigest: input.environmentDigest,
      status: "passed",
      timing: {
        primaryStatistic: "median",
        latencyNs: { median: Math.round(ms50 * MS_TO_NS) },
      },
      measurements: spread
        ? [
            {
              metric: "latency",
              unit: "ns",
              statistic: "p20",
              value: Math.round(ms20 * MS_TO_NS),
            },
            {
              metric: "latency",
              unit: "ns",
              statistic: "p80",
              value: Math.round(ms80 * MS_TO_NS),
            },
          ]
        : undefined,
      sourceNative: {
        source: LIGER_SOURCE.slug,
        benchmark: `${spec.csvName}/${row.kernel_operation_mode}`,
        externalId,
        metrics: {
          ms_50: ms50,
          ...(spread ? { ms_20: ms20, ms_80: ms80 } : {}),
        },
      },
      observedAt: toUtcInstant(row.timestamp.replace(" ", "T")),
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
