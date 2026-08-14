// Page-oriented read models returned by the four catalog read functions
// (see lib/catalog.ts). Fixture and PostgreSQL backends implement these same
// shapes, so pages never know which backend produced a model.
//
// Derived from ENGINEERING_DESIGN.md §16.6–16.10 and §27.5. Field additions
// are expected while the site is being designed; removals are breaking.

/** Derived trust badge (§8.14). Submitters never choose this. */
export type EvidenceLevel =
  | "verified"
  | "replicated"
  | "reproducible"
  | "reported"

/** How a result relates to the interpreted request (§12.5). */
export type MatchQuality =
  | "exact"
  | "compatible"
  | "supported_unobserved"
  | "related"

/** Comparison profile of a cohort (§11.2). */
export type ComparisonProfile =
  | "source_native"
  | "strict_exact"
  | "controlled_equivalent"
  | "compatible_workload"
  | "reported"

/** Benchmark run status vocabulary (§8.11). */
export type RunStatus =
  | "passed"
  | "incorrect_shape"
  | "incorrect_dtype"
  | "incorrect_numerical"
  | "compile_error"
  | "runtime_error"
  | "timeout"
  | "resource_exceeded"
  | "invalid_reference"
  | "policy_violation"
  | "suspected_reward_hack"
  | "incomplete_evidence"
  | "revoked"

/** Declared vs concluded SPDX expressions; a null conclusion means unknown. */
export type LicenseInfo = {
  declared: string | null
  concluded: string | null
}

/**
 * Primary measurement of a run in its canonical base unit (§8.12), e.g.
 * latency in integer nanoseconds. `uncertainty` is the declared confidence
 * interval in the same unit when the protocol provides one.
 */
export type PrimaryMetric = {
  metric: string
  unit: string
  statistic: string
  value: number
  sampleCount: number | null
  uncertainty: { low: number; high: number } | null
}

/** One enumerated difference between the request and an observed result. */
export type Mismatch = {
  field: string
  requested: string
  observed: string
}

export type KeyValue = { key: string; value: string }

export type SourceRef = {
  name: string
  kind: string
  url: string | null
  externalId: string | null
  observedAt: string | null
}

/** Dense result row (§16.7) used by search groups and record tables. */
export type ResultRow = {
  /** Null for supported-but-unmeasured implementations. */
  runId: string | null
  implementation: { name: string; slug: string }
  project: { name: string; slug: string }
  /** Short display revision: commit prefix or release version. */
  revision: string | null
  operation: { name: string; slug: string }
  /** e.g. "bf16 · [2048, 4096] · row-major" */
  workloadSummary: string
  hardware: { model: string; architecture: string | null }
  framework: string | null
  language: string | null
  primary: PrimaryMetric | null
  evidence: EvidenceLevel | null
  match: MatchQuality
  /** Non-empty only for compatible matches. */
  mismatches: Mismatch[]
  /** Shared on statistical ties; null when the row is unranked. */
  rank: number | null
  tiedWithPrevious: boolean
  sourceAvailable: boolean
  installable: boolean
  license: LicenseInfo
  lastTestedAt: string | null
  stale: boolean
  disputed: boolean
  caveats: string[]
}

export type RelatedItem = {
  kind: "operation" | "project"
  name: string
  slug: string
  summary: string
}

export type CohortContext = {
  comparisonKey: string
  profile: ComparisonProfile
  description: string
}

export type SearchInput = { query: string }

/** §16.6: result groups are semantically separate and never interleaved. */
export type SearchPageModel = {
  illustrative: boolean
  query: string
  /** Plain-language interpretation shown above results. */
  interpretedQuery: string
  cohort: CohortContext | null
  groups: {
    exact: ResultRow[]
    compatible: ResultRow[]
    supportedUnmeasured: ResultRow[]
    reported: ResultRow[]
  }
  related: RelatedItem[]
  noResult: { guidance: string; suggestions: string[] } | null
}

export type AxisSpec = {
  name: string
  role: "variable" | "constant"
  value: number | null
  constraint: string | null
}

export type TensorBinding = {
  name: string
  dtype: string
  /** Display shape, e.g. "[tokens, hidden]" or "[2048, 4096]". */
  shape: string
  layout: string | null
}

