import Link from "next/link"
import { Metric } from "@/components/metric"
import type { RecordEvent, RecordHolder, RecordsPageModel } from "@/lib/catalog"
import {
  evidenceLabel,
  formatDateShort,
  formatDateUTC,
  formatPrimary,
} from "@/lib/format"

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

const DAY_MS = 24 * 60 * 60 * 1000
const PAGE_SIZE = 100

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
    .sort((a, b) => b.event.at.localeCompare(a.event.at))
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

const isVerifiedHolder = (holder: RecordHolder) =>
  holder.current.evidence === "verified" ||
  holder.current.evidence === "replicated"

/** One filter policy for all three views: nothing is silently ignored. */
function keepHolder(holder: RecordHolder, filters: RecordsFilters) {
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

/** Page slice plus the pager strip shared by the current and history views. */
function paginate<T>(rows: T[], filters: RecordsFilters) {
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const page = Math.min(Math.max(1, filters.page), pageCount)
  const pager =
    pageCount > 1 ? (
      <div className="mt-4 flex items-baseline gap-5 text-[12.5px]">
        {page > 1 ? (
          <Link href={recordsHref(filters, { page: page - 1 })}>
            ← Previous
          </Link>
        ) : (
          <span className="text-ghost">← Previous</span>
        )}
        <span className="font-mono text-[12px] text-faint">
          page {page} of {pageCount}
        </span>
        {page < pageCount ? (
          <Link href={recordsHref(filters, { page: page + 1 })}>Next →</Link>
        ) : (
          <span className="text-ghost">Next →</span>
        )}
      </div>
    ) : null
  return { rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), pager }
}

/**
 * The one control strip shared by all three views: hardware scope, evidence
 * toggle, and a text filter on the left; the view's status and sort on the
 * right. The form resubmits every other active filter so nothing resets.
 */
function ControlStrip({
  model,
  filters,
  status,
}: {
  model: RecordsPageModel
  filters: RecordsFilters
  status: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5 border-b border-border-strong pt-5 pb-3">
      <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2 text-[12.5px]">
        {["All hardware", ...model.hardwareOptions].map((label) => {
          const value = label === "All hardware" ? null : label
          const selected = filters.hardware === value
          return (
            <Link
              key={label}
              href={recordsHref(filters, { hardware: value })}
              className={`transition-colors hover:text-fg hover:no-underline ${
                selected ? "text-accent" : "text-subtle"
              }`}
            >
              {label}
            </Link>
          )
        })}
        <span className="text-ghost">|</span>
        <Link
          href={recordsHref(filters, { verified: !filters.verified })}
          className={`transition-colors hover:text-fg hover:no-underline ${
            filters.verified ? "text-accent" : "text-subtle"
          }`}
        >
          Verified only
        </Link>
        <form
          action="/records"
          className="well flex h-[30px] w-[230px] items-center px-2.5"
        >
          {filters.view !== "current" && (
            <input type="hidden" name="view" value={filters.view} />
          )}
          {filters.hardware !== null && (
            <input type="hidden" name="hw" value={filters.hardware} />
          )}
          {filters.verified && (
            <input type="hidden" name="verified" value="1" />
          )}
          {filters.sort !== "date" && (
            <input type="hidden" name="sort" value={filters.sort} />
          )}
          <input
            name="f"
            defaultValue={filters.filter}
            placeholder="Filter operation or kernel"
            aria-label="Filter records"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[12px] outline-none"
          />
        </form>
        {filters.filter !== "" && (
          <Link
            href={recordsHref(filters, { filter: "" })}
            className="text-faint transition-colors hover:text-fg hover:no-underline"
          >
            Clear filter
          </Link>
        )}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 text-[12.5px] text-faint">
        {status}
      </div>
    </div>
  )
}

const CURRENT_GRID =
  "grid grid-cols-[minmax(300px,1.6fr)_190px_80px_minmax(180px,1fr)_130px_118px_82px_28px] min-w-[1140px]"

