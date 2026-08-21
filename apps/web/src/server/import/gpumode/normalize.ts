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
  WorkloadSuiteManifest,
} from "../../../schemas/kinds.ts"
import { parseManifestDocument } from "../../../schemas/parse.ts"
import type { BundleArtifact } from "../../catalog/publication.ts"
import { sha256Digest } from "../../identity/digest.ts"
import { evaluateAxisExpression, kebab, toUtcInstant } from "../shared.ts"
import type { CuratedProblem } from "./problems.ts"
import {
  DATASET_URL,
  type GmBenchmark,
  type GmCandidate,
  type GmSubmissionRow,
  REFERENCE_KERNELS_REPO,
} from "./types.ts"

// System-reported GPU names (per-shape boards) and runner labels (flat
// boards) → normalized hardware. Architecture tokens match the SOL importer.
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
  MI300: {
    vendor: "amd",
    product: "AMD Instinct MI300X",
    architecture: "gfx942",
  },
  MI355X: {
    vendor: "amd",
    product: "AMD Instinct MI355X",
    architecture: "gfx950",
  },
  B200: { vendor: "nvidia", product: "NVIDIA B200", architecture: "sm_100" },
  B200_Nebius: {
    vendor: "nvidia",
    product: "NVIDIA B200",
    architecture: "sm_100",
  },
  // The NVFP4 competition's on-prem runner label; the competition ran on
  // Blackwell B200s per the dataset card. Fleet separation (vs the Modal
  // "B200" runner) rides the environment's formFactor, not the product.
  NVIDIA: { vendor: "nvidia", product: "NVIDIA B200", architecture: "sm_100" },
  A100: { vendor: "nvidia", product: "NVIDIA A100", architecture: "sm_80" },
  H100: { vendor: "nvidia", product: "NVIDIA H100", architecture: "sm_90" },
  L4: { vendor: "nvidia", product: "NVIDIA L4", architecture: "sm_89" },
  T4: { vendor: "nvidia", product: "NVIDIA T4", architecture: "sm_75" },
}

export function gmHardware(name: string) {
  const known = HARDWARE[name]
  if (known) return known
  const vendor = /mi\d/i.test(name)
    ? "amd"
    : /^(nvidia|rtx|[abhlt]\d)/i.test(name)
      ? "nvidia"
      : "unknown"
  return { vendor, product: name, architecture: "unknown" }
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
    // The upstream board name plus the curated human title (lowercased):
    // "triangle multiplicative update" must resolve as well as "trimul".
    aliases: [...new Set([problem.leaderboard, problem.title.toLowerCase()])],
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

/**
 * KernelBot runner environment. Flat boards pass their runner label as the
 * fleet: distinct fleets (on-prem "NVIDIA", Modal "B200", Nebius) stay in
 * distinct comparison cohorts even when the GPU product is the same, exactly
 * as the upstream leaderboards keep them apart.
 */
export function kernelbotEnvironment(
  gpuName: string,
  fleet?: string,
): ExecutionEnvironmentManifest {
  const hardware = gmHardware(gpuName)
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "ExecutionEnvironment",
    metadata: {
      name: kebab(`gpumode-kernelbot-${gpuName}`),
      title: `KernelBot runner · ${hardware.product}${fleet && fleet !== gpuName ? ` (${fleet})` : ""}`,
    },
    spec: {
      hardware: fleet
        ? { ...hardware, formFactor: `runner:${fleet}` }
        : hardware,
      software: {},
    },
  })
  if (manifest.kind !== "ExecutionEnvironment") throw new Error("unreachable")
  return manifest
}

/** One project per competition author; the display name prefers the
 * public username (flat configs carry it, per-shape ones do not). */
export function projectForUser(
  userId: string | number,
  userName?: string | null,
): {
  manifest: SoftwareProjectManifest
  slug: string
} {
  const slug = `kernelbot-user-${kebab(String(userId))}`
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "SoftwareProject",
    metadata: { name: slug },
    spec: {
      name: userName?.trim() || `KernelBot user ${userId}`,
      kind: "individual",
      host: { kind: "other", id: `gpumode-kernelbot/user/${userId}` },
    },
  })
  if (manifest.kind !== "SoftwareProject") throw new Error("unreachable")
  return { manifest, slug }
}

/** Our right to display the mirrored code; the submission's own license
 * stays unknown, so deployability stays honest (§8.15). */
export const KERNELBOT_CODE_LICENSE = "LicenseRef-GPUMode-Reciprocity-1.0"

function mediaTypeOf(fileName: string | null): string {
  if (fileName?.endsWith(".cu")) return "text/x-cuda"
  if (fileName?.endsWith(".py")) return "text/x-python"
  return "text/plain"
}

/**
 * A submission's implementation identity. The submission source is mirrored
 * from the licensed dataset as a content-addressed inline artifact; its
 * digest is part of the implementation identity (different code ⇒ different
 * implementation).
 */
