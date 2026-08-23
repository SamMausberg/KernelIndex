// Fixture dossiers (§16.9–16.11): the two implementation pages, the run
// evidence dossier, and the aligned compare derivation over the fixture
// corpus.
import type {
  CompareField,
  ComparePageModel,
  CompareRun,
  ImplementationPageModel,
  RunPageModel,
} from "@/lib/catalog-models"
import { RANKING_POLICY_VERSION, rankCohort } from "@/server/policy/ranking"
import {
  B200,
  COHORT_2048,
  digest,
  FIXTURE_ATTESTATIONS,
  FRESH,
  type FxRun,
  ILLUSTRATIVE,
  RANKED,
  RUNS,
  rowFromRun,
  WORKLOADS,
} from "./data"

export const IMPLEMENTATIONS: Record<string, ImplementationPageModel> = {
  "meridian-rmsnorm": {
    illustrative: ILLUSTRATIVE,
    implementation: {
      id: "impl-fx-meridian-rmsnorm",
      slug: "meridian-rmsnorm",
      name: "meridian-rmsnorm",
      digest: digest("impl:meridian-rmsnorm"),
      revision: "b81d40e",
      supersededById: null,
    },
    project: {
      name: "Meridian Kernels (fictional)",
      slug: "meridian-kernels",
      repositoryUrl: "https://example.invalid/meridian/kernels",
    },
    usage: {
      install: {
        kind: "git",
        command:
          "pip install git+https://example.invalid/meridian/kernels@b81d40e",
      },
      invocationExample:
        "from meridian_kernels import rmsnorm\noutput = rmsnorm(input, weight, epsilon=1e-6)",
      requirements: [
        { name: "python", constraint: ">=3.12,<3.14" },
        { name: "torch", constraint: ">=2.8,<2.10" },
        { name: "cudaToolkit", constraint: ">=13.0,<13.2" },
      ],
    },
    interface: {
      language: "triton",
      framework: "pytorch",
      symbol: "rmsnorm",
      sourcePath: "kernels/rmsnorm.py",
    },
    support: {
      hardware: ["NVIDIA B200 SXM"],
      architectures: ["sm_100"],
      dtypes: ["bf16"],
      layouts: ["row_major"],
      axes: ["tokens >= 1", "hidden == 4096"],
    },
    source: {
      available: true,
      url: "https://example.invalid/meridian/kernels/tree/b81d40e",
      commit: "b81d40e0b81d40e0b81d40e0b81d40e0b81d40e0",
      treeDigest: digest("tree:meridian-kernels:b81d40e"),
    },
    license: {
      declared: "Apache-2.0",
      concluded: "Apache-2.0",
      evidencePath: "LICENSE",
    },
    trust: {
      evidence: "verified",
      summary: "Fastest deployable result in the illustrative RMSNorm cohort",
    },
    standing: { records: 1 },
    bestResults: [rowFromRun(RUNS[1]), rowFromRun(RUNS[4])],
    limitations: ["hidden dimension fixed at 4096", "bf16 only"],
    provenance: {
      source: {
        name: "Illustrative fixture source",
        kind: "fixture",
        url: null,
        license: null,
        externalId: null,
        observedAt: FRESH,
      },
      authors: ["fictional-author"],
      importedAt: FRESH,
    },
    techniques: [],
    sourceCode: null,
  },
  "ionflux-rmsnorm": {
    illustrative: ILLUSTRATIVE,
    implementation: {
      id: "impl-fx-ionflux-rmsnorm",
      slug: "ionflux-rmsnorm",
      name: "ionflux-rmsnorm",
      digest: digest("impl:ionflux-rmsnorm"),
      revision: "3f9c2ad",
      supersededById: null,
    },
    project: {
      name: "IonFlux (fictional)",
      slug: "ionflux",
      repositoryUrl: null,
    },
    usage: { install: null, invocationExample: null, requirements: [] },
    interface: {
      language: "cuda",
      framework: "pytorch",
      symbol: null,
      sourcePath: null,
    },
    support: {
      hardware: ["NVIDIA B200 SXM"],
      architectures: ["sm_100"],
      dtypes: ["bf16"],
      layouts: ["row_major"],
      axes: ["tokens >= 1", "hidden == 4096"],
    },
    source: { available: false, url: null, commit: null, treeDigest: null },
    license: { declared: null, concluded: null, evidencePath: null },
    trust: {
      evidence: "verified",
      summary:
        "Fastest verified result in the illustrative cohort, but not deployable: no public source and unknown license",
    },
    standing: { records: 1 },
    bestResults: [rowFromRun(RUNS[0])],
    limitations: ["No public source", "License unknown", "No install recipe"],
    provenance: {
      source: {
        name: "Illustrative fixture source",
        kind: "fixture",
        url: null,
        license: null,
        externalId: null,
        observedAt: FRESH,
      },
      authors: [],
      importedAt: FRESH,
    },
    techniques: [
      {
        trait: "persistent-kernel",
        value: null,
        evidence: "for tile in range(pid, num_tiles, tl.num_programs(0)):",
      },
      {
        trait: "tile-m",
        value: "128",
        evidence: "BLOCK_M: tl.constexpr = 128",
      },
    ],
    sourceCode: {
      fileName: "submission.py",
      language: "python",
      content:
        "import torch\n\n\ndef custom_kernel(data):\n    x, weight = data\n    variance = x.pow(2).mean(-1, keepdim=True)\n    return x * torch.rsqrt(variance + 1e-6) * weight\n",
      license: "Illustrative fixture license",
      attribution: { text: "Illustrative fixture source", url: null },
      diff: {
        previousSlug: "ionflux-rmsnorm",
        previousName: "submission 1",
        lines: [
          { kind: "ctx", text: "def custom_kernel(data):" },
          { kind: "del", text: "    x, weight = data" },
          { kind: "add", text: "    x, weight = data  # fused path" },
          {
            kind: "ctx",
            text: "    variance = x.pow(2).mean(-1, keepdim=True)",
          },
        ],
      },
    },
  },
}