function HolderRow({ holder }: { holder: RecordHolder }) {
  const record = holder.current
  const isNew = Date.now() - new Date(holder.since).getTime() < 14 * DAY_MS
  const strong = isVerifiedHolder(holder)
  const margin = holder.history[0].improvementPct
  return (
    <details className="group border-b border-line">
      <summary
        className={`${CURRENT_GRID} h-[47px] cursor-pointer list-none items-center transition-colors hover:bg-raised [&::-webkit-details-marker]:hidden`}
      >
        <div className="min-w-0 truncate pr-3">
          <span className="text-[13px] text-fg">{holder.operation.name}</span>
          <span className="ml-2 font-mono text-[11.5px] text-faint">
            {holder.workloadSummary}
          </span>
        </div>
        <div className="pr-4 text-right whitespace-nowrap">
          <Metric
            primary={record.primary}
            spread
            valueClassName="font-mono text-[14px] text-fg"
          />
        </div>
        <div className="pr-3 font-mono text-[12px]">
          {margin !== null ? (
            <span className="text-subtle">{margin.toFixed(1)}%</span>
          ) : (
            <span className="text-faint">first</span>
          )}
        </div>
        <div className="min-w-0 truncate pr-3">
          <Link
            href={`/implementations/${record.implementation.slug}`}
            className="text-[13px]"
          >
            {record.implementation.name}
          </Link>
          {record.project.name !== record.implementation.name && (
            <span className="ml-2 text-[12px] text-faint">
              {record.project.name}
            </span>
          )}
        </div>
        <div className="truncate pr-3 font-mono text-[12px] text-muted">
          {holder.hardware}
        </div>
        <div className={`text-[12.5px] ${strong ? "text-fg" : "text-subtle"}`}>
          {strong && <span className="mr-1.5 text-[9px] text-success">●</span>}
          {evidenceLabel(record.evidence)}
        </div>
        <div className="font-mono text-[11.5px] whitespace-nowrap text-faint">
          {formatDateShort(holder.since)}
          {isNew && <span className="text-accent"> · new</span>}
        </div>
        <div
          aria-hidden="true"
          className="pr-1 text-right font-mono text-[12px] text-faint transition-transform group-open:rotate-90"
        >
          ›
        </div>
      </summary>
      <div className="border-t border-line bg-surface pb-4">
        <div className="pt-3 font-mono text-[11.5px] text-faint">
          {holder.environmentSummary}
        </div>
        <div className="mt-3 text-[11.5px] tracking-[0.03em] text-faint uppercase">
          Record history
        </div>
        {holder.history.map((event, index) => (
          <div
            key={event.runId}
            className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px]"
          >
            <span
              className={`min-w-[70px] text-right font-mono text-[12.5px] ${
                index === 0 ? "text-fg" : "text-subtle"
              }`}
            >
              {formatPrimary(event.value)}
            </span>
            <Link
              href={`/implementations/${event.implementation.slug}`}
              className={`font-mono text-[12.5px] ${index === 0 ? "" : "text-subtle"}`}
            >
              {event.implementation.name}
            </Link>
            <span className="text-faint">
              {index === 0
                ? `current · since ${formatDateUTC(event.at)}`
                : `record ${formatDateUTC(event.at)} → ${formatDateUTC(holder.history[index - 1].at)}`}
              {event.improvementPct !== null &&
                ` · ${event.improvementPct.toFixed(1)}% faster`}
            </span>
          </div>
        ))}
        <div className="mt-3.5 flex gap-4 text-[12.5px]">
          {record.runId && (
            <Link href={`/runs/${record.runId}`}>Run dossier →</Link>
          )}
          <Link href={`/operations/${holder.operation.slug}`}>Operation</Link>
          {record.runId && holder.history.length >= 2 && (
            <Link
              href={`/compare?run=${record.runId}&run=${holder.history[1].runId}`}
            >
              Compare with previous record
            </Link>
          )}
          <Link href="/docs#records">How records are decided</Link>
        </div>
      </div>
    </details>
  )
}

