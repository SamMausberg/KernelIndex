// Deterministic illustrative fixtures implementing the catalog read seam
// (§27.5). Every model carries `illustrative: true`; the UI must render that
// label. Projects, runs, and numbers are fictional and must never be
// presented as real benchmark evidence.
import type {
  CompareField,
  ComparePageModel,
  CompareRun,
  EvidenceLevel,
  HomePageModel,
  ImplementationPageModel,
  LicenseInfo,
  MatchQuality,
  Mismatch,
  OperationIndexEntry,
  OperationPageModel,
  PrimaryMetric,
  RecordHolder,
  RecordsPageModel,
  ResultRow,
  RunPageModel,
  RunStatus,
  SearchInput,
  SearchPageModel,
} from "@/lib/catalog-models"
import { describeIntent, parseQuery, removeToken } from "@/lib/search-query"
import { RANKING_POLICY_VERSION, rankCohort } from "@/server/policy/ranking"

const ILLUSTRATIVE = true
const FRESH = "2026-08-10T09:30:00Z"
const STALE = "2025-11-20T14:00:00Z"
const B200 = { model: "NVIDIA B200 SXM", architecture: "sm_100" }

// Deterministic fake digest: clearly synthetic, stable across runs.
function digest(seed: string): string {
  let h = 0x811c9dc5
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0
  return `sha256:${h.toString(16).padStart(8, "0").repeat(8)}`
}

const COHORT_2048 = {
  comparisonKey: digest("cohort:rmsnorm-h4096:tokens-2048"),
  profile: "strict_exact" as const,
  description:
    "RMSNorm, hidden 4096, tokens 2048, bf16 row-major on NVIDIA B200 SXM under the illustrative fixed protocol",
  facts: [
    { key: "GPU", value: "NVIDIA B200 SXM 180GB" },
    { key: "Workload", value: "tokens = 2048 · hidden = 4096 · bf16" },
    { key: "Layout", value: "row-major · aligned 16" },
    { key: "CUDA", value: "13.1 · driver 590.24" },
    { key: "Framework", value: "PyTorch 2.9.0" },
    {
      key: "Protocol",
      value: "ki-fixed-clock v1 · median of 200 · compile excluded",
    },
  ],
}

const WORKLOADS = {
  "wl-2048": {
    id: "wl-2048",
    digest: digest("workload:rmsnorm-h4096:tokens-2048"),
    label: "tokens = 2048 · bf16 · [2048, 4096]",
    axes: { tokens: 2048, hidden: 4096 },
    summary: "bf16 · [2048, 4096] · row-major",
    toleranceSummary: "abs ≤ 1e-2, rel ≤ 1e-2, matched ≥ 99%",
  },
  "wl-1024": {
    id: "wl-1024",
    digest: digest("workload:rmsnorm-h4096:tokens-1024"),
    label: "tokens = 1024 · bf16 · [1024, 4096]",
    axes: { tokens: 1024, hidden: 4096 },
    summary: "bf16 · [1024, 4096] · row-major",
    toleranceSummary: "abs ≤ 1e-2, rel ≤ 1e-2, matched ≥ 99%",
  },
} as const

type WorkloadId = keyof typeof WORKLOADS

const APACHE: LicenseInfo = { declared: "Apache-2.0", concluded: "Apache-2.0" }
const UNKNOWN_LICENSE: LicenseInfo = { declared: null, concluded: null }

type FxRun = {
  id: string
  status: RunStatus
  evidence: EvidenceLevel
  impl: { name: string; slug: string; revision: string | null }
  project: { name: string; slug: string }
  workloadId: WorkloadId
  latencyNs: number
  ci: [number, number] | null
  samples: number | null
  rank: number | null
  tied?: boolean
  match: MatchQuality
  mismatches?: Mismatch[]
  sourceAvailable: boolean
  installable: boolean
  license: LicenseInfo
  lastTestedAt: string
  stale?: boolean
  disputed?: string
  retracted?: { at: string; reason: string }
  supersedesId?: string
  supersededById?: string
  caveats?: string[]
  ineligibleReasons?: string[]
}

