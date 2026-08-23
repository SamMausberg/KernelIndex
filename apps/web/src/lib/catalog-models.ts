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
  /** Source-published fraction of the source's speed-of-light estimate
   * (SOL-ExecBench SOL-Score); headline context, never a KernelIndex claim. */
  solScore: number | null
  /** True when the source designates this implementation as its baseline or
   * reference solution rather than a competing entry (§8.14: source claim). */
  baseline: boolean
  evidence: EvidenceLevel | null
  match: MatchQuality
  /** Non-empty only for compatible matches. */
  mismatches: Mismatch[]
  /** Shared on statistical ties; null when the row is unranked. */
  rank: number | null
  tiedWithPrevious: boolean
  /** Rankable entries in the row's comparison cohort ("#3 of 12"); null
   * whenever the row is unranked. */
  cohortSize: number | null
  sourceAvailable: boolean
  installable: boolean
  license: LicenseInfo
  lastTestedAt: string | null
  /** When KernelIndex indexed the run — "latest" surfaces rank by this,
   * while lastTestedAt stays the source's observation time (§16.5). Null
   * only for supported-but-unmeasured rows. */
  indexedAt: string | null
  stale: boolean
  disputed: boolean
  caveats: string[]
  /** Published community attestations on the row's run (§16.10); set by
   * the implementation page, zero elsewhere. Never an evidence input. */
  attestations: number
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

/** `cohort` pins the comparison cohort shown for the resolved operation
 * (URL state, never query text); absent, the largest cohort leads.
 * `choose` forces the full chooser for a multi-match query instead of
 * resolving its most-measured candidate (§12.1). */
export type SearchInput = { query: string; cohort?: string; choose?: boolean }

/** One measured case beside an unmeasured request (§12.5 bracketing). */
export type NearestCase = {
  workloadId: string
  label: string
  /** The case's value on the bracketing axis. */
  value: number
  /** Eligible runs on this case under the request's other facets. */
  runs: number
  /** The fastest of them; null when none carries a primary metric. */
  head: CohortOption["head"]
  /** The head run's cohort, for the operation-page deep link. */
  cohortKey: string | null
  /** The request rewritten to this case: lands on exact resolution. */
  query: string
}

/** One measured environment cohort for the selected workload (§16.8): a
 * selectable option that also states the cohort's best known entry. */
export type CohortOption = {
  key: string
  label: string
  runs: number
  /** The cohort's fastest rankable run; null when nothing there ranks. */
  head: {
    runId: string
    implementation: { name: string; slug: string }
    primary: PrimaryMetric
  } | null
}

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

/** §16.5: homepage read — the newest record breaks and first records with
 * source, contested cohorts first; histories trimmed to the current event. */
