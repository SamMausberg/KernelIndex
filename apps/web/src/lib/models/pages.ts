// Page-oriented read models (§16.5–16.12): home, records, feed, challenges,
// search, compare, and the operation/implementation/run dossiers. Fixture
// and PostgreSQL backends implement these same shapes.
import type {
  CohortContext,
  CohortOption,
  ComparisonProfile,
  EvidenceLevel,
  KeyValue,
  LicenseInfo,
  NearestCase,
  OperationIndexEntry,
  PrimaryMetric,
  RelatedItem,
  ResultRow,
  RunStatus,
  SourceRef,
} from "./rows.ts"
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
  /** Statically extracted traits every shown row's implementation carries. */
  techniques: string[]
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

/**
 * headroom-v1 (§11.9): a coarse roofline under one cohort's record. An
 * estimate of a lower bound from declared tensors and datasheet peaks;
 * `basis` rides along so no surface can present it as a measurement.
 */
export type HeadroomEstimate = {
  basis: "estimate"
  policyVersion: string
  hardware: string
  /** Bytes the workload's declared tensors occupy, crossed once. */
  bytes: number
  /** Arithmetic the family formula counts; null when none applies. */
  flops: number | null
  computeDtype: string | null
  dramFloorNs: number
  computeFloorNs: number | null
  /** The binding floor: the larger of the two. */
  floorNs: number
  bestNs: number
  /** best / floor; 1.0 would put the record on the roofline. */
  ratio: number
  assumptions: string[]
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
  /** Roofline estimate under the shown cohort's record; null when the GPU,
   * workload kind, or metric gives no basis for one. */
  headroom: HeadroomEstimate | null
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
  /** Statically extracted technique facts (§8.7): each trait with the
   * source line that proves it. Empty when no source is mirrored. */
  techniques: { trait: string; value: string | null; evidence: string }[]
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
