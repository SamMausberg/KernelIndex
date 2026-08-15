// KernelBot-to-KernelIndex normalization (§14.5): curated problem →
// OperationSpec, benchmark axes → WorkloadCase, submission → implementation
// plus one per-shape BenchmarkRun per benchmark. Nothing here invents facts:
// per-run software versions ride run labels because the runner fleet's stack
// drifted across each competition window; the source-native cohort is the
// competition itself.
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
import type { CuratedProblem } from "./problems.ts"
import {
  DATASET_URL,
  type GmBenchmark,
  type GmSubmissionRow,
  REFERENCE_KERNELS_REPO,
} from "./types.ts"

const HARDWARE: Record<
  string,
  { vendor: string; product: string; architecture: string }
> = {
  "AMD Instinct MI300X": {
    vendor: "amd",
    product: "AMD Instinct MI300X",
    architecture: "gfx942",
  },
  "AMD Instinct MI325X": {
    vendor: "amd",
    product: "AMD Instinct MI325X",
    architecture: "gfx942",
  },
}

export function gmHardware(name: string) {
  return (
    HARDWARE[name] ?? { vendor: "amd", product: name, architecture: "unknown" }
  )
}

/** Curated problem → immutable OperationSpec manifest. */
export function operationFromProblem(problem: CuratedProblem): {
  manifest: OperationSpecManifest
  slug: string
  aliases: string[]
  tags: string[]
  externalId: string
} {
  const argument = (entry: CuratedProblem["inputs"][number]) => ({
    name: entry.name,
    tensor: { shape: entry.shape, dtype: entry.dtype, layout: entry.layout },
  })
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "OperationSpec",
    metadata: {
      name: problem.slug,
      title: problem.title,
      description: problem.description,
      sourceRefs: [
        {
          url: `https://github.com/${REFERENCE_KERNELS_REPO}/blob/main/${problem.taskPath}`,
        },
      ],
    },
    spec: {
      family: problem.family,
      axes: Object.fromEntries(
        Object.entries(problem.axes).map(([name, axis]) => [
          name,
          axis.role === "constant"
            ? { role: "constant", type: "integer", value: axis.value }
            : axis.role === "derived"
              ? {
                  role: "derived",
                  type: "integer",
                  expression: axis.expression,
                }
              : { role: "variable", type: "integer" },
        ]),
      ),
      inputs: problem.inputs.map(argument),
      outputs: problem.outputs.map(argument),
      semantics: { mutation: "none", determinism: "unspecified" },
    },
  })
  if (manifest.kind !== "OperationSpec") throw new Error("unreachable")
  return {
    manifest,
    slug: problem.slug,
    aliases: [problem.leaderboard],
    tags: [
      ...new Set(
        problem.tags.map((tag) =>
          tag.startsWith("model:")
            ? `model:${kebab(tag.slice(6))}`
            : kebab(tag),
        ),
      ),
    ],
    externalId: problem.leaderboard,
  }
}

/** Stable case identity within one problem: the sorted axis bindings. */
export function benchmarkKey(axes: Record<string, number>): string {
  return Object.entries(axes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([axis, value]) => `${axis}${value}`)
    .join("-")
}

/** One benchmark's axis bindings → exact WorkloadCase manifest. */
export function caseFromBenchmark(
  problem: CuratedProblem,
  operationSpecDigest: string,
  axes: Record<string, number>,
): WorkloadCaseManifest {
  const bindings: Record<string, number> = { ...axes }
  for (const [name, axis] of Object.entries(problem.axes)) {
    if (axis.role === "constant") bindings[name] = axis.value
  }
  for (const [name, axis] of Object.entries(problem.axes)) {
    if (axis.role === "derived" && bindings[name] === undefined) {
      bindings[name] = evaluateAxisExpression(axis.expression, bindings)
    }
  }
  const bound = (dim: string | number): number => {
    if (typeof dim === "number") return dim
    const value = bindings[dim]
    if (value === undefined)
      throw new Error(`unbound axis '${dim}' in ${problem.leaderboard}`)
    return value
  }
  const title = `${problem.title} · ${Object.entries(axes)
    .map(([axis, value]) => `${axis}=${value}`)
    .join(", ")}`
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "WorkloadCase",
    metadata: {
      name: kebab(`${problem.slug}-${benchmarkKey(axes)}`),
      title: title.length > 200 ? `${title.slice(0, 199)}…` : title,
    },
    spec: {
      operationSpecDigest,
      axes,
      // Layouts live on the operation spec; workload tensors bind shapes.
      tensors: Object.fromEntries(
        problem.inputs.map((entry) => [
          entry.name,
          { shape: entry.shape.map(bound), dtype: entry.dtype },
        ]),
      ),
      correctness: { comparator: "kernelbot_eval" },
    },
  })
  if (manifest.kind !== "WorkloadCase") throw new Error("unreachable")
  return manifest
}

/** One shared protocol: the reference-kernels eval harness as run upstream. */
export function kernelbotProtocol(): BenchmarkProtocolManifest {
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "BenchmarkProtocol",
    metadata: {
      name: "gpumode-kernelbot-eval",
      title: "GPU MODE KernelBot evaluation harness",
    },
    spec: {
      harness: {
        name: "reference-kernels eval.py",
        repository: `https://github.com/${REFERENCE_KERNELS_REPO}`,
      },
      // Wall clock around a synchronized kernel call; up to 100 iterations
      // with early stopping. The harness evolved within each competition as
      // run upstream, so no single revision is claimed here.
      measurement: { timer: "wall_clock", primaryStatistic: "mean" },
      correctness: {
        reference: "problem reference implementation",
        comparator: "kernelbot_eval",
      },
      comparability: {
        family: "gpumode_kernelbot",
        notes:
          "Per-case wall-clock statistics as published in the KernelBot dataset. Comparable only within one leaderboard problem and GPU type; runner software versions ride each run's labels.",
      },
    },
  })
  if (manifest.kind !== "BenchmarkProtocol") throw new Error("unreachable")
  return manifest
}

