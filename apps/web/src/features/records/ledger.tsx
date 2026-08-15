import Link from "next/link"
import type { RecordEvent, RecordHolder, RecordsPageModel } from "@/lib/catalog"
import {
  evidenceLabel,
  formatDateShort,
  formatDateUTC,
  formatPrimary,
  formatSpread,
} from "@/lib/format"

export type RecordsView = "current" | "broken" | "history"
export type RecordsFilters = {
  view: RecordsView
  hardware: string | null
  verified: boolean
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
  if (next.page > 1) params.set("page", String(next.page))
  const suffix = params.toString()
  return suffix ? `/records?${suffix}` : "/records"
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

const isVerifiedHolder = (holder: RecordHolder) =>
  holder.current.evidence === "verified" ||
  holder.current.evidence === "replicated"

const CURRENT_GRID =
  "grid grid-cols-[minmax(280px,1.5fr)_160px_minmax(220px,1.2fr)_130px_120px_96px_28px] min-w-[1120px]"

function HolderRow({ holder }: { holder: RecordHolder }) {
  const record = holder.current
  const isNew = Date.now() - new Date(holder.since).getTime() < 14 * DAY_MS
  const strong = isVerifiedHolder(holder)
  return (
    <details className="group border-b border-line">
      <summary
        className={`${CURRENT_GRID} cursor-pointer list-none items-start transition-colors hover:bg-raised [&::-webkit-details-marker]:hidden`}
      >
        <div className="min-w-0 py-3 pr-3">
          <div className="truncate font-mono text-[13px] leading-[20px] text-fg">
            {holder.operation.name} · {holder.workloadSummary}
          </div>
          <div className="truncate font-mono text-[11.5px] leading-4 text-faint">
            {holder.environmentSummary}
          </div>
        </div>
        <div className="py-3 pr-4 text-right whitespace-nowrap">
          <span className="block font-mono text-[14.5px] leading-[20px] text-fg">
            {record.primary ? formatPrimary(record.primary) : "—"}
          </span>
          {/* Fixed height with or without a spread: every record cell is
              exactly two lines, so row rhythm never drifts. */}
          <div className="h-4 font-mono text-[11px] leading-4 text-faint">
            {record.primary ? formatSpread(record.primary) : null}
          </div>
        </div>
        <div className="min-w-0 truncate py-3 pr-3 leading-[20px]">
          <Link
            href={`/implementations/${record.implementation.slug}`}
            className="font-mono text-[13px]"
          >
            {record.implementation.name}
          </Link>
          <span className="ml-2 text-[12px] text-faint">
            {record.project.name}
          </span>
        </div>
        <div className="truncate py-3 pr-3 font-mono text-[12px] leading-[20px] text-muted">
          {holder.hardware}
        </div>
        <div
          className={`py-3 text-[12.5px] leading-[20px] ${strong ? "text-fg" : "text-subtle"}`}
        >
          {strong && <span className="mr-1.5 text-[9px] text-success">●</span>}
          {evidenceLabel(record.evidence)}
        </div>
        <div className="py-3 font-mono text-[11.5px] leading-[20px] whitespace-nowrap text-faint">
          {formatDateShort(holder.since)}
          {isNew && <span className="text-accent"> · new</span>}
        </div>
        <div
          aria-hidden="true"
          className="py-3 pr-1 text-right font-mono text-[12px] leading-[20px] text-faint transition-transform group-open:rotate-90"
        >
          ›
        </div>
      </summary>
      <div className="border-t border-line bg-surface pb-4">
        <div className="pt-3 text-[11.5px] tracking-[0.03em] text-faint uppercase">
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

function BrokenRows({
  transitions,
}: {
  transitions: { holder: RecordHolder; event: RecordEvent }[]
}) {
  if (transitions.length === 0) {
    return (
      <p className="py-8 text-[13px] text-faint">
        No records were broken in the last 30 days.
      </p>
    )
  }
  return (
    <div className="min-w-[980px]">
      {transitions.map(({ holder, event }) => (
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
          <div className="truncate py-3.5 pr-3">
            <Link
              href={`/implementations/${event.implementation.slug}`}
              className="font-mono text-[12.5px]"
            >
              {event.implementation.name}
            </Link>
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

function HistoryRows({
  events,
}: {
  events: { holder: RecordHolder; event: RecordEvent }[]
}) {
  return (
    <div>
      {events.map(({ holder, event }) => (
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
  const holders = model.records.filter(
    (holder) =>
      (filters.hardware === null || holder.hardware === filters.hardware) &&
      (!filters.verified || isVerifiedHolder(holder)),
  )
  const currentPage = paginate(holders, filters)
  const allEvents = model.records
    .flatMap((holder) => holder.history.map((event) => ({ holder, event })))
    .sort((a, b) => b.event.at.localeCompare(a.event.at))
  const historyPage = paginate(allEvents, filters)
  const broken = allEvents
    .filter(
      ({ event }) =>
        event.previousValue !== null &&
        Date.now() - new Date(event.at).getTime() < 30 * DAY_MS,
    )
    .sort(
      (a, b) => (b.event.improvementPct ?? 0) - (a.event.improvementPct ?? 0),
    )

  return (
    <main className="shell animate-fade-in pb-20">
      {filters.view === "current" && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-5 border-b border-border-strong pt-5 pb-3">
            <div className="flex items-baseline gap-[18px] text-[12.5px]">
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
            </div>
            <span className="text-[12.5px] text-faint">
              {holders.length} record{holders.length === 1 ? "" : "s"} · sorted
              by record date
            </span>
          </div>
          <div className="overflow-x-auto">
            <div
              className={`${CURRENT_GRID} border-b border-border-strong text-[11.5px] text-faint`}
            >
              <div className="py-2">Operation / workload</div>
              <div className="py-2 pr-4 text-right">Current record</div>
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
        <div className="overflow-x-auto pt-4">
          <p className="border-b border-border-strong pb-3 text-[12.5px] text-faint">
            Records broken in the last 30 days · sorted by improvement
          </p>
          <BrokenRows transitions={broken} />
        </div>
      )}

      {filters.view === "history" && (
        <div className="pt-4">
          <p className="border-b border-border-strong pb-3 text-[12.5px] text-faint">
            Append-only ledger of record events · newest first
          </p>
          <HistoryRows events={historyPage.rows} />
          {historyPage.pager}
        </div>
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
