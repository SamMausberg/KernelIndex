// Deterministic illustrative fixture data shared by the fixture read modules
// (§27.5): the fictional run corpus, workloads, cohort, and the ResultRow
// projection. Everything here is fictional and must never be presented as
// real benchmark evidence.
import type {
  Attestation,
  EvidenceLevel,
  LicenseInfo,
  MatchQuality,
  Mismatch,
  PrimaryMetric,
  ResultRow,
  RunStatus,
} from "@/lib/catalog-models"

export const ILLUSTRATIVE = true
export const FRESH = "2026-08-10T09:30:00Z"
export const STALE = "2025-11-20T14:00:00Z"
export const B200 = { model: "NVIDIA B200 SXM", architecture: "sm_100" }

// Deterministic fake digest: clearly synthetic, stable across runs.
export function digest(seed: string): string {
  let h = 0x811c9dc5
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0
  return `sha256:${h.toString(16).padStart(8, "0").repeat(8)}`
}

export const COHORT_2048 = {
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

export const WORKLOADS = {
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
  "wl-4096": {
    id: "wl-4096",
    digest: digest("workload:rmsnorm-h4096:tokens-4096"),
    label: "tokens = 4096 · bf16 · [4096, 4096]",
    axes: { tokens: 4096, hidden: 4096 },
    summary: "bf16 · [4096, 4096] · row-major",
    toleranceSummary: "abs ≤ 1e-2, rel ≤ 1e-2, matched ≥ 99%",
  },
} as const

export type WorkloadId = keyof typeof WORKLOADS

export const APACHE: LicenseInfo = {
  declared: "Apache-2.0",
  concluded: "Apache-2.0",
}
export const UNKNOWN_LICENSE: LicenseInfo = { declared: null, concluded: null }

export type FxRun = {
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
  /** Raw source-published metrics surfaced on the run dossier. */
  sourceNative?: Record<string, number>
}

// One fictional cohort exercising every difficult evidence state. IonFlux is
// fastest verified but has no source or license; Meridian is fastest
// deployable; Meridian and Quartzite tie statistically.
export const RUNS: FxRun[] = [
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
    sourceNative: {
      sol_score: 0.6161,
      avg_speedup: 1.6638,
      fast_1_count: 16,
      fast_1_total: 16,
    },
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
  // The tokens=4096 points that complete the sweep traces (§16.8): meridian
  // spans 1024/2048/4096, ionflux 2048/4096.
  {
    id: "run-fx-0011",
    status: "passed",
    evidence: "verified",
    impl: {
      name: "meridian-rmsnorm",
      slug: "meridian-rmsnorm",
      revision: "b81d40e",
    },
    project: { name: "Meridian Kernels (fictional)", slug: "meridian-kernels" },
    workloadId: "wl-4096",
    latencyNs: 16350,
    ci: [16290, 16412],
    samples: 200,
    rank: null,
    match: "exact",
    sourceAvailable: true,
    installable: true,
    license: APACHE,
    lastTestedAt: FRESH,
  },
  {
    id: "run-fx-0012",
    status: "passed",
    evidence: "verified",
    impl: {
      name: "ionflux-rmsnorm",
      slug: "ionflux-rmsnorm",
      revision: "3f9c2ad",
    },
    project: { name: "IonFlux (fictional)", slug: "ionflux" },
    workloadId: "wl-4096",
    latencyNs: 15660,
    ci: [15602, 15731],
    samples: 200,
    rank: null,
    match: "exact",
    sourceAvailable: false,
    installable: false,
    license: UNKNOWN_LICENSE,
    lastTestedAt: FRESH,
    caveats: ["No public source", "License unknown"],
  },
]

export function rowFromRun(r: FxRun): ResultRow {
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
    solScore: null,
    baseline: false,
    evidence: r.evidence,
    match: r.match,
    mismatches: r.mismatches ?? [],
    rank: r.rank,
    tiedWithPrevious: r.tied ?? false,
    cohortSize: r.rank === null ? null : RANKED.length,
    sourceAvailable: r.sourceAvailable,
    installable: r.installable,
    license: r.license,
    lastTestedAt: r.lastTestedAt,
    indexedAt: r.lastTestedAt,
    stale: r.stale ?? false,
    disputed: r.disputed !== undefined,
    caveats: r.caveats ?? [],
    attestations: r.id === "run-fx-0002" ? FIXTURE_ATTESTATIONS.length : 0,
  }
}

/** Two community notes on the fastest deployable run (§16.10). */
export const FIXTURE_ATTESTATIONS: Attestation[] = [
  {
    id: "att-fx-0001",
    type: "reproduced",
    body: "Rebuilt at b81d40e and ran the fixed-clock protocol: 8.14 µs median over 200 samples, inside the published interval.",
    evidenceUrl: "https://example.invalid/runs/meridian-b200.log",
    observedNs: 8140,
    environmentSummary: "B200 SXM · CUDA 13.1 · torch 2.9",
    author: "reproducer (fictional)",
    at: "2026-08-18T09:00:00Z",
  },
  {
    id: "att-fx-0002",
    type: "environment_note",
    body: "Persistence mode off adds roughly 4% on this GPU; the published environment had it on.",
    evidenceUrl: null,
    observedNs: null,
    environmentSummary: null,
    author: "another reader (fictional)",
    at: "2026-08-19T14:30:00Z",
  },
]

// A declared-support implementation with no measurement, and a row with
// deliberately long values, for the supported-unmeasured and overflow states.
export const SUPPORTED_UNMEASURED: ResultRow = {
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
  solScore: null,
  baseline: false,
  evidence: null,
  match: "supported_unobserved",
  mismatches: [],
  rank: null,
  tiedWithPrevious: false,
  cohortSize: null,
  sourceAvailable: true,
  installable: true,
  license: APACHE,
  lastTestedAt: null,
  indexedAt: null,
  stale: false,
  disputed: false,
  caveats: ["Declared support only; no measurement for this exact workload"],
  attestations: 0,
}

export const RANKED = RUNS.filter(
  (r) => r.workloadId === "wl-2048" && r.rank !== null,
)

/** The one fixture environment cohort, stating its #1 (the B200 cohort). */
export const COHORT_OPTIONS_2048 = [
  {
    key: COHORT_2048.comparisonKey,
    label: B200.model,
    runs: RANKED.length,
    head: {
      runId: RANKED[0].id,
      implementation: { name: RANKED[0].impl.name, slug: RANKED[0].impl.slug },
      primary: rowFromRun(RANKED[0]).primary as PrimaryMetric,
    },
  },
]
export const FIXTURE_SOURCE_REF = {
  name: "Illustrative fixture source",
  kind: "fixture",
  url: null,
  license: null,
  externalId: null,
  observedAt: FRESH,
}