export function kernelbotEnvironment(
  gpuName: string,
): ExecutionEnvironmentManifest {
  const hardware = gmHardware(gpuName)
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "ExecutionEnvironment",
    metadata: {
      name: kebab(`gpumode-kernelbot-${gpuName}`),
      title: `KernelBot runner · ${hardware.product}`,
    },
    spec: { hardware, software: {} },
  })
  if (manifest.kind !== "ExecutionEnvironment") throw new Error("unreachable")
  return manifest
}

export function projectForUser(userId: string | number): {
  manifest: SoftwareProjectManifest
  slug: string
} {
  const slug = `kernelbot-user-${kebab(String(userId))}`
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "SoftwareProject",
    metadata: { name: slug },
    spec: {
      name: `KernelBot user ${userId}`,
      host: { kind: "other", id: `gpumode-kernelbot/user/${userId}` },
    },
  })
  if (manifest.kind !== "SoftwareProject") throw new Error("unreachable")
  return { manifest, slug }
}

/**
 * A submission's implementation identity. Source code is published inside
 * the licensed dataset (not mirrored here); the submission's own license is
 * unknown, so deployability stays honest (§8.15).
 */
export function implementationFromRow(
  row: GmSubmissionRow,
  problem: CuratedProblem,
  operationSpecDigest: string,
  gpuName: string,
): {
  manifest: ImplementationRevisionManifest
  slug: string
  projectSlug: string
  externalId: string
} {
  const hardware = gmHardware(gpuName)
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "ImplementationRevision",
    metadata: {
      name: `kernelbot-submission-${row.submission_id}`,
      title: `${problem.leaderboard} · submission ${row.submission_id}`,
      description: row.file_name ?? undefined,
      sourceRefs: [{ url: DATASET_URL }],
    },
    spec: {
      projectRevision: { version: `submission-${row.submission_id}` },
      operation: { specDigest: operationSpecDigest },
      callable: { language: "python" },
      support: {
        hardwareArchitectures: [hardware.architecture],
        productsTested: [hardware.product],
        dtypes: [...new Set(problem.inputs.map((entry) => entry.dtype))],
      },
      licensing: {},
    },
  })
  if (manifest.kind !== "ImplementationRevision") throw new Error("unreachable")
  return {
    manifest,
    slug: kebab(`kernelbot-${problem.leaderboard}-${row.submission_id}`),
    projectSlug: `kernelbot-user-${kebab(String(row.user_id))}`,
    externalId: `submission/${row.submission_id}`,
  }
}

/** One benchmark of one submission → exact per-case reported run. */
export function runFromBenchmark(input: {
  row: GmSubmissionRow
  problem: CuratedProblem
  benchmark: GmBenchmark
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
  const { row, problem, benchmark } = input
  const labels: Record<string, string> = {}
  if (row.run_system_info?.torch) labels.torch = row.run_system_info.torch
  if (row.run_system_info?.platform)
    labels.platform = row.run_system_info.platform
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "BenchmarkRun",
    metadata: {
      name: kebab(
        `kernelbot-${row.submission_id}-${benchmarkKey(benchmark.axes)}`,
      ),
      title: `${problem.leaderboard} · submission ${row.submission_id} · case ${benchmark.index}`,
      labels: Object.keys(labels).length > 0 ? labels : undefined,
    },
    spec: {
      implementationDigest: input.implementationDigest,
      workloadDigest: input.workloadDigest,
      protocolDigest: input.protocolDigest,
      environmentDigest: input.environmentDigest,
      status: "passed",
      timing: {
        primaryStatistic: "mean",
        samples: benchmark.runs ?? undefined,
        latencyNs: {
          mean: Math.round(benchmark.meanNs),
          minimum:
            benchmark.bestNs !== null
              ? Math.round(benchmark.bestNs)
              : undefined,
          maximum:
            benchmark.worstNs !== null
              ? Math.round(benchmark.worstNs)
              : undefined,
        },
      },
      measurements:
        benchmark.stdNs !== null
          ? [
              {
                metric: "latency",
                unit: "ns",
                statistic: "std",
                value: benchmark.stdNs,
                sampleCount: benchmark.runs ?? undefined,
              },
            ]
          : undefined,
      sourceNative: {
        source: "gpumode-kernelbot",
        benchmark: `${problem.leaderboard}/${benchmark.index}`,
        externalId: `submission/${row.submission_id}`,
        metrics: {
          mean_ns: benchmark.meanNs,
          ...(benchmark.bestNs !== null ? { best_ns: benchmark.bestNs } : {}),
          ...(typeof row.run_score === "number"
            ? { leaderboard_score_s: row.run_score }
            : {}),
        },
      },
      observedAt: toUtcInstant(row.submission_time),
    },
  })
  if (manifest.kind !== "BenchmarkRun") throw new Error("unreachable")
  return {
    manifest,
    protocol: input.protocol,
    environment: input.environment,
    externalId: `submission/${row.submission_id}/benchmark/${benchmark.index}`,
  }
}
