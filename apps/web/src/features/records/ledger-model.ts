// Pure ledger derivations shared by the server page (deep-link rendering)
// and the client island (instant interactions): filters, sorts, pagination,
// and the flattened event views over the records model (§16.12).
import type {
  RecordEvent,
  RecordHolder,
  RecordsPageModel,
  ResultRow,
} from "@/lib/catalog"

/**
 * The web payload boundary (§16.12 payload budget): the catalog model keeps
 * the full ResultRow per holder for the public API, but the ledger — SSR
 * slice and the multi-MB /records/data fetch alike — ships only the fields
 * the record surfaces render.
 */
export type LedgerRow = Pick<
  ResultRow,
  | "runId"
  | "implementation"
  | "project"
  | "primary"
  | "solScore"
  | "baseline"
  | "evidence"
  | "sourceAvailable"
  | "installable"
  | "license"
>
export type LedgerHolder = Omit<RecordHolder, "current"> & {
  current: LedgerRow
}
export type LedgerModel = Omit<RecordsPageModel, "records"> & {
  records: LedgerHolder[]
}

/** Catalog model → ledger model, memoized so repeat callers (page render,
 * data route) and the event flattener below see one stable object. */
const slimMemo = new WeakMap<RecordsPageModel, LedgerModel>()
export function slimModel(model: RecordsPageModel): LedgerModel {
  const memo = slimMemo.get(model)
  if (memo) return memo
  const slim: LedgerModel = {
    ...model,
    records: model.records.map((holder) => ({
      ...holder,
      current: {
        runId: holder.current.runId,
        implementation: holder.current.implementation,
        project: holder.current.project,
        primary: holder.current.primary,
        solScore: holder.current.solScore,
        baseline: holder.current.baseline,
        evidence: holder.current.evidence,
        sourceAvailable: holder.current.sourceAvailable,
        installable: holder.current.installable,
        license: holder.current.license,
      },
    })),
  }
  slimMemo.set(model, slim)
  return slim
}

export type RecordsView = "current" | "broken" | "history"
export type RecordsSort =
  | "contested"
  | "date"
  | "improvement"
  | "leads"
  | "operation"
export type RecordsFilters = {
  view: RecordsView
  hardware: string | null
  verified: boolean
  /** Keep only records whose holder has mirrored source (§16.12). */
  source: boolean
  /** Include sole-entrant source baselines; hidden by default because an
   * unbeaten baseline is coverage, not a competitive record. */
  baselines: boolean
  /** Free-text filter over everything a cohort row displays (§16.12). */
  filter: string
  sort: RecordsSort
  page: number
}

export const DAY_MS = 24 * 60 * 60 * 1000
// Each server-rendered row costs ~5KB of HTML+flight; 25 keeps the first
// paint light, and once the model loads paging is an instant client slice.
export const PAGE_SIZE = 25
/** History entries shipped per holder in the SSR slice; the full history
 * arrives with the deferred /records/data model. */
export const HISTORY_PREVIEW = 6

export const DEFAULT_FILTERS: RecordsFilters = {
  view: "current",
  hardware: null,
  verified: false,
  source: true,
  baselines: false,
  filter: "",
  sort: "contested",
  page: 1,
}

const VIEWS = new Set<RecordsView>(["current", "broken", "history"])
const SORTS = new Set<RecordsSort>([
  "contested",
  "date",
  "improvement",
  "leads",
  "operation",
])

/** URL → filters; the page is ISR, so the island owns this parse. */
export function filtersFromParams(params: {
  get(name: string): string | null
}): RecordsFilters {
  const view = params.get("view") as RecordsView | null
  const sort = params.get("sort") as RecordsSort | null
  const page = Number.parseInt(params.get("page") ?? "1", 10)
  return {
    view: view !== null && VIEWS.has(view) ? view : "current",
    hardware: params.get("hw") || null,
    verified: params.get("verified") === "1",
    source: params.get("source") !== "0",
    baselines: params.get("baselines") === "1",
    filter: (params.get("f") ?? "").trim(),
    sort: sort !== null && SORTS.has(sort) ? sort : "contested",
    page: Number.isNaN(page) ? 1 : page,
  }
}

/** Trim per-holder histories in an SSR slice to the preview depth; the
 * island swaps in the full model before any interaction needs more. */
export function slimSlice(slice: LedgerSlice): LedgerSlice {
  const slim = (holder: LedgerHolder): LedgerHolder => ({
    ...holder,
    history: holder.history.slice(0, HISTORY_PREVIEW),
  })
  const slimEvent = (entry: LedgerEvent): LedgerEvent => ({
    ...entry,
    holder: slim(entry.holder),
  })
  return {
    ...slice,
    holders: slice.holders && {
      ...slice.holders,
      rows: slice.holders.rows.map(slim),
    },
    latest: slice.latest?.map(slimEvent),
    broken: slice.broken && {
      ...slice.broken,
      rows: slice.broken.rows.map(slimEvent),
    },
    events: slice.events && {
      ...slice.events,
      rows: slice.events.rows.map(slimEvent),
    },
  }
}