// One fictional cohort exercising every difficult evidence state. IonFlux is
// fastest verified but has no source or license; Meridian is fastest
// deployable; Meridian and Quartzite tie statistically.
const RUNS: FxRun[] = [
  {
    id: "run-fx-0001",
    status: "passed",
    evidence: "verified",
    impl: {
      name: "ionflux-rmsnorm",
      slug: "ionflux-rmsnorm",
      revision: "3f9c2ad",
    },
    project: { name: "IonFlux (fictional)", slug: "ionflux" },
    workloadId: "wl-2048",
    latencyNs: 7810,
    ci: [7788, 7841],
    samples: 200,
    rank: 1,
    match: "exact",
    sourceAvailable: false,
    installable: false,
    license: UNKNOWN_LICENSE,
    lastTestedAt: FRESH,
    caveats: ["No public source", "License unknown"],
  },
  {
    id: "run-fx-0002",
    status: "passed",
    evidence: "verified",
    impl: {
      name: "meridian-rmsnorm",
      slug: "meridian-rmsnorm",
      revision: "b81d40e",
    },
    project: { name: "Meridian Kernels (fictional)", slug: "meridian-kernels" },
    workloadId: "wl-2048",
    latencyNs: 8120,
    ci: [8095, 8151],
    samples: 200,
    rank: 2,
    match: "exact",
    sourceAvailable: true,
    installable: true,
    license: APACHE,
    lastTestedAt: FRESH,
  },
  {
    id: "run-fx-0003",
    status: "passed",
    evidence: "reproducible",
    impl: {
      name: "quartzite-rmsnorm-triton",
      slug: "quartzite-rmsnorm-triton",
      revision: "v0.4.2",
    },
    project: {
      name: "Quartzite Research (fictional)",
      slug: "quartzite-research",
    },
    workloadId: "wl-2048",
    latencyNs: 8138,
    ci: [8092, 8177],
    samples: 200,
    rank: 2,
    tied: true,
    match: "exact",
    sourceAvailable: true,
    installable: true,
    license: { declared: "MIT", concluded: "MIT" },
    lastTestedAt: FRESH,
    caveats: ["Statistically tied with meridian-rmsnorm under policy v1"],
  },
  {
    id: "run-fx-0004",
    status: "passed",
    evidence: "reported",
    impl: {
      name: "quartzite-rmsnorm-cutlass",
      slug: "quartzite-rmsnorm-cutlass",
      revision: "v0.4.0",
    },
    project: {
      name: "Quartzite Research (fictional)",
      slug: "quartzite-research",
    },
    workloadId: "wl-2048",
    latencyNs: 6900,
    ci: null,
    samples: null,
    rank: null,
    match: "exact",
    sourceAvailable: true,
    installable: false,
    license: { declared: "MIT", concluded: null },
    lastTestedAt: FRESH,
    caveats: [
      "Reported by source; not independently reproduced",
      "No raw samples",
    ],
    ineligibleReasons: ["MISSING_RAW_SAMPLES"],
  },
  {
    id: "run-fx-0005",
    status: "passed",
    evidence: "verified",
    impl: {
      name: "meridian-rmsnorm",
      slug: "meridian-rmsnorm",
      revision: "b81d40e",
    },
    project: { name: "Meridian Kernels (fictional)", slug: "meridian-kernels" },
    workloadId: "wl-1024",
    latencyNs: 4090,
    ci: [4072, 4111],
    samples: 200,
    rank: null,
    match: "compatible",
    mismatches: [{ field: "axes.tokens", requested: "2048", observed: "1024" }],
    sourceAvailable: true,
    installable: true,
    license: APACHE,
    lastTestedAt: FRESH,
  },
  {
    id: "run-fx-0006",
    status: "passed",
    evidence: "reproducible",
    impl: {
      name: "atlas-rmsnorm-legacy",
      slug: "atlas-rmsnorm-legacy",
      revision: "1c07799",
    },
    project: { name: "Atlas Primitives (fictional)", slug: "atlas-primitives" },
    workloadId: "wl-2048",
    latencyNs: 9480,
    ci: [9433, 9542],
    samples: 120,
    rank: 4,
    match: "exact",
    sourceAvailable: true,
    installable: true,
    license: { declared: "BSD-3-Clause", concluded: "BSD-3-Clause" },
    lastTestedAt: STALE,
    stale: true,
    caveats: ["Not retested in the last 90 days"],
  },
  {
    id: "run-fx-0007",
    status: "passed",
    evidence: "verified",
    impl: {
      name: "ionflux-rmsnorm",
      slug: "ionflux-rmsnorm",
      revision: "2aa10b4",
    },
    workloadId: "wl-2048",
    project: { name: "IonFlux (fictional)", slug: "ionflux" },
    latencyNs: 7799,
    ci: [7761, 7830],
    samples: 200,
    rank: null,
    match: "exact",
    sourceAvailable: false,
    installable: false,
    license: UNKNOWN_LICENSE,
    lastTestedAt: STALE,
    disputed:
      "Reviewer dispute: environment clock policy may differ from the declared protocol",
    ineligibleReasons: ["BLOCKING_DISPUTE"],
  },
  {
    id: "run-fx-0008",
    status: "passed",
    evidence: "reproducible",
    impl: {
      name: "meridian-rmsnorm",
      slug: "meridian-rmsnorm",
      revision: "77aa0e1",
    },
    project: { name: "Meridian Kernels (fictional)", slug: "meridian-kernels" },
    workloadId: "wl-2048",
    latencyNs: 8410,
    ci: [8380, 8446],
    samples: 200,
    rank: null,
    match: "exact",
    sourceAvailable: true,
    installable: true,
    license: APACHE,
    lastTestedAt: STALE,
    supersededById: "run-fx-0009",
    ineligibleReasons: ["SUPERSEDED"],
  },
  {
    id: "run-fx-0009",
    status: "passed",
    evidence: "reproducible",
    impl: {
      name: "meridian-rmsnorm",
      slug: "meridian-rmsnorm",
      revision: "77aa0e1",
    },
    project: { name: "Meridian Kernels (fictional)", slug: "meridian-kernels" },
    workloadId: "wl-2048",
    latencyNs: 8395,
    ci: [8361, 8433],
    samples: 400,
    rank: 3,
    match: "exact",
    sourceAvailable: true,
    installable: true,
    license: APACHE,
    lastTestedAt: FRESH,
    supersedesId: "run-fx-0008",
    caveats: ["Supersedes run-fx-0008 (corrected sample count)"],
  },
  {
    id: "run-fx-0010",
    status: "revoked",
    evidence: "reported",
    impl: {
      name: "atlas-rmsnorm-legacy",
      slug: "atlas-rmsnorm-legacy",
      revision: "9d0f112",
    },
    project: { name: "Atlas Primitives (fictional)", slug: "atlas-primitives" },
    workloadId: "wl-2048",
    latencyNs: 5100,
    ci: null,
    samples: null,
    rank: null,
    match: "exact",
    sourceAvailable: true,
    installable: false,
    license: { declared: "BSD-3-Clause", concluded: "BSD-3-Clause" },
    lastTestedAt: STALE,
    retracted: {
      at: "2026-07-02T10:00:00Z",
      reason:
        "Upstream acknowledged the timing excluded required synchronization",
    },
    ineligibleReasons: ["RETRACTED"],
  },
]

