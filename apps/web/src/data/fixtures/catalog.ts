// Deterministic illustrative fixtures implementing the catalog read seam
// (§27.5). Every model carries `illustrative: true`; the UI must render that
// label. Projects, runs, and numbers are fictional and must never be
// presented as real benchmark evidence. The corpus and row assembly live in
// data.ts; search resolution in search.ts; dossiers in dossiers.ts.
import type {
  Challenge,
  ChallengesModel,
  CoveragePageModel,
  EvidenceLevel,
  FeedEntry,
  FeedModel,
  HardwareIndexModel,
  HardwarePageModel,
  HomePageModel,
  ModelIndexModel,
  ModelPageModel,
  PrimaryMetric,
  ProjectIndexModel,
  ProjectPageModel,
  RecordHolder,
  RecordsPageModel,
} from "@/lib/catalog-models"
import { hardwareSlug, relatedModelTags } from "@/lib/names"
import {
  B200,
  COHORT_2048,
  digest,
  FIXTURE_SOURCE_REF,
  FRESH,
  type FxRun,
  ILLUSTRATIVE,
  RANKED,
  RUNS,
  rowFromRun,
  WORKLOADS,
} from "./data"

export {
  getComparePage,
  getImplementationPage,
  getRunPage,
} from "./dossiers"
export { findPrecedents } from "./precedents"
export {
  getOperationIndex,
  getOperationPage,
  searchCatalog,
} from "./search"