export function recordsHref(
  filters: RecordsFilters,
  patch: Partial<RecordsFilters>,
) {
  // Any change other than paging restarts at page 1.
  const next = { ...filters, page: patch.page ?? 1, ...patch }
  const params = new URLSearchParams()
  if (next.view !== "current") params.set("view", next.view)
  if (next.hardware) params.set("hw", next.hardware)
  if (next.verified) params.set("verified", "1")
  // Source-backed is the default state; only widening needs a param.
  if (!next.source) params.set("source", "0")
  if (next.baselines) params.set("baselines", "1")
  if (next.filter) params.set("f", next.filter)
  if (next.sort !== "contested") params.set("sort", next.sort)
  if (next.page > 1) params.set("page", String(next.page))
  const suffix = params.toString()
  return suffix ? `/records?${suffix}` : "/records"
}

/** One record transition joined to its cohort and the record it displaced. */
export type LedgerEvent = {
  holder: LedgerHolder
  event: RecordEvent
  previous: RecordEvent | null
}

/** Every record event in the ledger, newest first. Memoized per model: the
 * island re-slices on every filter keystroke, and re-flattening + re-sorting
 * thousands of events each time was measurable interaction jank. */
const eventsMemo = new WeakMap<LedgerModel, LedgerEvent[]>()
export function allRecordEvents(model: LedgerModel): LedgerEvent[] {
  const memo = eventsMemo.get(model)
  if (memo) return memo
  const events = model.records
    .flatMap((holder) =>
      holder.history.map((event, index) => ({
        holder,
        event,
        previous: holder.history[index + 1] ?? null,
      })),
    )
    .sort((a, b) =>
      a.event.at < b.event.at ? 1 : a.event.at > b.event.at ? -1 : 0,
    )
  eventsMemo.set(model, events)
  return events
}

/** The lead story (§16.12): the newest *indexed* record breaks — a fresh
 * import leads even when its source stamped old observation dates — one per
 * operation so three sibling cohorts never read as one repeated entry.
 * Holders arrive in the model's indexed-time backend order. */
export function latestBreaks(holders: LedgerHolder[]): LedgerEvent[] {
  const seen = new Set<string>()
  return holders
    .filter(
      (holder) =>
        holder.history[0] !== undefined &&
        holder.history[0].previousValue !== null &&
        !seen.has(holder.operation.slug) &&
        (seen.add(holder.operation.slug), true),
    )
    .slice(0, 3)
    .map((holder) => ({
      holder,
      event: holder.history[0],
      previous: holder.history[1] ?? null,
    }))
}

/** Transitions of the last 30 days, largest improvement first. */
export function recentlyBroken(events: LedgerEvent[]): LedgerEvent[] {
  return events
    .filter(
      ({ event }) =>
        event.previousValue !== null &&
        Date.now() - new Date(event.at).getTime() < 30 * DAY_MS,
    )
    .sort(
      (a, b) => (b.event.improvementPct ?? 0) - (a.event.improvementPct ?? 0),
    )
}

export const isVerifiedHolder = (holder: LedgerHolder) =>
  holder.current.evidence === "verified" ||
  holder.current.evidence === "replicated"

/** A source-designated baseline nobody has displaced: coverage, not a
 * competitive record — hidden until the baselines filter widens the view. */
export const isSoleBaseline = (holder: LedgerHolder) =>
  holder.current.baseline && holder.history.length === 1

/** One filter policy for all three views: nothing is silently ignored — the
 * control strip states the count each exclusion hides. */
export function keepHolder(holder: LedgerHolder, filters: RecordsFilters) {
  if (filters.hardware !== null && holder.hardware !== filters.hardware)
    return false
  if (filters.verified && !isVerifiedHolder(holder)) return false
  if (filters.source && !holder.current.sourceAvailable) return false
  if (!filters.baselines && isSoleBaseline(holder)) return false
  if (filters.filter === "") return true
  const needle = filters.filter.toLowerCase()
  return [
    holder.operation.name,
    holder.workloadSummary,
    holder.hardware,
    holder.environmentSummary,
    ...holder.history.map((event) => event.implementation.name),
  ].some((text) => text.toLowerCase().includes(needle))
}

const collator = new Intl.Collator(undefined, { numeric: true })

