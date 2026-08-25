// Row-level read-model vocabulary shared by every catalog surface: evidence
// and comparison enums, the dense ResultRow, cohort context, and the compact
// operation index entry. Page models live in pages.ts and listings.ts.
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

/** Copyable install line. `pinned` states whether the command resolves to
 * the measured code — pip `==version`, git `@commit`, image tag (§8.15). */
export type InstallLine = { kind: string; command: string; pinned: boolean }

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
  /** Copyable install line; null renders as "no install recipe". */
  install: InstallLine | null
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
  /** Reviewed-equivalent definitions this row absorbed (§8.4). One browse row
   * can stand for several operations, so a count of rows is not a count of
   * operations — the surfaces state the difference rather than hide it. */
  folded: number
  /** Present only on multi-match chooser rows for a faceted query. */
  match?: ChooserMatch | null
}
