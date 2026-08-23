// Coverage, hardware, model-surface, corpus-enumeration, and project read
// models (§13.2, §16.4, §16.21). Same backend-agnostic contract as pages.ts.
import type { ImplementationSummary, RecordHolder } from "./pages.ts"
import type {
  CohortContext,
  EvidenceLevel,
  PrimaryMetric,
  ResultRow,
  RunStatus,
  SourceRef,
} from "./rows.ts"
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