/** Sorted copy under the ledger's presentation sorts. */
export function sortHolders(
  holders: LedgerHolder[],
  sort: RecordsSort,
): LedgerHolder[] {
  const sorted = [...holders]
  // "date" keeps the backend order: newest indexed first (§16.5).
  if (sort === "contested") {
    // Signal first: cohorts whose record was actually displaced, then
    // sole-entrant firsts, then unbeaten baselines; newest indexed inside
    // each band.
    const band = (holder: LedgerHolder) =>
      holder.history.length > 1 ? 0 : holder.current.baseline ? 2 : 1
    sorted.sort(
      (a, b) =>
        band(a) - band(b) ||
        (a.indexedAt < b.indexedAt ? 1 : a.indexedAt > b.indexedAt ? -1 : 0),
    )
  }
  if (sort === "operation")
    sorted.sort(
      (a, b) =>
        collator.compare(a.operation.name, b.operation.name) ||
        collator.compare(a.workloadSummary, b.workloadSummary) ||
        collator.compare(a.hardware, b.hardware),
    )
  if (sort === "improvement")
    sorted.sort(
      (a, b) =>
        (b.history[0].improvementPct ?? -1) -
        (a.history[0].improvementPct ?? -1),
    )
  if (sort === "leads")
    sorted.sort(
      (a, b) =>
        b.history.length - a.history.length ||
        (a.indexedAt < b.indexedAt ? 1 : a.indexedAt > b.indexedAt ? -1 : 0),
    )
  return sorted
}

export type PageSlice<T> = { rows: T[]; page: number; pageCount: number }

export function pageSlice<T>(rows: T[], requested: number): PageSlice<T> {
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const page = Math.min(Math.max(1, requested), pageCount)
  return {
    rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    page,
    pageCount,
  }
}

/** Everything the island needs for the first paint of one deep-linked URL. */
export type LedgerSlice = {
  filters: RecordsFilters
  counts: Record<RecordsView, number>
  hardwareOptions: string[]
  /** Current-record count per hardware, shown in the GPU chooser. */
  hardwareCounts: Record<string, number>
  recordsTotal: number
  /** Sole-entrant baselines under the other filters; the baselines chip
   * states this count whether they are hidden or shown. */
  baselineCount: number
  /** Verified/replicated holders under the other filters; zero renders the
   * Verified chip as an honest dead control instead of an empty page. */
  verifiedCount: number
  context: string | undefined
  holders?: { rows: LedgerHolder[]; total: number; pageCount: number }
  /** Lead story for the current view: newest breaks under the filters. */
  latest?: LedgerEvent[]
  broken?: { rows: LedgerEvent[]; total: number; pageCount: number }
  events?: { rows: LedgerEvent[]; total: number; pageCount: number }
}

/** Server- and client-shared derivation of one view window from the model. */
export function ledgerSlice(
  model: LedgerModel,
  filters: RecordsFilters,
): LedgerSlice {
  const events = allRecordEvents(model)
  const counts: Record<RecordsView, number> = {
    current: model.records.length,
    broken: recentlyBroken(events).length,
    history: events.length,
  }
  const operations = new Set(
    model.records.map((holder) => holder.operation.slug),
  ).size
  const hardwareCounts: Record<string, number> = {}
  for (const holder of model.records)
    hardwareCounts[holder.hardware] = (hardwareCounts[holder.hardware] ?? 0) + 1
  const context =
    model.records.length > 0
      ? `${model.records.length} record${model.records.length === 1 ? "" : "s"} across ${operations} operation${operations === 1 ? "" : "s"} · ${model.hardwareOptions.length} GPU${model.hardwareOptions.length === 1 ? "" : "s"}`
      : undefined
  const slice: LedgerSlice = {
    filters,
    counts,
    hardwareOptions: model.hardwareOptions,
    hardwareCounts,
    recordsTotal: model.records.length,
    baselineCount: model.records.filter(
      (holder) =>
        isSoleBaseline(holder) &&
        keepHolder(holder, { ...filters, baselines: true, filter: "" }),
    ).length,
    verifiedCount: model.records.filter(
      (holder) =>
        isVerifiedHolder(holder) &&
        keepHolder(holder, { ...filters, verified: true, filter: "" }),
    ).length,
    context,
  }
  const kept = (holder: LedgerHolder) => keepHolder(holder, filters)
  if (filters.view === "current") {
    const holders = sortHolders(model.records.filter(kept), filters.sort)
    const page = pageSlice(holders, filters.page)
    slice.filters = { ...filters, page: page.page }
    slice.holders = {
      rows: page.rows,
      total: holders.length,
      pageCount: page.pageCount,
    }
    slice.latest = latestBreaks(model.records.filter(kept))
  } else {
    const filtered = events.filter(({ holder }) => kept(holder))
    if (filters.view === "broken") {
      const broken = recentlyBroken(filtered)
      const page = pageSlice(broken, filters.page)
      slice.filters = { ...filters, page: page.page }
      slice.broken = {
        rows: page.rows,
        total: broken.length,
        pageCount: page.pageCount,
      }
    } else {
      const page = pageSlice(filtered, filters.page)
      slice.filters = { ...filters, page: page.page }
      slice.events = {
        rows: page.rows,
        total: filtered.length,
        pageCount: page.pageCount,
      }
    }
  }
  return slice
}