export async function getHomePage(): Promise<HomePageModel> {
  // Homepage lists default to source-backed records (2026-08-16 decision);
  // like the postgres read, rows are record holders trimmed to their
  // current event, breaks before first records.
  const { records } = await getRecordsPage()
  const latest = records
    .filter((holder) => holder.current.sourceAvailable)
    .sort((a, b) => b.history.length - a.history.length)
    .map((holder) => ({ ...holder, history: holder.history.slice(0, 1) }))
  return {
    illustrative: ILLUSTRATIVE,
    latest,
    stats: {
      operations: 2,
      runs: 10,
      gpus: 1,
      servingRuns: 4,
      evidence: { verified: 2, reproducible: 4, reported: 4 },
    },
  }
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
    workloadId: "wl-2048",
    workloadSummary: WORKLOADS["wl-2048"].summary,
    hardware: B200.model,
    environmentSummary: "CUDA 13.1 · PyTorch 2.9.0 · ki-fixed-clock v1",
    current: rowFromRun(run("run-fx-0001")),
    since: FRESH,
    indexedAt: FRESH,
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
    workloadId: "wl-1024",
    workloadSummary: WORKLOADS["wl-1024"].summary,
    hardware: B200.model,
    environmentSummary: "CUDA 13.1 · PyTorch 2.9.0 · ki-fixed-clock v1",
    current: rowFromRun(run("run-fx-0005")),
    since: FRESH,
    indexedAt: FRESH,
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

/** The fixture feed (§13.11): every record break from the fixture ledger,
 * the import that published the fixtures, and the one retraction, grouped
 * by day like the PostgreSQL read. */
export async function getFeed(): Promise<FeedModel> {
  const { records } = await getRecordsPage()
  const blank = {
    cohort: null,
    operation: null,
    projects: [],
    gpu: null,
    models: [],
  }
  const entries: FeedEntry[] = records.flatMap((holder) =>
    holder.history.flatMap((event, index) => {
      const previous = holder.history[index + 1]
      if (!event.previousValue || !previous) return []
      const run = RUNS.find((r) => r.id === event.runId)
      return [
        {
          kind: "record" as const,
          at: event.at,
          runId: event.runId,
          operation: holder.operation,
          workloadId: holder.workloadId,
          workloadSummary: holder.workloadSummary,
          hardware: holder.hardware,
          implementation: event.implementation,
          project: run?.project ?? holder.current.project,
          value: event.value,
          previous: {
            implementation: previous.implementation,
            value: event.previousValue,
          },
          improvementPct: event.improvementPct,
          cohortKey: holder.cohortKey,
          match: {
            cohort: holder.cohortKey,
            operation: holder.operation.slug,
            projects: [run?.project.slug ?? holder.current.project.slug],
            gpu: holder.hardware,
            models: ["llama-3.1-8b"],
          },
        },
      ]
    }),
  )
  const retracted = RUNS.find((r) => r.retracted)
  if (retracted?.retracted)
    entries.push({
      kind: "correction",
      at: retracted.retracted.at,
      runId: retracted.id,
      action: "retracted",
      reason: retracted.retracted.reason,
      operation: { name: "RMSNorm, hidden 4096", slug: "rmsnorm-h4096" },
      implementation: { name: retracted.impl.name, slug: retracted.impl.slug },
      match: {
        ...blank,
        cohort: COHORT_2048.comparisonKey,
        operation: "rmsnorm-h4096",
        projects: [retracted.project.slug],
        gpu: B200.model,
      },
    })
  entries.push({
    kind: "import",
    at: FRESH,
    source: { slug: "illustrative", name: FIXTURE_SOURCE_REF.name },
    runs: RUNS.length,
    firstRecords: records.length,
    operations: 2,
    hardware: [B200.model],
    match: blank,
  })
  const sorted = entries.sort((a, b) =>
    a.at < b.at ? 1 : a.at > b.at ? -1 : 0,
  )
  const days: FeedModel["days"] = []
  for (const entry of sorted) {
    const date = entry.at.slice(0, 10)
    const day = days.at(-1)
    if (day?.date === date) day.entries.push(entry)
    else days.push({ date, entries: [entry] })
  }
  return { illustrative: ILLUSTRATIVE, days }
}

/** The fixture challenges board (§2.3): one row per kind, derived from the
 * fixture ledger the way the PostgreSQL read derives them. */
export async function getChallenges(): Promise<ChallengesModel> {
  const { records } = await getRecordsPage()
  const stale = records.find((holder) => holder.current.stale)
  const single = records.find(
    (holder) => holder.history.length === 1 && !holder.current.baseline,
  )
  const challenge = (
    kind: Challenge["kind"],
    holder: (typeof records)[number],
    detail: string,
  ): Challenge => ({
    kind,
    operation: holder.operation,
    family: null,
    hardware: holder.hardware,
    detail,
    since: holder.since,
    count: 0,
    href: `/operations/${holder.operation.slug}?workload=${holder.workloadId}&cohort=${encodeURIComponent(holder.cohortKey)}`,
  })
  return {
    illustrative: ILLUSTRATIVE,
    challenges: [
      {
        kind: "requested",
        operation: { name: "RMSNorm, hidden 4096", slug: "rmsnorm-h4096" },
        family: null,
        hardware: "H100",
        detail: "bf16 · tokens ≈ 8k",
        since: null,
        count: 7,
        href: "/search?q=op%3Armsnorm-h4096%20gpu%3AH100%20dtype%3Abf16%20tokens%3D8192",
      },
      {
        kind: "gap",
        operation: null,
        family: "gqa-paged-attention",
        hardware: "NVIDIA H100",
        detail: "no eligible run for the gqa-paged-attention family",
        since: null,
        count: 0,
        href: "/search?q=gqa-paged-attention%20H100",
      },
      ...(single
        ? [
            challenge(
              "unchallenged",
              single,
              `${single.workloadSummary} · ${single.current.implementation.name} is the only entry`,
            ),
          ]
        : []),
      ...(stale
        ? [
            challenge(
              "stale",
              stale,
              `${stale.workloadSummary} · ${stale.current.implementation.name} last observed ${(stale.current.lastTestedAt ?? "").slice(0, 10)}`,
            ),
          ]
        : []),
    ],
  }
}

// Serving fixtures (§8.16, Week 9): same seam, separate module.
export * from "./serving"

/** Eligible fixture runs: the same filter every ranked surface applies. */
const eligible = () =>
  RUNS.filter((r) => r.status === "passed" && !r.retracted && !r.supersededById)

export async function getHardwareIndex(): Promise<HardwareIndexModel> {
  const runs = eligible()
  const { records } = await getRecordsPage()
  return {
    illustrative: ILLUSTRATIVE,
    gpus: [
      {
        slug: hardwareSlug(B200.model),
        model: B200.model,
        architecture: B200.architecture,
        runs: runs.length,
        operations: 1,
        records: records.length,
        lastObservedAt: FRESH,
      },
    ],
  }
}

export async function getHardwarePage(
  slug: string,
): Promise<HardwarePageModel | null> {
  if (slug !== hardwareSlug(B200.model)) return null
  const runs = eligible()
  const { records } = await getRecordsPage()
  return {
    illustrative: ILLUSTRATIVE,
    hardware: { slug, model: B200.model, architecture: B200.architecture },
    stats: {
      runs: runs.length,
      operations: 1,
      implementations: new Set(runs.map((r) => r.impl.slug)).size,
      lastObservedAt: FRESH,
    },
    records,
    families: [
      {
        family: "rmsnorm",
        operations: 1,
        runs: runs.length,
        withSource: runs.filter((r) => r.sourceAvailable).length,
      },
    ],
    sources: [FIXTURE_SOURCE_REF],
  }
}

/** Strongest first: the evidence ceiling of a set of fixture runs. */
const STRONGEST: EvidenceLevel[] = [
  "replicated",
  "verified",
  "reproducible",
  "reported",
]
const strongest = (runs: FxRun[]) =>
  STRONGEST.find((level) => runs.some((r) => r.evidence === level)) ?? null

/** Project of a fixture implementation, for crediting record transitions. */
const projectOf = (implementationSlug: string) =>
  RUNS.find((r) => r.impl.slug === implementationSlug)?.project.slug ?? null

/** Trailing-30-day record transitions per project, from the handcrafted
 * histories: the new holder gains, a displaced different project loses. */
async function recordTransitions() {
  const { records } = await getRecordsPage()
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000
  const gained = new Map<string, number>()
  const lost = new Map<string, number>()
  for (const holder of records)
    holder.history.forEach((event, index) => {
      if (new Date(event.at).getTime() < since) return
      const winner = projectOf(event.implementation.slug)
      if (winner === null) return
      gained.set(winner, (gained.get(winner) ?? 0) + 1)
      const previous = holder.history[index + 1]
      const loser = previous ? projectOf(previous.implementation.slug) : null
      if (loser !== null && loser !== winner)
        lost.set(loser, (lost.get(loser) ?? 0) + 1)
    })
  return { gained, lost }
}

export async function getProjectIndex(): Promise<ProjectIndexModel> {
  const [{ records }, transitions] = await Promise.all([
    getRecordsPage(),
    recordTransitions(),
  ])
  const bySlug = new Map<string, { name: string; runs: FxRun[] }>()
  for (const run of eligible()) {
    const entry = bySlug.get(run.project.slug) ?? {
      name: run.project.name,
      runs: [],
    }
    entry.runs.push(run)
    bySlug.set(run.project.slug, entry)
  }
  return {
    illustrative: ILLUSTRATIVE,
    projects: [...bySlug.entries()].map(([slug, entry]) => ({
      slug,
      name: entry.name,
      kind: "library" as const,
      repositoryUrl: null,
      implementations: new Set(entry.runs.map((r) => r.impl.slug)).size,
      runs: entry.runs.length,
      records: records.filter((h) => h.current.project.slug === slug).length,
      gained30d: transitions.gained.get(slug) ?? 0,
      lost30d: transitions.lost.get(slug) ?? 0,
      bestEvidence: strongest(entry.runs),
      licenses: [
        ...new Set(
          entry.runs
            .map((r) => r.license.concluded)
            .filter((license): license is string => license !== null),
        ),
      ],
      installable: entry.runs.some((r) => r.installable),
      sourceAvailable: entry.runs.some((r) => r.sourceAvailable),
      hardware: [B200.model],
      lastObservedAt: FRESH,
    })),
  }
}

// Model surface fixtures (§16.21): both fixture operations carry the
// illustrative llama-3.1-8b provenance tag (the operation page already
// states it), so the model page exercises the fastest-vs-deployable split
// (ionflux vs meridian) and a stated gap (the unmeasured fused operation).
const FIXTURE_MODEL = "llama-3.1-8b"

/** Fixture project dossier: derived from the run corpus like the index, one
 * row per implementation fastest first, records from the handcrafted
 * ledger. Meridian declares a GitHub host so the one-click claim path
 * renders; nothing is ever claimed in fixtures. */
export async function getProjectPage(
  slug: string,
): Promise<ProjectPageModel | null> {
  const runs = eligible()
    .filter((r) => r.project.slug === slug)
    .sort((a, b) => a.latencyNs - b.latencyNs)
  if (runs.length === 0) return null
  const { records } = await getRecordsPage()
  const byImplementation = new Map<string, FxRun[]>()
  for (const run of runs)
    byImplementation.set(run.impl.slug, [
      ...(byImplementation.get(run.impl.slug) ?? []),
      run,
    ])
  const meridian = slug === "meridian-kernels"
  return {
    illustrative: ILLUSTRATIVE,
    project: {
      slug,
      name: runs[0].project.name,
      kind: "library",
      repositoryUrl: meridian
        ? "https://example.invalid/meridian/kernels"
        : null,
      host: meridian ? { kind: "github", id: "meridian/kernels" } : null,
      licenses: [
        ...new Set(
          runs
            .map((r) => r.license.concluded)
            .filter((license): license is string => license !== null),
        ),
      ],
    },
    stats: {
      implementations: byImplementation.size,
      runs: runs.length,
      hardware: [B200.model],
      lastObservedAt: FRESH,
    },
    records: records.filter((h) => h.current.project.slug === slug),
    implementations: [...byImplementation.values()].map((own) => {
      const row = rowFromRun(own[0])
      return {
        slug: row.implementation.slug,
        name: row.implementation.name,
        project: row.project,
        operation: row.operation,
        language: row.language,
        framework: row.framework,
        evidence: strongest(own),
        bestPrimary: row.primary,
        sourceAvailable: row.sourceAvailable,
        installable: row.installable,
        license: row.license,
      }
    }),
    claim: { state: "unclaimed", by: null },
    sources: [FIXTURE_SOURCE_REF],
  }
}

export async function getModelIndex(): Promise<ModelIndexModel> {
  return {
    illustrative: ILLUSTRATIVE,
    kernel: [
      {
        model: FIXTURE_MODEL,
        operations: 2,
        families: 2,
        runs: eligible().length,
        gpus: 1,
        lastObservedAt: FRESH,
      },
    ],
    serving: [
      {
        slug: "aurora-70b",
        name: "Aurora-70B (fictional)",
        parameterCount: 70_000_000_000,
        runs: 4,
      },
    ],
  }
}

export async function getModelPage(
  slug: string,
  gpu?: string,
): Promise<ModelPageModel | null> {
  const relatedTags = relatedModelTags(slug, [FIXTURE_MODEL])
  if (slug !== FIXTURE_MODEL) {
    if (relatedTags.length === 0) return null
    return {
      illustrative: ILLUSTRATIVE,
      model: { slug, relatedTags },
      resolved: false,
      stats: { operations: 0, families: 0, runs: 0 },
      gpus: [],
      selectedGpu: null,
      groups: [],
      gaps: [],
      serving: null,
      sources: [],
    }
  }
  const runs = eligible()
  void gpu // one fixture GPU: any request resolves to the most-measured
  return {
    illustrative: ILLUSTRATIVE,
    model: { slug, relatedTags },
    resolved: true,
    stats: { operations: 2, families: 2, runs: runs.length },
    gpus: [{ model: B200.model, runs: runs.length }],
    selectedGpu: B200.model,
    groups: [
      {
        family: "rmsnorm",
        entries: [
          {
            operation: { name: "RMSNorm, hidden 4096", slug: "rmsnorm-h4096" },
            family: "rmsnorm",
            fastest: rowFromRun(RANKED[0]),
            deployable: rowFromRun(RANKED[1]),
            cohort: COHORT_2048,
            workloadId: "wl-2048",
            alternatives: RANKED.length - 1,
          },
        ],
      },
    ],
    gaps: [
      {
        operation: {
          name: "Fused residual + RMSNorm",
          slug: "fused-residual-rmsnorm",
        },
        family: "fused-residual-rmsnorm",
        measuredOn: [],
      },
    ],
    serving: null,
    sources: [FIXTURE_SOURCE_REF],
  }
}

/** Coverage rows sized to the fixture catalog, visibly illustrative. */
export async function getCoveragePage(): Promise<CoveragePageModel> {
  return {
    illustrative: true,
    sources: [
      {
        slug: "sol-execbench",
        kind: "kernel",
        runs: 8,
        indexed: 9,
        breadth: 2,
        hardware: 1,
        lastFetched: "2026-08-14T00:00:00.000Z",
      },
      {
        slug: "mlperf-inference",
        kind: "serving",
        runs: 4,
        indexed: 4,
        breadth: 3,
        hardware: 2,
        lastFetched: "2026-08-14T00:00:00.000Z",
      },
    ],
    hero: {
      gpus: ["NVIDIA B200"],
      rows: [{ family: "rmsnorm", runs: [8], total: 8 }],
    },
  }
}