function rowFromRun(r: FxRun): ResultRow {
  return {
    runId: r.id,
    implementation: { name: r.impl.name, slug: r.impl.slug },
    install: r.installable
      ? { kind: "pip", command: `pip install ${r.project.slug}` }
      : null,
    project: r.project,
    revision: r.impl.revision,
    operation: { name: "RMSNorm, hidden 4096", slug: "rmsnorm-h4096" },
    workloadSummary: WORKLOADS[r.workloadId].summary,
    hardware: B200,
    framework: "pytorch",
    language: r.impl.slug.includes("triton") ? "triton" : "cuda",
    primary: {
      metric: "latency",
      unit: "ns",
      statistic: "median",
      value: r.latencyNs,
      sampleCount: r.samples,
      uncertainty: r.ci ? { low: r.ci[0], high: r.ci[1] } : null,
    },
    evidence: r.evidence,
    match: r.match,
    mismatches: r.mismatches ?? [],
    rank: r.rank,
    tiedWithPrevious: r.tied ?? false,
    sourceAvailable: r.sourceAvailable,
    installable: r.installable,
    license: r.license,
    lastTestedAt: r.lastTestedAt,
    stale: r.stale ?? false,
    disputed: r.disputed !== undefined,
    caveats: r.caveats ?? [],
  }
}