export type WorkloadOption = {
  id: string
  digest: string
  /** e.g. "tokens = 2048 · bf16" */
  label: string
  axes: Record<string, number | string>
  toleranceSummary: string
}

export type ImplementationSummary = {
  slug: string
  name: string
  project: { name: string; slug: string }
  language: string | null
  framework: string | null
  evidence: EvidenceLevel | null
  bestPrimary: PrimaryMetric | null
  sourceAvailable: boolean
  installable: boolean
  license: LicenseInfo
}

/** §16.8: operation page as one scrollable document. */
export type OperationPageModel = {
  illustrative: boolean
  operation: {
    id: string
    slug: string
    name: string
    family: string
    aliases: string[]
    semanticDigest: string
    summary: string
    supersededById: string | null
  }
  semantics: {
    inputs: TensorBinding[]
    outputs: TensorBinding[]
    axes: AxisSpec[]
    expression: string | null
    determinism: string
    constraints: string[]
  }
  workloads: WorkloadOption[]
  selectedWorkloadId: string | null
  cohort: CohortContext | null
  /** Current records for the selected workload. */
  records: ResultRow[]
  implementations: ImplementationSummary[]
  coverage: {
    verified: number
    reproducible: number
    reported: number
    lastObservedAt: string | null
  }
  sources: SourceRef[]
}

/** §16.9: the first question is "Can I use this?". */
export type ImplementationPageModel = {
  illustrative: boolean
  implementation: {
    id: string
    slug: string
    name: string
    digest: string
    revision: string | null
    supersededById: string | null
  }
  project: { name: string; slug: string; repositoryUrl: string | null }
  usage: {
    /** Null renders as an explicit "no verified install recipe". */
    install: { kind: string; command: string } | null
    invocationExample: string | null
    requirements: { name: string; constraint: string }[]
  }
  interface: {
    language: string
    framework: string | null
    symbol: string | null
    sourcePath: string | null
  }
  support: {
    hardware: string[]
    architectures: string[]
    dtypes: string[]
    layouts: string[]
    axes: string[]
  }
  source: {
    available: boolean
    url: string | null
    commit: string | null
    treeDigest: string | null
  }
  license: LicenseInfo & { evidencePath: string | null }
  trust: { evidence: EvidenceLevel | null; summary: string }
  bestResults: ResultRow[]
  limitations: string[]
  provenance: {
    source: SourceRef | null
    authors: string[]
    importedAt: string | null
  }
}

/** §16.10: the run page is a permanent evidence dossier. */
export type RunPageModel = {
  illustrative: boolean
  run: {
    id: string
    digest: string
    status: RunStatus
    observedAt: string
    publishedAt: string | null
  }
  evidence: EvidenceLevel
  lifecycle: {
    supersedesId: string | null
    supersededById: string | null
    retracted: { at: string; reason: string } | null
    disputed: { reason: string } | null
    stale: boolean
  }
  primary: PrimaryMetric
  cohort: {
    comparisonKey: string
    profile: ComparisonProfile
    rank: number | null
    eligible: boolean
    ineligibleReasons: string[]
  }
  implementation: { name: string; slug: string; revision: string | null }
  project: { name: string; slug: string }
  operation: { name: string; slug: string }
  workload: {
    id: string
    digest: string
    label: string
    axes: Record<string, number | string>
    tensors: KeyValue[]
    tolerance: KeyValue[]
  }
  correctness: {
    comparator: string
    maxAbsoluteError: number | null
    maxRelativeError: number | null
    matchedRatio: number | null
    passed: boolean
  } | null
  measurements: {
    metric: string
    statistic: string
    value: number
    unit: string
    sampleCount: number | null
  }[]
  protocol: KeyValue[]
  environment: KeyValue[]
  artifacts: {
    role: string
    digest: string
    mediaType: string
    sizeBytes: number | null
    uri: string | null
    availability: "public" | "upstream" | "unavailable"
  }[]
  provenance: {
    source: SourceRef
    externalId: string | null
    parserVersion: string | null
    snapshotDigest: string | null
  }
  /** Canonical run manifest for the manifest section. */
  manifest: unknown
}
