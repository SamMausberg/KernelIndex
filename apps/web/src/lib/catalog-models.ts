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
  /** Upstream data license name; rendered beside the attribution link. */
  license: string | null
  externalId: string | null
  observedAt: string | null
}

/** Dense result row (§16.7) used by search groups and record tables. */
export type ResultRow = {
  /** Null for supported-but-unmeasured implementations. */
  runId: string | null
  implementation: { name: string; slug: string }
  /** Verified install command; null renders as "no verified install recipe". */
  install: { kind: string; command: string } | null
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
  /** Facts invariant across every row in the cohort (§16.6), shown once. */
  facts: KeyValue[]
}

export type SearchInput = { query: string }

/**
 * One operation in the compact corpus index that powers search suggestions
 * and the browse start state. Served by the CDN-cached /suggest route and
 * fetched once per session; the browse start state still receives it inside
 * the search model.
 */
/** Per-query evidence summary on a chooser row (§16.6): how many eligible
 * runs match the request's environment/dtype facets, the best of them, and
 * how many carry source — so choosing an operation never means clicking in
 * to find nothing. */
export type ChooserMatch = {
  matching: number
  withSource: number
  best: { value: number; unit: string } | null
  /** "B200 · bf16" — exactly the facts the counts were filtered by. */
  facetLabel: string
}

export type OperationIndexEntry = {
  name: string
  slug: string
  family: string
  /** Lowercased source and curated aliases, matchable by the suggest input. */
  aliases: string[]
  runs: number
  /** Newest published run's observation date; null when unmeasured. */
  lastObservedAt: string | null
  /** Present only on multi-match chooser rows for a faceted query. */
  match?: ChooserMatch | null
}

/** §16.5: homepage read — the most recent published records, newest first. */
export type HomePageModel = {
  illustrative: boolean
  latest: ResultRow[]
  /** Live corpus counts under the eligibility filter — never hardcoded. */
  stats: { operations: number; runs: number; gpus: number }
}

/** One record transition inside a comparison cohort's history. */
export type RecordEvent = {
  at: string
  runId: string
  implementation: { name: string; slug: string }
  value: PrimaryMetric
  /** The record this run beat; null for the cohort's first record. */
  previousValue: PrimaryMetric | null
  improvementPct: number | null
}

/** Current record holder for one comparison cohort (§16.12). */
export type RecordHolder = {
  cohortKey: string
  operation: { name: string; slug: string }
  workloadSummary: string
  hardware: string
  /** Short environment/protocol line, e.g. "CUDA 13.1 · torch 2.9 · sol/v1". */
  environmentSummary: string
  current: ResultRow
  since: string
  /** Newest first; the first entry is the current record. */
  history: RecordEvent[]
}

/**
 * §16.12: the records ledger, derived from append-only runs. A record exists
 * only inside one comparison cohort; there is no global fastest kernel.
 */
export type RecordsPageModel = {
  illustrative: boolean
  hardwareOptions: string[]
  /** Newest record first. */
  records: RecordHolder[]
}

/** One recognized facet rendered as an editable token (§16.6). */
export type SearchFacetToken = {
  token: string
  display: string
  /** The query with this facet removed — tokens stay editable via URL. */
  removeQuery: string
}

/** Policy facets filter rows inside a group; they never alter comparability. */
export type SearchPolicy = {
  minimumTrust: EvidenceLevel | null
  license: string | null
  requireSource: boolean
  requireInstallable: boolean
}

/** §16.6: result groups are semantically separate and never interleaved. */
export type SearchPageModel = {
  illustrative: boolean
  query: string
  /** Plain-language interpretation shown above results. */
  interpretedQuery: string
  /** Recognized facets as editable tokens; parse errors beside them. */
  facets: SearchFacetToken[]
  queryIssues: { token: string; message: string }[]
  policy: SearchPolicy
  /** Resolved operation, when the query named exactly one. */
  operation: { name: string; slug: string } | null
  /** Populated only for the empty query: browse the index instead of failing. */
  browse: OperationIndexEntry[] | null
  /**
   * Populated when the query plausibly names several operations and none
   * dominates: the chooser list, in match order. `operation` is null.
   */
  matches: OperationIndexEntry[] | null
  cohort: CohortContext | null
  groups: {
    exact: ResultRow[]
    compatible: ResultRow[]
    supportedUnmeasured: ResultRow[]
    reported: ResultRow[]
  }
  /** Compatible rows dropped by the server-side cap (payload guard). */
  compatibleOverflow: number
  related: RelatedItem[]
  /** Source coverage and freshness for the resolved operation (§22.4). */
  sources: SourceRef[]
  noResult: {
    guidance: string
    /** Clickable rewrites: display label plus the query it submits. */
    suggestions: { label: string; query: string }[]
  } | null
}

/** One aligned comparison field across the selected runs (§16.11). */
export type CompareField = {
  field: string
  /** Cohort-identity fields are material: any difference blocks a winner. */
  material: boolean
  values: (string | null)[]
  differs: boolean
}

export type CompareRun = {
  runId: string
  digest: string
  implementation: { name: string; slug: string }
  project: { name: string; slug: string }
  operation: { name: string; slug: string }
  workloadLabel: string
  hardware: string
  primary: PrimaryMetric | null
  evidence: EvidenceLevel
  status: RunStatus
  comparisonKey: string
  /** Rank within the selection; null when the selection is incomparable. */
  rank: number | null
  tiedWithPrevious: boolean
  eligible: boolean
  ineligibleReasons: string[]
  license: LicenseInfo
  install: { kind: string; command: string } | null
  sourceAvailable: boolean
  observedAt: string
}

/**
 * §16.11: two to eight runs compared field by field. A winner exists only
 * when every selected run shares one comparison cohort and is eligible.
 */
export type ComparePageModel = {
  illustrative: boolean
  runs: CompareRun[]
  comparable: boolean
  profile: ComparisonProfile | null
  comparisonKey: string | null
  fields: CompareField[]
  firstMaterialMismatch: string | null
  /** What would need to match before a valid winner could be declared. */
  explanation: string
  missingIds: string[]
  policyVersion: string
}

export type AxisSpec = {
  name: string
  role: "variable" | "constant" | "derived"
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
  dtypes: string[]
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
    /** Model slugs whose workloads this operation serves (from model: tags). */
    models: string[]
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
  /** Hardware/environment cohorts measured for the selected workload; the
      records table shows one at a time. */
  cohortOptions: { key: string; label: string; runs: number }[]
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
    /** Null renders as an explicit "no install recipe recorded". */
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
  /** Mirrored kernel source (§8.13), when the revision carries one. */
  sourceCode: {
    fileName: string | null
    /** Highlighting grammar: derived from the artifact media type. */
    language: "python" | "cpp" | "text"
    content: string
    /** KernelIndex's display right and the mandatory attribution line. */
    license: string | null
    attribution: { text: string; url: string | null } | null
    /** Line diff against the same author's previous imported submission. */
    diff: {
      previousSlug: string
      previousName: string
      lines: { kind: "add" | "del" | "ctx"; text: string }[]
    } | null
  } | null
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
  /** Raw source-published metrics (SOL score, speedup, fast-case counts):
   * the source's own numbers, preserved verbatim — never KernelIndex's. */
  sourceNativeMetrics: Record<string, number> | null
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