export async function getImplementationPage(
  slug: string,
): Promise<ImplementationPageModel | null> {
  return IMPLEMENTATIONS[slug] ?? null
}

function runPage(r: FxRun): RunPageModel {
  const w = WORKLOADS[r.workloadId]
  return {
    illustrative: ILLUSTRATIVE,
    run: {
      id: r.id,
      digest: digest(`run:${r.id}`),
      status: r.status,
      observedAt: r.lastTestedAt,
      publishedAt: r.lastTestedAt,
    },
    evidence: r.evidence,
    lifecycle: {
      supersedesId: r.supersedesId ?? null,
      supersededById: r.supersededById ?? null,
      retracted: r.retracted ?? null,
      disputed: r.disputed !== undefined ? { reason: r.disputed } : null,
      stale: r.stale ?? false,
    },
    primary: {
      metric: "latency",
      unit: "ns",
      statistic: "median",
      value: r.latencyNs,
      sampleCount: r.samples,
      uncertainty: r.ci ? { low: r.ci[0], high: r.ci[1] } : null,
    },
    cohort: {
      comparisonKey: COHORT_2048.comparisonKey,
      profile: r.evidence === "reported" ? "reported" : "strict_exact",
      rank: r.rank,
      eligible: (r.ineligibleReasons ?? []).length === 0,
      ineligibleReasons: r.ineligibleReasons ?? [],
      headRunId: r.workloadId === "wl-2048" ? RANKED[0].id : null,
    },
    implementation: {
      name: r.impl.name,
      slug: r.impl.slug,
      revision: r.impl.revision,
    },
    project: r.project,
    operation: { name: "RMSNorm, hidden 4096", slug: "rmsnorm-h4096" },
    workload: {
      id: w.id,
      digest: w.digest,
      label: w.label,
      axes: { ...w.axes },
      tensors: [
        {
          key: "input",
          value: `bf16 [${w.axes.tokens}, 4096] strides [4096, 1] align 16`,
        },
        { key: "weight", value: "bf16 [4096] strides [1] align 16" },
        { key: "epsilon", value: "fp32 scalar 1e-6" },
      ],
      tolerance: [
        { key: "comparator", value: "elementwise_close" },
        { key: "maxAbsoluteError", value: "0.01" },
        { key: "maxRelativeError", value: "0.01" },
        { key: "requiredMatchedRatio", value: "0.99" },
      ],
    },
    correctness:
      r.status === "passed"
        ? {
            comparator: "elementwise_close",
            maxAbsoluteError: 0.0042,
            maxRelativeError: 0.0081,
            matchedRatio: 1,
            passed: true,
          }
        : null,
    measurements: [
      {
        metric: "latency",
        statistic: "p05",
        value: Math.round(r.latencyNs * 0.993),
        unit: "ns",
        sampleCount: r.samples,
      },
      {
        metric: "latency",
        statistic: "p95",
        value: Math.round(r.latencyNs * 1.014),
        unit: "ns",
        sampleCount: r.samples,
      },
      {
        metric: "latency",
        statistic: "min",
        value: Math.round(r.latencyNs * 0.99),
        unit: "ns",
        sampleCount: r.samples,
      },
    ],
    protocol: [
      { key: "harness", value: "illustrative-harness 1.0" },
      { key: "timer", value: "device events" },
      { key: "warmup", value: "50 iterations" },
      {
        key: "measured",
        value: `${r.samples ?? "unknown"} samples, interleaved`,
      },
      { key: "primaryStatistic", value: "median" },
      { key: "compileIncluded", value: "no" },
    ],
    environment: [
      { key: "gpu", value: `${B200.model} (${B200.architecture})` },
      { key: "driver", value: "580.xx (illustrative)" },
      { key: "cudaToolkit", value: "13.1 (illustrative)" },
      { key: "framework", value: "pytorch 2.9 (illustrative)" },
      { key: "clocks", value: "locked, persistence mode on" },
    ],
    artifacts: [
      {
        role: "raw_samples",
        digest: digest(`artifact:${r.id}:samples`),
        mediaType: "application/json",
        sizeBytes: 18324,
        uri: null,
        availability: "unavailable",
      },
      {
        role: "logs",
        digest: digest(`artifact:${r.id}:logs`),
        mediaType: "text/plain",
        sizeBytes: 5240,
        uri: null,
        availability: "unavailable",
      },
    ],
    provenance: {
      source: {
        name: "Illustrative fixture source",
        kind: "fixture",
        url: null,
        license: null,
        externalId: r.id,
        observedAt: r.lastTestedAt,
      },
      externalId: r.id,
      parserVersion: null,
      snapshotDigest: null,
    },
    sourceNativeMetrics: r.sourceNative ?? null,
    attestations: r.id === "run-fx-0002" ? FIXTURE_ATTESTATIONS : [],
    manifest: {
      apiVersion: "kernelindex.dev/v1alpha1",
      kind: "BenchmarkRun",
      metadata: { name: r.id, illustrative: true },
      spec: {
        status: r.status,
        timing: {
          primaryStatistic: "median",
          latencyNs: { median: r.latencyNs },
        },
      },
    },
  }
}

