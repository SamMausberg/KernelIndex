"use client"

// The records ledger island (§16.12): the server renders any deep-linked URL
// from its precomputed slice (SEO and no-JS unchanged), then the full model
// arrives once from the CDN-cached /records/data route and every filter,
// sort, view, and page interaction becomes an instant client transition with
// the URL kept shareable. Markup is identical to the server-rendered form.
import Link from "next/link"
import { useRouter } from "next/navigation"
import { startTransition, useEffect, useState } from "react"
import { ContextHeader } from "@/components/context-header"
import { Metric } from "@/components/metric"
import { TrustCell } from "@/components/trust"
import type { RecordHolder, RecordsPageModel } from "@/lib/catalog"
import { formatDateShort, formatDateUTC, formatPrimary } from "@/lib/format"
import {
  DAY_MS,
  type LedgerEvent,
  type LedgerSlice,
  ledgerSlice,
  type RecordsFilters,
  type RecordsView,
  recordsHref,
} from "./ledger-model"

const VIEWS: { key: RecordsView; label: string }[] = [
  { key: "current", label: "Current records" },
  { key: "broken", label: "Recently broken" },
  { key: "history", label: "Record history" },
]

// One in-flight/settled fetch of the full model per session (CDN-cached).
let modelPromise: Promise<RecordsPageModel | null> | null = null
function loadModel(): Promise<RecordsPageModel | null> {
  modelPromise ??= fetch("/records/data")
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => {
      modelPromise = null
      return null
    })
  return modelPromise
}

const CURRENT_GRID =
  "grid grid-cols-[minmax(280px,1.5fr)_170px_70px_minmax(150px,0.9fr)_156px_minmax(215px,1fr)_78px_28px] min-w-[1150px]"