// A declared-support implementation with no measurement, and a row with
// deliberately long values, for the supported-unmeasured and overflow states.
const SUPPORTED_UNMEASURED: ResultRow = {
  runId: null,
  implementation: {
    name: "atlas-fused-residual-rmsnorm-vectorized-bf16-persistent-warp-specialized",
    slug: "atlas-fused-residual-rmsnorm",
  },
  install: { kind: "pip", command: "pip install atlas-primitives" },
  project: { name: "Atlas Primitives (fictional)", slug: "atlas-primitives" },
  revision: "v2.1.0",
  operation: { name: "RMSNorm, hidden 4096", slug: "rmsnorm-h4096" },
  workloadSummary: WORKLOADS["wl-2048"].summary,
  hardware: B200,
  framework: null,
  language: "cuda",
  primary: null,
  evidence: null,
  match: "supported_unobserved",
  mismatches: [],
  rank: null,
  tiedWithPrevious: false,
  sourceAvailable: true,
  installable: true,
  license: APACHE,
  lastTestedAt: null,
  stale: false,
  disputed: false,
  caveats: ["Declared support only; no measurement for this exact workload"],
}

const RANKED = RUNS.filter((r) => r.workloadId === "wl-2048" && r.rank !== null)

export async function getHomePage(): Promise<HomePageModel> {
  const latest = [...RANKED]
    .sort((a, b) => b.lastTestedAt.localeCompare(a.lastTestedAt))
    .map(rowFromRun)
  return { illustrative: ILLUSTRATIVE, latest }
}

/** Metric helper for handcrafted record histories. */
function latencyMetric(
  value: number,
  samples: number | null,
  ci: [number, number] | null,
): PrimaryMetric {
  return {
    metric: "latency",
    unit: "ns",
    statistic: "median",
    value,
    sampleCount: samples,
    uncertainty: ci ? { low: ci[0], high: ci[1] } : null,
  }
}

// Record histories are handcrafted to exercise multi-event and first-record
// states; event dates are fictional like everything else in this file.
export async function getRecordsPage(): Promise<RecordsPageModel> {
  const byId = new Map(RUNS.map((r) => [r.id, r]))
  const run = (id: string) => byId.get(id) as FxRun
  const holder2048: RecordHolder = {
    cohortKey: COHORT_2048.comparisonKey,
    operation: { name: "RMSNorm, hidden 4096", slug: "rmsnorm-h4096" },
    workloadSummary: WORKLOADS["wl-2048"].summary,
    hardware: B200.model,
    environmentSummary: "CUDA 13.1 · PyTorch 2.9.0 · ki-fixed-clock v1",
    current: rowFromRun(run("run-fx-0001")),
    since: FRESH,
    history: [
      {
        at: FRESH,
        runId: "run-fx-0001",
        implementation: { name: "ionflux-rmsnorm", slug: "ionflux-rmsnorm" },
        value: latencyMetric(7810, 200, [7788, 7841]),
        previousValue: latencyMetric(8120, 200, [8095, 8151]),
        improvementPct: 3.8,
      },
      {
        at: "2026-07-02T12:00:00Z",
        runId: "run-fx-0002",
        implementation: { name: "meridian-rmsnorm", slug: "meridian-rmsnorm" },
        value: latencyMetric(8120, 200, [8095, 8151]),
        previousValue: latencyMetric(8410, 200, [8380, 8446]),
        improvementPct: 3.4,
      },
      {
        at: "2026-05-02T12:00:00Z",
        runId: "run-fx-0009",
        implementation: { name: "meridian-rmsnorm", slug: "meridian-rmsnorm" },
        value: latencyMetric(8410, 200, [8380, 8446]),
        previousValue: null,
        improvementPct: null,
      },
    ],
  }
  const holder1024: RecordHolder = {
    cohortKey: digest("cohort:rmsnorm-h4096:tokens-1024"),
    operation: { name: "RMSNorm, hidden 4096", slug: "rmsnorm-h4096" },
    workloadSummary: WORKLOADS["wl-1024"].summary,
    hardware: B200.model,
    environmentSummary: "CUDA 13.1 · PyTorch 2.9.0 · ki-fixed-clock v1",
    current: rowFromRun(run("run-fx-0005")),
    since: FRESH,
    history: [
      {
        at: FRESH,
        runId: "run-fx-0005",
        implementation: { name: "meridian-rmsnorm", slug: "meridian-rmsnorm" },
        value: latencyMetric(4090, 200, [4072, 4111]),
        previousValue: null,
        improvementPct: null,
      },
    ],
  }
  return {
    illustrative: ILLUSTRATIVE,
    hardwareOptions: [B200.model],
    records: [holder2048, holder1024],
  }
}