export async function getRunPage(id: string): Promise<RunPageModel | null> {
  const r = RUNS.find((run) => run.id === id)
  return r ? runPage(r) : null
}

const cohortKeyOf = (r: FxRun) =>
  r.workloadId === "wl-2048"
    ? COHORT_2048.comparisonKey
    : digest("cohort:rmsnorm-h4096:tokens-1024")

/** Fixture compare mirrors the PostgreSQL field alignment (§16.11). */
export async function getComparePage(
  runIds: string[],
): Promise<ComparePageModel> {
  const wanted = [...new Set(runIds)].slice(0, 8)
  const selected = wanted
    .map((id) => RUNS.find((r) => r.id === id))
    .filter((r): r is FxRun => r !== undefined)
  const missingIds = wanted.filter((id) => !RUNS.some((r) => r.id === id))
  if (selected.length === 0) {
    return {
      illustrative: ILLUSTRATIVE,
      runs: [],
      comparable: false,
      profile: null,
      comparisonKey: null,
      fields: [],
      firstMaterialMismatch: null,
      explanation:
        "Select two to eight runs to compare. Every result row and run detail page links here.",
      missingIds,
      policyVersion: RANKING_POLICY_VERSION,
    }
  }

  const sharedCohort = selected.every(
    (r) => cohortKeyOf(r) === cohortKeyOf(selected[0]),
  )
  const comparable =
    selected.length >= 2 &&
    sharedCohort &&
    selected.every((r) => (r.ineligibleReasons ?? []).length === 0)
  const rankById = new Map<string, { rank: number; tied: boolean }>()
  if (comparable) {
    for (const entry of rankCohort(
      selected.map((r) => ({
        id: r.id,
        value: r.latencyNs,
        interval: r.ci ? { low: r.ci[0], high: r.ci[1] } : null,
        evidence: r.evidence,
        observedAt: new Date(r.lastTestedAt),
      })),
      "strict_exact",
    )) {
      rankById.set(entry.id, { rank: entry.rank, tied: entry.tiedWithPrevious })
    }
  }

  const runs: CompareRun[] = selected.map((r) => {
    const row = rowFromRun(r)
    return {
      runId: r.id,
      digest: digest(`run:${r.id}`),
      implementation: row.implementation,
      project: row.project,
      operation: row.operation,
      workloadLabel: WORKLOADS[r.workloadId].label,
      hardware: B200.model,
      primary: row.primary,
      evidence: r.evidence,
      status: r.status,
      comparisonKey: cohortKeyOf(r),
      rank: rankById.get(r.id)?.rank ?? null,
      tiedWithPrevious: rankById.get(r.id)?.tied ?? false,
      eligible: (r.ineligibleReasons ?? []).length === 0,
      ineligibleReasons: r.ineligibleReasons ?? [],
      license: r.license,
      install: row.install,
      sourceAvailable: r.sourceAvailable,
      observedAt: r.lastTestedAt,
    }
  })

  const field = (
    name: string,
    material: boolean,
    value: (r: FxRun) => string | null,
  ): CompareField => {
    const values = selected.map(value)
    return {
      field: name,
      material,
      values,
      differs: new Set(values.map((entry) => entry ?? "∅")).size > 1,
    }
  }
  const fields: CompareField[] = [
    field("operation", true, () => "rmsnorm-h4096"),
    field(
      "workload",
      true,
      (r) =>
        `${WORKLOADS[r.workloadId].label} · ${WORKLOADS[r.workloadId].digest.slice(7, 15)}`,
    ),
    field("protocol", true, () => "ki-fixed-clock v1 · 0f1e2d3c"),
    field("environment", true, () => `${B200.model} · 4b5a6978`),
    field("correctness policy", true, (r) =>
      WORKLOADS[r.workloadId].toleranceSummary.slice(0, 20),
    ),
    field("metric", true, () => "latency median (ns)"),
    field("architecture", false, () => B200.architecture),
    field("CUDA", false, () => "13.1"),
    field("framework", false, () => "pytorch 2.9"),
    field("samples", false, (r) => (r.samples ? String(r.samples) : null)),
    field("evidence", false, (r) => r.evidence),
    field("license", false, (r) => r.license.concluded),
    field("source", false, (r) =>
      r.sourceAvailable ? "available" : "unavailable",
    ),
    field("status", false, (r) => r.status),
    field("observed", false, (r) => r.lastTestedAt.slice(0, 10)),
  ]
  const firstMaterialMismatch =
    fields.find((entry) => entry.material && entry.differs)?.field ?? null
  const explanation = comparable
    ? `All ${selected.length} runs share one strict exact comparison cohort; ranks follow ${RANKING_POLICY_VERSION}.`
    : selected.length < 2
      ? "Add at least one more run to compare."
      : firstMaterialMismatch !== null
        ? `No winner can be declared: ${firstMaterialMismatch} differs. A valid comparison requires identical operation, workload, protocol, environment, correctness policy, and metric.`
        : "No winner can be declared: at least one selected run is not eligible for ranking."

  return {
    illustrative: ILLUSTRATIVE,
    runs,
    comparable,
    profile: sharedCohort ? "strict_exact" : null,
    comparisonKey: sharedCohort ? cohortKeyOf(selected[0]) : null,
    fields,
    firstMaterialMismatch,
    explanation,
    missingIds,
    policyVersion: RANKING_POLICY_VERSION,
  }
}