function BrokenRows({ transitions }: { transitions: LedgerEvent[] }) {
  if (transitions.length === 0) {
    return (
      <p className="py-8 text-[13px] text-faint">
        No records were broken in the last 30 days under the active filters.
      </p>
    )
  }
  return (
    <div className="min-w-[980px]">
      {transitions.map(({ holder, event, previous }) => (
        <div
          key={event.runId}
          className="grid grid-cols-[minmax(260px,1.4fr)_220px_minmax(200px,1fr)_110px_130px_80px] items-center border-b border-line transition-colors hover:bg-raised"
        >
          <div className="truncate py-3.5 pr-3 font-mono text-[13px] text-fg">
            {holder.operation.name} · {holder.workloadSummary} ·{" "}
            {holder.hardware}
          </div>
          <div className="py-3.5 pr-3 font-mono text-[13.5px] whitespace-nowrap">
            <span className="text-faint">
              {event.previousValue ? formatPrimary(event.previousValue) : "—"}
            </span>{" "}
            <span className="text-ghost">→</span>{" "}
            <Link href={`/runs/${event.runId}`}>
              {formatPrimary(event.value)}
            </Link>
          </div>
          <div className="min-w-0 truncate py-3.5 pr-3">
            <Link
              href={`/implementations/${event.implementation.slug}`}
              className="font-mono text-[12.5px]"
            >
              {event.implementation.name}
            </Link>
            {previous &&
              previous.implementation.slug !== event.implementation.slug && (
                <span className="ml-2 text-[11.5px] text-faint">
                  over {previous.implementation.name}
                </span>
              )}
          </div>
          <div className="py-3.5 text-[13px] text-fg">
            {event.improvementPct !== null
              ? `${event.improvementPct.toFixed(1)}% faster`
              : "—"}
          </div>
          <div
            className={`py-3.5 text-[12.5px] ${
              isVerifiedHolder(holder) ? "text-fg" : "text-subtle"
            }`}
          >
            {evidenceLabel(holder.current.evidence)}
          </div>
          <div className="py-3.5 font-mono text-[11.5px] text-faint">
            {formatDateShort(event.at)}
          </div>
        </div>
      ))}
    </div>
  )
}