const FIXTURE_SOURCE_REF = {
  name: "Illustrative fixture source",
  kind: "fixture",
  url: null,
  externalId: null,
  observedAt: FRESH,
}

/** The corpus index behind suggestions and browse (two fixture operations). */
export async function getOperationIndex(): Promise<OperationIndexEntry[]> {
  return [
    {
      name: "RMSNorm, hidden 4096",
      slug: "rmsnorm-h4096",
      family: "rmsnorm",
      runs: 8,
      lastObservedAt: FRESH,
    },
    {
      name: "Fused residual + RMSNorm",
      slug: "fused-residual-rmsnorm",
      family: "fused-residual-rmsnorm",
      runs: 0,
      lastObservedAt: null,
    },
  ]
}

export async function searchCatalog(
  input: SearchInput,
): Promise<SearchPageModel> {
  const query = input.query.trim()
  // Deterministic error trigger for the design lab's error state.
  if (query === "__error__")
    throw new Error("Illustrative search failure (fixtures)")

  // Fixtures interpret queries through the same parser as PostgreSQL mode,
  // so tokens, parse errors, and the interpreted request behave identically.
  const intent = parseQuery(query)
  const shared = {
    facets: intent.facets.map((facet) => ({
      token: facet.token,
      display: facet.display,
      removeQuery: removeToken(query, facet.token),
    })),
    queryIssues: intent.issues,
    policy: {
      minimumTrust: intent.minimumTrust,
      license: intent.license,
      requireSource: intent.requireSource,
      requireInstallable: intent.requireInstallable,
    },
  }

  const matched = /rms[\s_-]?norm/i.test(query)
  if (!matched) {
    const empty = query === ""
    return {
      illustrative: ILLUSTRATIVE,
      query,
      interpretedQuery: empty
        ? "Search the index"
        : describeIntent(intent, null),
      ...shared,
      operation: null,
      browse: empty
        ? [
            { family: "rmsnorm", operations: 2, runs: 8 },
            { family: "fused-residual-rmsnorm", operations: 1, runs: 0 },
          ]
        : null,
      cohort: null,
      groups: {
        exact: [],
        compatible: [],
        supportedUnmeasured: [],
        reported: [],
      },
      related: [],
      sources: [],
      noResult: empty
        ? null
        : {
            guidance:
              "No comparable public evidence found. Search by operation, shape, dtype, hardware, and framework.",
            suggestions: [
              "rmsnorm B200 bf16 [2048,4096]",
              "rmsnorm bf16 pytorch",
            ],
          },
    }
  }

  return {
    illustrative: ILLUSTRATIVE,
    query,
    interpretedQuery: describeIntent(intent, "RMSNorm, hidden 4096"),
    ...shared,
    operation: { name: "RMSNorm, hidden 4096", slug: "rmsnorm-h4096" },
    browse: null,
    cohort: COHORT_2048,
    groups: {
      exact: RANKED.map(rowFromRun),
      compatible: RUNS.filter((r) => r.match === "compatible").map(rowFromRun),
      supportedUnmeasured: [SUPPORTED_UNMEASURED],
      reported: RUNS.filter(
        (r) => r.evidence === "reported" && !r.retracted,
      ).map(rowFromRun),
    },
    related: [
      {
        kind: "operation",
        name: "Fused residual + RMSNorm",
        slug: "fused-residual-rmsnorm",
        summary: "Residual addition fused with RMSNorm (illustrative)",
      },
      {
        kind: "project",
        name: "Meridian Kernels (fictional)",
        slug: "meridian-kernels",
        summary: "Illustrative Triton kernel collection",
      },
    ],
    sources: [FIXTURE_SOURCE_REF],
    noResult: null,
  }
}