/** The lead story (§16.12): the newest broken records under the filters. */
function LatestBreaks({ latest }: { latest: LedgerEvent[] }) {
  if (latest.length === 0) return null
  return (
    <div className="mt-5">
      <div className="text-[10.5px] tracking-[0.08em] text-faint uppercase">
        Latest breaks
      </div>
      <div className="mt-2 grid grid-cols-3 gap-3 max-lg:grid-cols-1">
        {latest.map(({ holder, event }) => (
          <div key={event.runId} className="plate px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[13px] text-fg">
                {holder.operation.name}
              </span>
              <span className="font-mono text-[11.5px] whitespace-nowrap text-faint">
                {formatDateShort(event.at)}
              </span>
            </div>
            <div className="mt-1.5 font-mono text-[13px]">
              <span className="text-faint">
                {event.previousValue ? formatPrimary(event.previousValue) : "—"}
              </span>{" "}
              <span className="text-ghost">→</span>{" "}
              <Link
                href={`/runs/${event.runId}`}
                prefetch={false}
                className="text-[15px] text-fg hover:text-accent-bright"
              >
                {formatPrimary(event.value)}
              </Link>
              {event.improvementPct !== null && (
                <span className="ml-2 text-[12px] text-success">
                  {event.improvementPct.toFixed(1)}%
                </span>
              )}
            </div>
            <div className="mt-1 truncate text-[12px] text-subtle">
              {event.implementation.name} · {holder.hardware}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function HolderRow({ holder }: { holder: RecordHolder }) {
  const record = holder.current
  const isNew = Date.now() - new Date(holder.since).getTime() < 14 * DAY_MS
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
        <div className="min-w-0 overflow-hidden pr-4 text-right whitespace-nowrap">
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
            prefetch={false}
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
        <div className="pr-3 font-mono text-[12px] whitespace-nowrap text-muted">
          {holder.hardware}
        </div>
        <TrustCell row={record} />
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
            className="mt-2 grid grid-cols-[92px_minmax(150px,240px)_minmax(0,1fr)] items-baseline gap-x-5 text-[12.5px] max-md:grid-cols-1 max-md:gap-y-0.5"
          >
            <span
              className={`text-right font-mono max-md:text-left ${
                index === 0 ? "text-fg" : "text-subtle"
              }`}
            >
              {formatPrimary(event.value)}
            </span>
            <Link
              href={`/implementations/${event.implementation.slug}`}
              prefetch={false}
              className={`truncate font-mono text-[12.5px] ${index === 0 ? "" : "text-subtle"}`}
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
        <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
          {record.sourceAvailable && (
            <Link
              href={`/implementations/${record.implementation.slug}#code`}
              prefetch={false}
            >
              View source →
            </Link>
          )}
          {record.runId && (
            <Link href={`/runs/${record.runId}`} prefetch={false}>
              Run dossier →
            </Link>
          )}
          <Link href={`/operations/${holder.operation.slug}`} prefetch={false}>
            Operation
          </Link>
          {record.runId && holder.history.length >= 2 && (
            <Link
              href={`/compare?run=${record.runId}&run=${holder.history[1].runId}`}
              prefetch={false}
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

const BROKEN_GRID =
  "grid grid-cols-[minmax(230px,1.4fr)_200px_minmax(160px,0.9fr)_96px_156px_minmax(205px,1fr)_78px] min-w-[1130px]"

function BrokenRows({ transitions }: { transitions: LedgerEvent[] }) {
  if (transitions.length === 0) {
    return (
      <p className="py-8 text-[13px] text-faint">
        No records were broken in the last 30 days under the active filters.
      </p>
    )
  }
  return (
    <div>
      {transitions.map(({ holder, event, previous }) => (
        <div
          key={event.runId}
          className={`${BROKEN_GRID} items-center border-b border-line transition-colors hover:bg-raised`}
        >
          <div className="min-w-0 truncate py-3.5 pr-3 text-[13px] text-fg">
            {holder.operation.name}
            <span className="ml-2 font-mono text-[11.5px] text-faint">
              {holder.workloadSummary}
            </span>
          </div>
          <div className="py-3.5 pr-3 font-mono text-[13.5px] whitespace-nowrap">
            <span className="text-faint">
              {event.previousValue ? formatPrimary(event.previousValue) : "—"}
            </span>{" "}
            <span className="text-ghost">→</span>{" "}
            <Link href={`/runs/${event.runId}`} prefetch={false}>
              {formatPrimary(event.value)}
            </Link>
          </div>
          <div className="min-w-0 truncate py-3.5 pr-3">
            <Link
              href={`/implementations/${event.implementation.slug}`}
              prefetch={false}
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
          <div className="py-3.5 pr-3 text-[13px] whitespace-nowrap text-fg">
            {event.improvementPct !== null
              ? `${event.improvementPct.toFixed(1)}%`
              : "—"}
          </div>
          <div className="py-3.5 pr-3 font-mono text-[12px] whitespace-nowrap text-muted">
            {holder.hardware}
          </div>
          <div className="py-3.5">
            <TrustCell row={holder.current} />
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
              <Link href={`/runs/${event.runId}`} prefetch={false}>
                Run →
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

type Navigate = (patch: Partial<RecordsFilters>) => void

function FilterLink({
  filters,
  patch,
  navigate,
  className,
  children,
}: {
  filters: RecordsFilters
  patch: Partial<RecordsFilters>
  navigate: Navigate
  className?: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={recordsHref(filters, patch)}
      prefetch={false}
      onClick={(event) => {
        event.preventDefault()
        navigate(patch)
      }}
      className={className}
    >
      {children}
    </Link>
  )
}

function Pager({
  page,
  pageCount,
  filters,
  navigate,
}: {
  page: number
  pageCount: number
  filters: RecordsFilters
  navigate: Navigate
}) {
  if (pageCount <= 1) return null
  return (
    <div className="mt-4 flex items-baseline gap-5 text-[12.5px]">
      {page > 1 ? (
        <FilterLink
          filters={filters}
          patch={{ page: page - 1 }}
          navigate={navigate}
        >
          ← Previous
        </FilterLink>
      ) : (
        <span className="text-ghost">← Previous</span>
      )}
      <span className="font-mono text-[12px] text-faint">
        page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <FilterLink
          filters={filters}
          patch={{ page: page + 1 }}
          navigate={navigate}
        >
          Next →
        </FilterLink>
      ) : (
        <span className="text-ghost">Next →</span>
      )}
    </div>
  )
}

/**
 * The one control strip shared by all three views: machined filter chips
 * (hardware scope, verified, has-source) and a text filter on the left; the
 * view's status and sort on the right. Every interaction resubmits every
 * other active filter so nothing resets.
 */
function ControlStrip({
  slice,
  navigate,
  status,
}: {
  slice: LedgerSlice
  navigate: Navigate
  status: React.ReactNode
}) {
  const { filters } = slice
  const chip = (selected: boolean) =>
    `key px-2.5 py-[3px] text-[12px] whitespace-nowrap hover:no-underline ${
      selected ? "key-on" : "text-subtle hover:text-fg"
    }`
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5 border-b border-border-strong pt-5 pb-3">
      <div className="flex flex-wrap items-center gap-2">
        {["All hardware", ...slice.hardwareOptions].map((label) => {
          const value = label === "All hardware" ? null : label
          return (
            <FilterLink
              key={label}
              filters={filters}
              patch={{ hardware: value }}
              navigate={navigate}
              className={chip(filters.hardware === value)}
            >
              {label}
            </FilterLink>
          )
        })}
        <span className="mx-1 h-[18px] w-px self-center bg-border" />
        <FilterLink
          filters={filters}
          patch={{ verified: !filters.verified }}
          navigate={navigate}
          className={chip(filters.verified)}
        >
          Verified
        </FilterLink>
        <FilterLink
          filters={filters}
          patch={{ source: !filters.source }}
          navigate={navigate}
          className={chip(filters.source)}
        >
          Has source
        </FilterLink>
        <form
          action="/records"
          onSubmit={(event) => {
            event.preventDefault()
            const input = event.currentTarget.elements.namedItem(
              "f",
            ) as HTMLInputElement
            navigate({ filter: input.value.trim() })
          }}
          className="well ml-1 flex h-[30px] w-[220px] items-center px-2.5"
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
          {filters.source && <input type="hidden" name="source" value="1" />}
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
          <FilterLink
            filters={filters}
            patch={{ filter: "" }}
            navigate={navigate}
            className="text-[12.5px] text-faint transition-colors hover:text-fg hover:no-underline"
          >
            Clear filter
          </FilterLink>
        )}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 text-[12.5px] text-faint">
        {status}
      </div>
    </div>
  )
}

export function RecordsLedger({ initial }: { initial: LedgerSlice }) {
  const router = useRouter()
  const [model, setModel] = useState<RecordsPageModel | null>(null)
  const [filters, setFilters] = useState(initial.filters)

  // A real navigation (new searchParams) resets the island to the server's
  // slice; interactions after the model loads never navigate.
  const initialKey = recordsHref(initial.filters, {
    page: initial.filters.page,
  })
  const [lastKey, setLastKey] = useState(initialKey)
  if (initialKey !== lastKey) {
    setLastKey(initialKey)
    setFilters(initial.filters)
  }

  useEffect(() => {
    loadModel().then((loaded) => {
      if (loaded) setModel(loaded)
    })
  }, [])

  const navigate: Navigate = (patch) => {
    if (model === null) {
      router.push(recordsHref(filters, patch))
      return
    }
    const next = { ...filters, page: patch.page ?? 1, ...patch }
    startTransition(() => setFilters(next))
    window.history.replaceState(
      null,
      "",
      recordsHref(next, { page: next.page }),
    )
  }

  const slice = model !== null ? ledgerSlice(model, filters) : initial
  const narrowed =
    slice.filters.filter !== "" ||
    slice.filters.hardware !== null ||
    slice.filters.verified ||
    slice.filters.source

  return (
    <>
      <ContextHeader
        title="Performance records"
        context={slice.context}
        meta={VIEWS.map((view) => (
          <FilterLink
            key={view.key}
            filters={slice.filters}
            patch={{ view: view.key }}
            navigate={navigate}
            className={`whitespace-nowrap transition-colors hover:text-fg hover:no-underline ${
              slice.filters.view === view.key ? "text-fg" : "text-subtle"
            }`}
          >
            {view.label}{" "}
            <span className="font-mono text-[11px] text-faint">
              {slice.counts[view.key]}
            </span>
          </FilterLink>
        ))}
      >
        <p className="mt-1.5 text-[13px] text-subtle">
          A record exists only inside an exactly comparable cohort: one
          workload, protocol, and environment at a time. There is no global
          fastest kernel.
        </p>
      </ContextHeader>

      <main className="shell animate-fade-in pb-20">
        {slice.filters.view === "current" && slice.holders && (
          <>
            {slice.latest && <LatestBreaks latest={slice.latest} />}
            <ControlStrip
              slice={slice}
              navigate={navigate}
              status={
                <>
                  <span>
                    {narrowed
                      ? `${slice.holders.total} of ${slice.recordsTotal} records`
                      : `${slice.recordsTotal} record${slice.recordsTotal === 1 ? "" : "s"}`}
                  </span>
                  <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <span className="whitespace-nowrap">sorted by</span>
                    {(
                      [
                        { key: "date", label: "Newest" },
                        { key: "improvement", label: "Largest improvement" },
                        { key: "leads", label: "Most lead changes" },
                        { key: "operation", label: "A–Z" },
                      ] as const
                    ).map((option) =>
                      slice.filters.sort === option.key ? (
                        <span
                          key={option.key}
                          className="whitespace-nowrap text-fg"
                        >
                          {option.label}
                        </span>
                      ) : (
                        <FilterLink
                          key={option.key}
                          filters={slice.filters}
                          patch={{ sort: option.key }}
                          navigate={navigate}
                          className="whitespace-nowrap text-subtle transition-colors hover:text-fg hover:no-underline"
                        >
                          {option.label}
                        </FilterLink>
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
                <div className="py-2">Trust</div>
                <div className="py-2">Set</div>
                <div />
              </div>
              {slice.holders.rows.map((holder) => (
                <HolderRow key={holder.cohortKey} holder={holder} />
              ))}
              {slice.holders.total === 0 && (
                <p className="py-8 text-[13px] text-faint">
                  No records under the active filters.
                </p>
              )}
            </div>
            <Pager
              page={slice.filters.page}
              pageCount={slice.holders.pageCount}
              filters={slice.filters}
              navigate={navigate}
            />
          </>
        )}

        {slice.filters.view === "broken" && slice.broken && (
          <>
            <ControlStrip
              slice={slice}
              navigate={navigate}
              status={
                <span>
                  {slice.broken.length} broken in the last 30 days · sorted by
                  improvement
                </span>
              }
            />
            <div className="overflow-x-auto">
              <BrokenRows transitions={slice.broken} />
            </div>
          </>
        )}

        {slice.filters.view === "history" && slice.events && (
          <>
            <ControlStrip
              slice={slice}
              navigate={navigate}
              status={
                <span>
                  {slice.events.total} record event
                  {slice.events.total === 1 ? "" : "s"} · newest first
                </span>
              }
            />
            <HistoryRows events={slice.events.rows} />
            <Pager
              page={slice.filters.page}
              pageCount={slice.events.pageCount}
              filters={slice.filters}
              navigate={navigate}
            />
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
    </>
  )
}