export function implementationFromRow(
  candidate: GmCandidate,
  problem: CuratedProblem,
  operationSpecDigest: string,
): {
  manifest: ImplementationRevisionManifest
  slug: string
  projectSlug: string
  externalId: string
  artifacts?: BundleArtifact[]
} {
  const hardware = gmHardware(candidate.runner)
  const code =
    candidate.code !== null && candidate.code.length > 0 ? candidate.code : null
  const codeDigest = code !== null ? sha256Digest(code) : null
  const userName =
    "user_name" in candidate.raw ? (candidate.raw.user_name ?? null) : null
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "ImplementationRevision",
    metadata: {
      name: `kernelbot-submission-${candidate.submissionId}`,
      title: `${problem.leaderboard} · submission ${candidate.submissionId}`,
      description: candidate.fileName ?? undefined,
      authors: userName !== null ? [{ name: userName }] : undefined,
      sourceRefs: [{ url: DATASET_URL }],
    },
    spec: {
      projectRevision: { version: `submission-${candidate.submissionId}` },
      operation: { specDigest: operationSpecDigest },
      callable: { language: "python" },
      support: {
        hardwareArchitectures: [hardware.architecture],
        productsTested: [hardware.product],
        dtypes: [...new Set(problem.inputs.map((entry) => entry.dtype))],
      },
      source:
        code !== null && codeDigest !== null
          ? {
              contentDigest: codeDigest,
              fileName: candidate.fileName ?? undefined,
              sizeBytes: Buffer.byteLength(code),
            }
          : undefined,
      licensing: {},
    },
  })
  if (manifest.kind !== "ImplementationRevision") throw new Error("unreachable")
  return {
    manifest,
    slug: kebab(`kernelbot-${problem.leaderboard}-${candidate.submissionId}`),
    projectSlug: `kernelbot-user-${kebab(candidate.userId)}`,
    externalId: `submission/${candidate.submissionId}`,
    artifacts:
      code !== null && codeDigest !== null
        ? [
            {
              role: "source",
              kind: "source",
              mediaType: mediaTypeOf(candidate.fileName),
              digest: codeDigest,
              sizeBytes: Buffer.byteLength(code),
              storage: "inline",
              content: code,
              uri: DATASET_URL,
              license: KERNELBOT_CODE_LICENSE,
            },
          ]
        : undefined,
  }
}

/** Aggregate board: the published case list behind the leaderboard score. */
export function suiteFromProblem(
  problem: CuratedProblem,
  operationSpecDigest: string,
): WorkloadSuiteManifest {
  if (!problem.suite)
    throw new Error(`${problem.leaderboard}: aggregate board without a suite`)
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "WorkloadSuite",
    metadata: {
      name: kebab(`${problem.slug}-suite`),
      title: `${problem.title} · leaderboard suite`,
    },
    spec: {
      operationSpecDigest,
      cases: problem.suite.cases,
      correctness: { comparator: "kernelbot_eval" },
      aggregation: { metric: "score", statistic: problem.suite.statistic },
    },
  })
  if (manifest.kind !== "WorkloadSuite") throw new Error("unreachable")
  return manifest
}

/** Aggregate boards' protocol: the upstream ranked leaderboard run. */
export function kernelbotRankedProtocol(
  statistic: string,
): BenchmarkProtocolManifest {
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "BenchmarkProtocol",
    metadata: {
      name: kebab(`gpumode-kernelbot-leaderboard-${statistic}`),
      title: "GPU MODE KernelBot ranked leaderboard run",
    },
    spec: {
      harness: {
        name: "reference-kernels eval.py",
        repository: `https://github.com/${REFERENCE_KERNELS_REPO}`,
      },
      measurement: { timer: "wall_clock", primaryStatistic: statistic },
      correctness: {
        reference: "problem reference implementation",
        comparator: "kernelbot_eval",
      },
      comparability: {
        family: "gpumode_kernelbot",
        notes:
          "Aggregate leaderboard score in seconds over the problem's published benchmark suite, as computed by the upstream ranked run. Comparable only within one leaderboard problem and runner type.",
      },
    },
  })
  if (manifest.kind !== "BenchmarkProtocol") throw new Error("unreachable")
  return manifest
}

/** One flat submission → one suite-scoped source-native aggregate run. */
export function aggregateRunFromRow(input: {
  candidate: GmCandidate
  problem: CuratedProblem
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
  const { candidate, problem } = input
  const statistic = problem.suite?.statistic ?? "unspecified"
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "BenchmarkRun",
    metadata: {
      name: kebab(`kernelbot-${candidate.submissionId}-leaderboard`),
      title: `${problem.leaderboard} · submission ${candidate.submissionId} · leaderboard score`,
    },
    spec: {
      implementationDigest: input.implementationDigest,
      workloadDigest: input.workloadDigest,
      protocolDigest: input.protocolDigest,
      environmentDigest: input.environmentDigest,
      status: "passed",
      measurements: [
        {
          metric: "score",
          unit: "s",
          statistic,
          value: candidate.score,
        },
      ],
      sourceNative: {
        source: "gpumode-kernelbot",
        benchmark: problem.leaderboard,
        externalId: `submission/${candidate.submissionId}`,
        metrics: { leaderboard_score_s: candidate.score },
      },
      observedAt: toUtcInstant(candidate.submissionTime),
    },
  })
  if (manifest.kind !== "BenchmarkRun") throw new Error("unreachable")
  return {
    manifest,
    protocol: input.protocol,
    environment: input.environment,
    externalId: `submission/${candidate.submissionId}/leaderboard`,
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