export async function getOperationPage(
  slug: string,
  options?: { workload?: string },
): Promise<OperationPageModel | null> {
  if (slug !== "rmsnorm-h4096") return null
  const selected: WorkloadId =
    options?.workload === "wl-1024" ? "wl-1024" : "wl-2048"
  const records =
    selected === "wl-2048"
      ? RANKED.map(rowFromRun)
      : RUNS.filter((r) => r.workloadId === "wl-1024").map(rowFromRun)
  return {
    illustrative: ILLUSTRATIVE,
    operation: {
      id: "op-fx-rmsnorm-h4096",
      slug: "rmsnorm-h4096",
      name: "RMSNorm, hidden 4096",
      family: "rmsnorm",
      aliases: ["rms_norm", "RMSLayerNorm"],
      models: ["llama-3.1-8b"],
      semanticDigest: digest("operation:rmsnorm-h4096"),
      summary:
        "Root-mean-square normalization over the last axis with a learned scale, bf16 in and out with fp32 accumulation.",
      supersededById: null,
    },
    semantics: {
      inputs: [
        {
          name: "input",
          dtype: "bf16",
          shape: "[tokens, hidden]",
          layout: "row_major",
        },
        {
          name: "weight",
          dtype: "bf16",
          shape: "[hidden]",
          layout: "contiguous",
        },
        { name: "epsilon", dtype: "fp32", shape: "scalar", layout: null },
      ],
      outputs: [
        {
          name: "output",
          dtype: "bf16",
          shape: "[tokens, hidden]",
          layout: "row_major",
        },
      ],
      axes: [
        {
          name: "tokens",
          role: "variable",
          value: null,
          constraint: "tokens >= 1",
        },
        { name: "hidden", role: "constant", value: 4096, constraint: null },
      ],
      expression:
        "output = cast_bf16(input * rsqrt(mean(cast_fp32(input)^2, axis=-1) + epsilon) * weight)",
      determinism: "deterministic",
      constraints: ["No mutation or aliasing", "fp32 accumulator"],
    },
    workloads: Object.values(WORKLOADS).map((w) => ({
      id: w.id,
      digest: w.digest,
      label: w.label,
      axes: { ...w.axes },
      toleranceSummary: w.toleranceSummary,
    })),
    selectedWorkloadId: selected,
    cohort: selected === "wl-2048" ? COHORT_2048 : null,
    records,
    implementations: [
      {
        slug: "meridian-rmsnorm",
        name: "meridian-rmsnorm",
        project: {
          name: "Meridian Kernels (fictional)",
          slug: "meridian-kernels",
        },
        language: "triton",
        framework: "pytorch",
        evidence: "verified",
        bestPrimary: rowFromRun(RUNS[1]).primary,
        sourceAvailable: true,
        installable: true,
        license: APACHE,
      },
      {
        slug: "ionflux-rmsnorm",
        name: "ionflux-rmsnorm",
        project: { name: "IonFlux (fictional)", slug: "ionflux" },
        language: "cuda",
        framework: "pytorch",
        evidence: "verified",
        bestPrimary: rowFromRun(RUNS[0]).primary,
        sourceAvailable: false,
        installable: false,
        license: UNKNOWN_LICENSE,
      },
      {
        slug: "atlas-fused-residual-rmsnorm",
        name: "atlas-fused-residual-rmsnorm-vectorized-bf16-persistent-warp-specialized",
        project: {
          name: "Atlas Primitives (fictional)",
          slug: "atlas-primitives",
        },
        language: "cuda",
        framework: null,
        evidence: null,
        bestPrimary: null,
        sourceAvailable: true,
        installable: true,
        license: APACHE,
      },
    ],
    coverage: {
      verified: 3,
      reproducible: 3,
      reported: 2,
      lastObservedAt: FRESH,
    },
    sources: [
      {
        name: "Illustrative fixture source",
        kind: "fixture",
        url: null,
        externalId: null,
        observedAt: FRESH,
      },
    ],
  }
}

const IMPLEMENTATIONS: Record<string, ImplementationPageModel> = {
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
    bestResults: [rowFromRun(RUNS[1]), rowFromRun(RUNS[4])],
    limitations: ["hidden dimension fixed at 4096", "bf16 only"],
    provenance: {
      source: {
        name: "Illustrative fixture source",
        kind: "fixture",
        url: null,
        externalId: null,
        observedAt: FRESH,
      },
      authors: ["fictional-author"],
      importedAt: FRESH,
    },
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
    bestResults: [rowFromRun(RUNS[0])],
    limitations: ["No public source", "License unknown", "No install recipe"],
    provenance: {
      source: {
        name: "Illustrative fixture source",
        kind: "fixture",
        url: null,
        externalId: null,
        observedAt: FRESH,
      },
      authors: [],
      importedAt: FRESH,
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
        externalId: r.id,
        observedAt: r.lastTestedAt,
      },
      externalId: r.id,
      parserVersion: null,
      snapshotDigest: null,
    },
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
        "Select two to eight runs to compare. Every result row and run dossier links here.",
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