function HistoryRows({ events }: { events: LedgerEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="py-8 text-[13px] text-faint">
        No record events under the active filters.
      </p>
    )
  }
  return (
    <div>
      {events.map(({ holder, event, previous }) => (
        <div
          key={event.runId}
          className="grid grid-cols-[110px_minmax(0,1fr)] gap-5 border-b border-line transition-colors hover:bg-raised"
        >
          <div className="py-3.5 font-mono text-[12px] text-faint">
            {formatDateUTC(event.at)}
          </div>
          <div className="min-w-0 py-3.5">
            <div className="text-[13px] text-fg">
              {event.previousValue ? "Record set" : "First record"}:{" "}
              <span className="font-mono text-[12.5px]">
                {holder.operation.name} · {holder.workloadSummary} ·{" "}
                {holder.hardware}
              </span>
            </div>
            <div className="mt-1 text-[12.5px] text-subtle">
              {event.implementation.name} at{" "}
              <span className="font-mono">{formatPrimary(event.value)}</span>
              {event.previousValue && (
                <>
                  {", previously "}
                  <span className="font-mono">
                    {formatPrimary(event.previousValue)}
                  </span>
                  {previous &&
                    previous.implementation.slug !==
                      event.implementation.slug &&
                    ` held by ${previous.implementation.name}`}
                  {event.improvementPct !== null &&
                    ` (${event.improvementPct.toFixed(1)}% faster)`}
                </>
              )}
              {" · "}
              <Link href={`/runs/${event.runId}`}>Run →</Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function RecordsLedger({
  model,
  filters,
}: {
  model: RecordsPageModel
  filters: RecordsFilters
}) {
  const holders = model.records.filter((holder) => keepHolder(holder, filters))
  // "date" keeps the backend order: newest record first.
  if (filters.sort === "operation")
    holders.sort(
      (a, b) =>
        a.operation.name.localeCompare(b.operation.name, undefined, {
          numeric: true,
        }) ||
        a.workloadSummary.localeCompare(b.workloadSummary) ||
        a.hardware.localeCompare(b.hardware),
    )
  if (filters.sort === "improvement")
    holders.sort(
      (a, b) =>
        (b.history[0].improvementPct ?? -1) -
        (a.history[0].improvementPct ?? -1),
    )
  if (filters.sort === "leads")
    holders.sort(
      (a, b) =>
        b.history.length - a.history.length || b.since.localeCompare(a.since),
    )
  const events = allRecordEvents(model).filter(({ holder }) =>
    keepHolder(holder, filters),
  )
  const broken = recentlyBroken(events)
  const currentPage = paginate(holders, filters)
  const historyPage = paginate(events, filters)
  const narrowed =
    filters.filter !== "" || filters.hardware !== null || filters.verified

  return (
    <main className="shell animate-fade-in pb-20">
      {filters.view === "current" && (
        <>
          <ControlStrip
            model={model}
            filters={filters}
            status={
              <>
                <span>
                  {narrowed
                    ? `${holders.length} of ${model.records.length} records`
                    : `${model.records.length} record${model.records.length === 1 ? "" : "s"}`}
                </span>
                <span className="flex items-baseline gap-2.5">
                  <span>sorted by</span>
                  {(
                    [
                      { key: "date", label: "Newest" },
                      { key: "improvement", label: "Largest improvement" },
                      { key: "leads", label: "Most lead changes" },
                      { key: "operation", label: "A–Z" },
                    ] as const
                  ).map((option) =>
                    filters.sort === option.key ? (
                      <span key={option.key} className="text-fg">
                        {option.label}
                      </span>
                    ) : (
                      <Link
                        key={option.key}
                        href={recordsHref(filters, { sort: option.key })}
                        className="text-subtle transition-colors hover:text-fg hover:no-underline"
                      >
                        {option.label}
                      </Link>
                    ),
                  )}
                </span>
              </>
            }
          />
          <div className="overflow-x-auto">
            <div
              className={`${CURRENT_GRID} border-b border-border-strong text-[11.5px] text-faint`}
            >
              <div className="py-2">Operation / workload</div>
              <div className="py-2 pr-4 text-right">Current record</div>
              <div className="py-2">Margin</div>
              <div className="py-2">Implementation</div>
              <div className="py-2">Hardware</div>
              <div className="py-2">Evidence</div>
              <div className="py-2">Set</div>
              <div />
            </div>
            {currentPage.rows.map((holder) => (
              <HolderRow key={holder.cohortKey} holder={holder} />
            ))}
            {holders.length === 0 && (
              <p className="py-8 text-[13px] text-faint">
                No records under the active filters.
              </p>
            )}
          </div>
          {currentPage.pager}
        </>
      )}

      {filters.view === "broken" && (
        <>
          <ControlStrip
            model={model}
            filters={filters}
            status={
              <span>
                {broken.length} broken in the last 30 days · sorted by
                improvement
              </span>
            }
          />
          <div className="overflow-x-auto">
            <BrokenRows transitions={broken} />
          </div>
        </>
      )}

      {filters.view === "history" && (
        <>
          <ControlStrip
            model={model}
            filters={filters}
            status={
              <span>
                {events.length} record event{events.length === 1 ? "" : "s"} ·
                newest first
              </span>
            }
          />
          <HistoryRows events={historyPage.rows} />
          {historyPage.pager}
        </>
      )}

      <div className="mt-11 flex flex-wrap items-baseline justify-between gap-5 border-t border-border pt-5">
        <p className="text-[12.5px] text-subtle">
          Ties are preserved when the latency difference is not statistically
          defensible.{" "}
          <Link href="/docs#records">How records are decided →</Link>
        </p>
        <span className="font-mono text-[12px] text-faint">
          derived from append-only runs · nothing is ever rewritten
        </span>
      </div>
    </main>
  )
}
