// Pure ledger derivations shared by the server page (deep-link rendering)
// and the client island (instant interactions): filters, sorts, pagination,
// and the flattened event views over the records model (§16.12).
import type { RecordEvent, RecordHolder, RecordsPageModel } from "@/lib/catalog"

export type RecordsView = "current" | "broken" | "history"
export type RecordsSort = "date" | "improvement" | "leads" | "operation"
export type RecordsFilters = {
  view: RecordsView
  hardware: string | null
  verified: boolean
  /** Free-text filter over everything a cohort row displays (§16.12). */
  filter: string
  sort: RecordsSort
  page: number
}

export const DAY_MS = 24 * 60 * 60 * 1000
export const PAGE_SIZE = 100

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
  if (next.filter) params.set("f", next.filter)
  if (next.sort !== "date") params.set("sort", next.sort)
  if (next.page > 1) params.set("page", String(next.page))
  const suffix = params.toString()
  return suffix ? `/records?${suffix}` : "/records"
}

/** One record transition joined to its cohort and the record it displaced. */
export type LedgerEvent = {
  holder: RecordHolder
  event: RecordEvent
  previous: RecordEvent | null
}

/** Every record event in the ledger, newest first. */
export function allRecordEvents(model: RecordsPageModel): LedgerEvent[] {
  return model.records
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

export const isVerifiedHolder = (holder: RecordHolder) =>
  holder.current.evidence === "verified" ||
  holder.current.evidence === "replicated"

/** One filter policy for all three views: nothing is silently ignored. */
export function keepHolder(holder: RecordHolder, filters: RecordsFilters) {
  if (filters.hardware !== null && holder.hardware !== filters.hardware)
    return false
  if (filters.verified && !isVerifiedHolder(holder)) return false
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

/** Sorted copy under the ledger's four presentation sorts. */
export function sortHolders(
  holders: RecordHolder[],
  sort: RecordsSort,
): RecordHolder[] {
  const sorted = [...holders]
  // "date" keeps the backend order: newest record first.
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
        (a.since < b.since ? 1 : a.since > b.since ? -1 : 0),
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
  recordsTotal: number
  context: string | undefined
  holders?: { rows: RecordHolder[]; total: number; pageCount: number }
  broken?: LedgerEvent[]
  events?: { rows: LedgerEvent[]; total: number; pageCount: number }
}

/** Server- and client-shared derivation of one view window from the model. */
export function ledgerSlice(
  model: RecordsPageModel,
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
  const context =
    model.records.length > 0
      ? [
          `${model.records.length} records`,
          `${operations} operations`,
          ...model.hardwareOptions.map(
            (hardware) =>
              `${model.records.filter((holder) => holder.hardware === hardware).length} on ${hardware}`,
          ),
        ].join(" · ")
      : undefined
  const slice: LedgerSlice = {
    filters,
    counts,
    hardwareOptions: model.hardwareOptions,
    recordsTotal: model.records.length,
    context,
  }
  const kept = (holder: RecordHolder) => keepHolder(holder, filters)
  if (filters.view === "current") {
    const holders = sortHolders(model.records.filter(kept), filters.sort)
    const page = pageSlice(holders, filters.page)
    slice.filters = { ...filters, page: page.page }
    slice.holders = {
      rows: page.rows,
      total: holders.length,
      pageCount: page.pageCount,
    }
  } else {
    const filtered = events.filter(({ holder }) => kept(holder))
    if (filters.view === "broken") slice.broken = recentlyBroken(filtered)
    else {
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