export type HomePageModel = {
  illustrative: boolean
  latest: RecordHolder[]
  /** Live corpus counts under the eligibility filter — never hardcoded.
   * servingRuns counts the separate serving corpus; the two never share a
   * headline number. Evidence counts feed the trust block's distribution. */
  stats: {
    operations: number
    runs: number
    gpus: number
    servingRuns: number
    evidence: { verified: number; reproducible: number; reported: number }
  }
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
  /** The cohort's workload, for deep-linking the operation page's island. */
  workloadId: string
  workloadSummary: string
  hardware: string
  /** Short environment/protocol line, e.g. "CUDA 13.1 · torch 2.9 · sol/v1". */
  environmentSummary: string
  current: ResultRow
  /** When the current record was set (source observation time). */
  since: string
  /** When the index published the current record run; the ledger's backend
   * order — a fresh import surfaces even when its source timestamps are old. */
  indexedAt: string
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

// ---------------------------------------------------------------------------
// Feed (§13.11): what the index learned, derived on read from record events,
// publication batches, and the audit trail — never a stored feed.

/** The keys the following filter matches an entry on; rendered nowhere. */
export type FeedMatch = {
  cohort: string | null
  operation: string | null
  projects: string[]
  gpu: string | null
  models: string[]
}

export type FeedEntry = { at: string; match: FeedMatch } & (
  | {
      kind: "record"
      runId: string
      operation: { name: string; slug: string }
      workloadId: string
      workloadSummary: string
      hardware: string
      implementation: { name: string; slug: string }
      project: { name: string; slug: string }
      value: PrimaryMetric
      previous: {
        implementation: { name: string; slug: string }
        value: PrimaryMetric
      }
      improvementPct: number | null
      cohortKey: string
    }
  | {
      kind: "import"
      source: { slug: string; name: string }
      runs: number
      firstRecords: number
      operations: number
      hardware: string[]
    }
  | {
      kind: "correction"
      runId: string
      action: "retracted" | "superseded"
      reason: string | null
      operation: { name: string; slug: string }
      implementation: { name: string; slug: string }
    }
  | { kind: "claim"; project: { name: string; slug: string }; by: string }
)

export type FeedModel = {
  illustrative: boolean
  /** UTC days, newest first; entries newest first inside a day. */
  days: { date: string; entries: FeedEntry[] }[]
}

// ---------------------------------------------------------------------------
// Challenges (§2.3 coverage-gap discovery): one row per thing the index has
// no good answer for yet. Facts, not warnings; three facts and two actions.

export type ChallengeKind =
  | "requested"
  | "gap"
  | "model_gap"
  | "unbeaten_baseline"
  | "unchallenged"
  | "stale"

export type Challenge = {
  kind: ChallengeKind
  /** The operation in question, or null for a family-level gap. */
  operation: { name: string; slug: string } | null
  family: string | null
  hardware: string | null
  /** One line stating the gap in words (the workload, the baseline, …). */
  detail: string
  /** Since when the gap has stood; null when not a dated fact. */
  since: string | null
  /** Requests recorded for this workload class (requested rows); 0 else. */
  count: number
  /** Where to look: the cohort, the operation page, or a search. */
  href: string
}

export type ChallengesModel = {
  illustrative: boolean
  challenges: Challenge[]
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
   * Populated when the query plausibly names several operations. With
   * `operation` null it is the chooser (no clear leader, or `choose`
   * requested). Beside a resolved `operation` it lists the other candidates:
   * the most-measured match answered, interpretation stated (§12.1).
   */
  matches: OperationIndexEntry[] | null
  cohort: CohortContext | null
  /** Every measured cohort for the resolved workload; `cohort` is one of
   * them. Empty unless one operation resolved. */
  cohortOptions: CohortOption[]
  groups: {
    exact: ResultRow[]
    compatible: ResultRow[]
    supportedUnmeasured: ResultRow[]
    reported: ResultRow[]
  }
  /** Rows cut per group by the server-side payload cap — reported, never
   * silently dropped. */
  overflow: {
    exact: number
    compatible: number
    supportedUnmeasured: number
    reported: number
  }
  related: RelatedItem[]
  /** Source coverage and freshness for the resolved operation (§22.4). */
  sources: SourceRef[]
  noResult: {
    guidance: string
    /** Clickable rewrites: display label plus the query it submits. */
    suggestions: { label: string; query: string }[]
  } | null
  /** When the request binds a case nobody measured: the measured cases on
   * either side of it along the one axis that differs (§12.5). Null when
   * an exact case exists or when no single axis explains the difference. */
  nearest: {
    axis: string
    requested: number
    below: NearestCase | null
    above: NearestCase | null
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

/** One implementation's trace across a workload sweep (same environment,
 * protocol, and hardware; only the sweep axis varies). Points are the best
 * eligible value per workload — a visualization of scaling, never a ranking
 * across cohorts (§11.1). */
export type SweepSeries = {
  implementation: { name: string; slug: string }
  points: { x: number; value: number; workloadId: string }[]
}

export type OperationSweep = {
  /** The one numeric axis that varies, e.g. "tokens". */
  axis: string
  /** Canonical y unit (e.g. "ns") and its label, e.g. "latency · median". */
  unit: string
  metricLabel: string
  /** The held-constant facts: hardware and environment/protocol line. */
  environmentLabel: string
  /** Best implementations first; capped for legibility. */
  series: SweepSeries[]
  /** Implementations beyond the cap. */
  overflow: number
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
    /** Reviewed exactly-equivalent definitions from other sources (§8.4);
     * their cohorts render on this page but never merge. */
    equivalents: { name: string; slug: string }[]
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
  cohortOptions: CohortOption[]
  cohort: CohortContext | null
  /** Current records for the selected workload. */
  records: ResultRow[]
  /** Scaling sweep across the workload family, when one exists. */
  sweep: OperationSweep | null
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
  /** Current records this revision holds across its cohorts (§16.9: the
   * page answers "is this competitive", not only "can I use it"). */
  standing: { records: number }
  /** Fastest first; each row carries its rank inside its own cohort. */
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

/** One community attestation on a run (§15.6, §16.10 Replications): a
 * typed statement with optional evidence and a measured value. Stated as
 * community knowledge; never an input to the evidence level (§8.14). */
export type Attestation = {
  id: string
  type:
    | "reproduced"
    | "could_not_reproduce"
    | "environment_note"
    | "regression_observed"
  body: string
  evidenceUrl: string | null
  /** The attester's own measurement in nanoseconds, when stated. */
  observedNs: number | null
  environmentSummary: string | null
  author: string
  at: string
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
    /** The cohort's #1 run under ranking-v1; null when nothing ranks. */
    headRunId: string | null
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
  /** Published community attestations, newest first. */
  attestations: Attestation[]
  /** Canonical run manifest for the manifest section. */
  manifest: unknown
}

/** One row of the public coverage page (Week 12): live per-source counts,
 * so the site's limits are stated as current facts, not marketing. */
export type CoverageSource = {
  slug: string
  kind: "kernel" | "serving"
  /** Eligible runs — the same predicate every ranked surface counts (§11.4). */
  runs: number
  /** Raw indexed corpus: any published run, failed/superseded included. */
  indexed: number
  /** Kernel sources: distinct operations. Serving: distinct configurations. */
  breadth: number
  hardware: number
  lastFetched: string | null
}

/** One priority family's eligible-run counts across the hero GPUs — the
 * public, falsifiable definition of "enough records": a zero is a gap. */
export type HeroCoverageRow = {
  family: string
  /** Aligned with the model's hero GPU list. */
  runs: number[]
  total: number
}

export type CoveragePageModel = {
  illustrative: boolean
  sources: CoverageSource[]
  hero: { gpus: string[]; rows: HeroCoverageRow[] }
}

export type HardwareIndexModel = {
  illustrative: boolean
  gpus: HardwareIndexEntry[]
}

export type ProjectIndexModel = {
  illustrative: boolean
  projects: ProjectIndexEntry[]
}

/** One GPU in the hardware index (§16.4 GPU-first navigation). */
export type HardwareIndexEntry = {
  slug: string
  model: string
  architecture: string | null
  runs: number
  operations: number
  records: number
  lastObservedAt: string | null
}

/** Per-operation-family coverage on one GPU. */
export type HardwareFamilyCoverage = {
  family: string
  operations: number
  runs: number
  withSource: number
}

export type HardwarePageModel = {
  illustrative: boolean
  hardware: { slug: string; model: string; architecture: string | null }
  stats: {
    runs: number
    operations: number
    implementations: number
    lastObservedAt: string | null
  }
  /** Current records held on this GPU, newest first. */
  records: RecordHolder[]
  families: HardwareFamilyCoverage[]
  sources: SourceRef[]
}

// ---------------------------------------------------------------------------
// Model surface (§16.21): kernel-side `model:` workload provenance as a
// first-class view. Kernel tags and serving revisions never merge — separate
// lists, separate counts, exact-slug matching only between them.

/** One kernel-side model tag in the /models index. */
export type ModelIndexEntry = {
  model: string
  operations: number
  families: number
  /** Eligible runs across every GPU. */
  runs: number
  gpus: number
  lastObservedAt: string | null
}

export type ModelIndexModel = {
  illustrative: boolean
  kernel: ModelIndexEntry[]
  serving: ModelCoverageModel["serving"]
}

/**
 * One operation's best-known answer on the selected GPU: the fastest entry
 * of the operation's largest comparison cohort there, and the fastest entry
 * passing deployability-v1 — the answer card's two-slot semantics per row.
 */
export type ModelBestKnown = {
  operation: { name: string; slug: string }
  family: string
  fastest: ResultRow
  /** Null when no cohort entry passes the deployability policy. */
  deployable: ResultRow | null
  cohort: CohortContext
  /** The cohort's workload, for deep-linking the operation page's island. */
  workloadId: string
  /** Ranked cohort entries beyond the fastest. */
  alternatives: number
}

/** A stated gap: the operation is relevant to the model but holds no
 * eligible evidence on the selected GPU (§2.3). */
export type ModelGap = {
  operation: { name: string; slug: string }
  family: string
  /** GPUs holding eligible evidence; empty means none anywhere. */
  measuredOn: string[]
}

export type ModelPageModel = {
  illustrative: boolean
  model: {
    slug: string
    /** Tags in an exact hyphen-boundary prefix relation with the slug. */
    relatedTags: string[]
  }
  /** False when no operation carries the exact tag: related tags render as
   * the chooser and every evidence section stays absent. */
  resolved: boolean
  stats: { operations: number; families: number; runs: number }
  /** GPUs with eligible runs across this model's operations, most first. */
  gpus: { model: string; runs: number }[]
  selectedGpu: string | null
  /** Family groups, best-covered first; every entry resolves inside one
   * comparison cohort on the selected GPU, never across. */
  groups: { family: string; entries: ModelBestKnown[] }[]
  gaps: ModelGap[]
  /** Exact serving revision slug match only; link material, never merged. */
  serving: { slug: string; name: string; runs: number } | null
  sources: SourceRef[]
}

// ---------------------------------------------------------------------------
// Corpus enumeration models (§13.2 at 20k records): flat, filterable listings
// agents page through. Database-backed only — see server/catalog/api-reads.ts.

/** One published run in the /runs enumeration: scalar evidence row. */
export type RunListRow = {
  id: string
  digest: string
  operation: string
  implementation: string
  hardware: string
  status: RunStatus
  primary: PrimaryMetric | null
  evidence: EvidenceLevel
  sourceAvailable: boolean
  source: string
  observedAt: string
}

/** /runs filters; the cursor is the decoded (observedAt, id) keyset bound. */
export type RunListInput = {
  operation?: string
  hardware?: string
  source?: string
  status?: RunStatus
  since?: string
  cursor?: { observedAt: string; id: string }
  limit?: number
}

export type RunListModel = {
  runs: RunListRow[]
  nextCursor: string | null
  generatedAt: string
}

/** One operation in the /operations enumeration, with taxonomy tags. */
export type OperationListEntry = {
  slug: string
  name: string
  family: string
  tags: string[]
  workloads: number
  /** Eligible (published, passed, unretracted, unsuperseded) run count. */
  runs: number
}

/** Per-GPU corpus coverage: kernel and serving counts never rank together. */
export type HardwareCoverageEntry = {
  slug: string
  model: string
  vendor: string | null
  architecture: string | null
  kernelRuns: number
  servingRuns: number
  operations: number
  families: number
  lastObservedAt: string | null
}

/** Model coverage: serving revisions and kernel-side `model:` workload
 * provenance tags stay separate arrays — the surfaces never mix. */
export type ModelCoverageModel = {
  serving: {
    slug: string
    name: string
    parameterCount: number | null
    runs: number
  }[]
  kernel: { model: string; operations: number }[]
}

/** One software project's standing in the projects index. */
export type ProjectIndexEntry = {
  slug: string
  name: string
  /** Taxonomy species (§8.6): real libraries, competition authors, and
   * benchmark submitters render as separate groups, never one mixed list. */
  kind: "library" | "individual" | "vendor"
  repositoryUrl: string | null
  implementations: number
  runs: number
  /** Current records held across all cohorts. */
  records: number
  bestEvidence: EvidenceLevel | null
  /** Distinct concluded license expressions; empty means unknown. */
  licenses: string[]
  installable: boolean
  sourceAvailable: boolean
  /** Distinct GPU models measured. */
  hardware: string[]
  lastObservedAt: string | null
  /** Records gained and lost over the trailing 30 days of record events:
   * a first record counts as gained, a displaced holder as lost. Standing
   * inside cohorts, never a cross-cohort rank (§16.12). */
  gained30d: number
  lost30d: number
}

/** One measured implementation on a project page: the operation-page
 * summary plus the operation it implements, since rows span operations. */
export type ProjectImplementation = ImplementationSummary & {
  operation: { name: string; slug: string }
}

/**
 * The project entity page (§16.9's sibling): a library, a competition
 * author, or a vendor, with standing as records held, every measured
 * implementation, and the claim state. A claimed author project is that
 * person's public profile (§15.3); profiles need no separate people table.
 */
export type ProjectPageModel = {
  illustrative: boolean
  project: {
    slug: string
    name: string
    kind: ProjectIndexEntry["kind"]
    repositoryUrl: string | null
    /** Declared source-host identity, e.g. github "linkedin/Liger-Kernel". */
    host: { kind: string; id: string } | null
    /** Distinct concluded license expressions; empty means unknown. */
    licenses: string[]
  }
  stats: {
    implementations: number
    runs: number
    hardware: string[]
    lastObservedAt: string | null
  }
  /** Current records held, newest indexed first (ledger order). */
  records: RecordHolder[]
  /** Fastest first; one row per measured implementation revision. */
  implementations: ProjectImplementation[]
  /** Accepted claim → claimed by that user's display name; a pending claim
   * waits for review; otherwise unclaimed and claimable. */
  claim: { state: "unclaimed" | "pending" | "claimed"; by: string | null }
  sources: SourceRef[]
}
