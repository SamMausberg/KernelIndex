"use client"

import { startTransition, useEffect, useState } from "react"
import { ContextHeader } from "@/components/context-header"
import { Metric } from "@/components/metric"
// The records ledger island (§16.12): the server renders any deep-linked URL
// from its precomputed slice (SEO and no-JS unchanged), then the full model
// arrives once from the CDN-cached /records/data route and every filter,
// sort, view, and page interaction becomes an instant client transition with
// the URL kept shareable. Markup is identical to the server-rendered form.
import { Link } from "@/components/quiet-link"
import { AvailabilityCell, EvidenceCell } from "@/components/trust"
import { formatDateUTC, formatPrimary, formatSolScoreCell } from "@/lib/format"
import {
  DAY_MS,
  filtersFromParams,
  type LedgerEvent,
  type LedgerHolder,
  type LedgerModel,
  type LedgerSlice,
  ledgerSlice,
  type RecordsFilters,
  type RecordsView,
  recordsHref,
} from "./ledger-model"
import { RecordTimeline } from "./timeline"

const VIEWS: { key: RecordsView; label: string }[] = [
  { key: "current", label: "Current records" },
  { key: "broken", label: "Recently broken" },
  { key: "history", label: "Record history" },
]

// One in-flight/settled fetch of the full model per session (CDN-cached).
let modelPromise: Promise<LedgerModel | null> | null = null
function loadModel(): Promise<LedgerModel | null> {
  modelPromise ??= fetch("/records/data")
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => {
      modelPromise = null
      return null
    })
  return modelPromise
}

const CURRENT_GRID =
  "grid grid-cols-[minmax(280px,1.5fr)_170px_150px_minmax(150px,0.9fr)_156px_92px_minmax(150px,1fr)_92px_28px] min-w-[1254px]"

/** The lead story (§16.12): the newest broken records under the filters —
 * hairline rows in the page's own table idiom, no cards or lifted surfaces.
 * The whole row reaches the record's run. */
function LatestBreaks({ latest }: { latest: LedgerEvent[] }) {
  if (latest.length === 0) return null
  return (
    <div className="mt-5">
      <div className="text-label text-faint uppercase">Latest breaks</div>
      <div className="mt-1.5 overflow-x-auto border-t border-border-strong">
        {latest.map(({ holder, event }) => (
          <div
            key={event.runId}
            className="relative grid min-w-[900px] grid-cols-[minmax(240px,1.2fr)_260px_minmax(200px,1fr)_92px] items-baseline gap-x-6 border-b border-line py-2.5 transition-colors hover:bg-raised"
          >
            <Link
              href={`/runs/${event.runId}`}
              prefetch={false}
              aria-label={`Record run for ${holder.operation.name}`}
              className="absolute inset-0"
            />
            <span className="truncate text-body text-fg">
              {holder.operation.name}
              <span className="ml-2 font-mono text-mini text-faint">
                {holder.workloadSummary}
              </span>
            </span>
            <span className="font-mono text-body whitespace-nowrap">
              <span className="text-faint">
                {event.previousValue ? formatPrimary(event.previousValue) : "—"}
              </span>{" "}
              <span className="text-ghost">→</span>{" "}
              <span className="text-fg">{formatPrimary(event.value)}</span>
              {event.improvementPct !== null && (
                <span className="ml-2 text-small text-success">
                  {event.improvementPct.toFixed(1)}%
                </span>
              )}
            </span>
            <span className="truncate text-small text-subtle">
              {event.implementation.name} · {holder.hardware}
            </span>
            <span className="text-right font-mono text-mini whitespace-nowrap text-faint">
              {formatDateUTC(event.at)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function HolderRow({ holder }: { holder: LedgerHolder }) {
  const record = holder.current
  const isNew = Date.now() - new Date(holder.since).getTime() < 14 * DAY_MS
  const margin = holder.history[0].improvementPct
  // The full timeline lives in the Record history view; rendering it for
  // every collapsed row made the page's payload (§16.12 payload budget).
  const timeline = holder.history.slice(0, 6)
  const earlier = holder.history.length - timeline.length
  return (
    <details className="group row-cv border-b border-line">
      <summary
        className={`${CURRENT_GRID} h-12 cursor-pointer list-none items-center transition-colors hover:bg-raised [&::-webkit-details-marker]:hidden`}
      >
        <div className="min-w-0 truncate pr-3">
          <span className="text-body text-fg">{holder.operation.name}</span>
          <span className="ml-2 font-mono text-mini text-faint">
            {holder.workloadSummary}
          </span>
        </div>
        <div className="min-w-0 overflow-hidden pr-4 text-right whitespace-nowrap">
          <Metric
            primary={record.primary}
            spread
            secondary={
              record.solScore !== null
                ? formatSolScoreCell(record.solScore)
                : null
            }
            valueClassName="font-mono text-body text-fg"
          />
        </div>
        <div className="truncate pr-3 font-mono text-small whitespace-nowrap">
          {margin !== null ? (
            <span className="text-subtle">
              {margin.toFixed(1)}%
              {holder.history[0]?.previousValue && (
                <span className="text-faint">
                  {" "}
                  · was {formatPrimary(holder.history[0].previousValue)}
                </span>
              )}
            </span>
          ) : record.baseline ? (
            <span className="text-faint">baseline · unbeaten</span>
          ) : (
            <span className="text-faint">first</span>
          )}
        </div>
        <div className="min-w-0 truncate pr-3">
          <Link
            href={`/implementations/${record.implementation.slug}`}
            prefetch={false}
            className="text-body"
          >
            {record.implementation.name}
          </Link>
          {record.baseline && (
            <span className="ml-2 font-mono text-label text-faint uppercase">
              baseline
            </span>
          )}
          {record.project.name !== record.implementation.name && (
            <span className="ml-2 text-small text-faint">
              {record.project.name}
            </span>
          )}
        </div>
        <div className="pr-3 font-mono text-small whitespace-nowrap text-muted">
          {holder.hardware}
        </div>
        <EvidenceCell row={record} />
        <AvailabilityCell row={record} />
        <div className="font-mono text-mini whitespace-nowrap text-faint">
          {formatDateUTC(holder.since)}
          {isNew && <span className="text-accent"> · new</span>}
        </div>
        <div
          aria-hidden="true"
          className="pr-1 text-right font-mono text-small text-faint transition-transform group-open:rotate-90"
        >
          ›
        </div>
      </summary>
      <div className="border-t border-line bg-surface pb-4">
        <div className="pt-3 font-mono text-mini text-faint">
          {holder.environmentSummary}
        </div>
        <div className="mt-3 text-label text-faint uppercase">
          Record history
        </div>
        {/* Day-quantized "now": identical between server render and
            hydration, so the step coordinates never mismatch. */}
        <div className="mt-2">
          <RecordTimeline
            history={holder.history}
            now={Math.floor(Date.now() / DAY_MS) * DAY_MS}
          />
        </div>
        {timeline.map((event, index) => (
          <div
            key={event.runId}
            className="mt-2 grid grid-cols-[92px_minmax(150px,240px)_minmax(0,1fr)] items-baseline gap-x-5 text-small max-md:grid-cols-1 max-md:gap-y-0.5"
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
              className={`truncate font-mono text-small ${index === 0 ? "" : "text-subtle"}`}
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
        {earlier > 0 && (
          <p className="mt-2 text-small text-faint">
            {earlier} earlier event{earlier === 1 ? "" : "s"} in{" "}
            <Link
              href={`/records?view=history&f=${encodeURIComponent(holder.operation.name)}`}
              prefetch={false}
            >
              Record history
            </Link>
            .
          </p>
        )}
        <div className="mt-3.5 flex flex-wrap items-baseline gap-x-5 gap-y-1">
          {record.sourceAvailable && (
            <Link
              href={`/implementations/${record.implementation.slug}#code`}
              prefetch={false}
              className="action"
            >
              View source →
            </Link>
          )}
          {record.runId && (
            <Link
              href={`/runs/${record.runId}`}
              prefetch={false}
              className="action"
            >
              Run dossier →
            </Link>
          )}
          <Link
            href={`/operations/${holder.operation.slug}`}
            prefetch={false}
            className="action"
          >
            Operation →
          </Link>
          {record.runId && holder.history.length >= 2 && (
            <Link
              href={`/compare?run=${record.runId}&run=${holder.history[1].runId}`}
              prefetch={false}
              className="action"
            >
              Compare with previous record →
            </Link>
          )}
          <Link href="/docs#records" className="text-small">
            How records are decided
          </Link>
        </div>
      </div>
    </details>
  )
}

const BROKEN_GRID =
  "grid grid-cols-[minmax(230px,1.4fr)_200px_minmax(160px,0.9fr)_96px_156px_92px_minmax(150px,1fr)_92px] min-w-[1184px]"

function BrokenRows({ transitions }: { transitions: LedgerEvent[] }) {
  if (transitions.length === 0) {
    return (
      <p className="py-8 text-body text-faint">
        No records broken in the last 30 days with these filters.
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
          <div className="min-w-0 truncate py-3.5 pr-3 text-body text-fg">
            {holder.operation.name}
            <span className="ml-2 font-mono text-mini text-faint">
              {holder.workloadSummary}
            </span>
          </div>
          <div className="py-3.5 pr-3 font-mono text-body whitespace-nowrap">
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
              className="font-mono text-small"
            >
              {event.implementation.name}
            </Link>
            {previous &&
              previous.implementation.slug !== event.implementation.slug && (
                <span className="ml-2 text-mini text-faint">
                  over {previous.implementation.name}
                </span>
              )}
          </div>
          <div className="py-3.5 pr-3 text-body whitespace-nowrap text-fg">
            {event.improvementPct !== null
              ? `${event.improvementPct.toFixed(1)}%`
              : "—"}
          </div>
          <div className="py-3.5 pr-3 font-mono text-small whitespace-nowrap text-muted">
            {holder.hardware}
          </div>
          <div className="py-3.5">
            <EvidenceCell row={holder.current} />
          </div>
          <div className="py-3.5">
            <AvailabilityCell row={holder.current} />
          </div>
          <div className="py-3.5 font-mono text-mini text-faint">
            {formatDateUTC(event.at)}
          </div>
        </div>
      ))}
    </div>
  )
}

function HistoryRows({ events }: { events: LedgerEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="py-8 text-body text-faint">
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
          <div className="py-3.5 font-mono text-small text-faint">
            {formatDateUTC(event.at)}
          </div>
          <div className="min-w-0 py-3.5">
            <div className="text-body text-fg">
              {event.previousValue ? "Record set" : "First record"}:{" "}
              <span className="font-mono text-small">
                {holder.operation.name} · {holder.workloadSummary} ·{" "}
                {holder.hardware}
              </span>
            </div>
            <div className="mt-1 text-small text-subtle">
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
    <div className="mt-4 flex items-baseline gap-5 text-small">
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
      <span className="font-mono text-small text-faint">
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
    `key text-small whitespace-nowrap hover:no-underline ${
      selected ? "key-on" : "text-subtle hover:text-fg"
    }`
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5 border-b border-border-strong pt-5 pb-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* GPU scope as one expanding control; per-GPU record counts live
            in the options where they answer "what would I get". */}
        <details
          className="group relative"
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              event.currentTarget.removeAttribute("open")
          }}
        >
          <summary
            className={`${chip(filters.hardware !== null)} flex cursor-pointer items-center gap-2 py-1 [&::-webkit-details-marker]:hidden`}
          >
            <span className="text-faint">Hardware</span>
            <span>{filters.hardware ?? "All"}</span>
            <span
              aria-hidden="true"
              className="font-mono text-mini text-faint transition-transform group-open:rotate-90"
            >
              ›
            </span>
          </summary>
          <div className="absolute top-[calc(100%+6px)] left-0 z-40 min-w-[250px] overflow-hidden rounded-md border border-edge bg-raised py-1">
            {[null, ...slice.hardwareOptions].map((value) => {
              const selected = filters.hardware === value
              return (
                <Link
                  key={value ?? "all"}
                  href={recordsHref(filters, { hardware: value })}
                  prefetch={false}
                  onClick={(event) => {
                    event.preventDefault()
                    event.currentTarget
                      .closest("details")
                      ?.removeAttribute("open")
                    navigate({ hardware: value })
                  }}
                  className={`flex items-baseline justify-between gap-6 px-3 py-1.5 text-small hover:bg-accent-soft hover:no-underline ${
                    selected ? "text-fg" : "text-subtle"
                  }`}
                >
                  <span className="whitespace-nowrap">
                    {value ?? "All hardware"}
                  </span>
                  <span className="font-mono text-mini text-faint">
                    {value === null
                      ? slice.recordsTotal
                      : (slice.hardwareCounts[value] ?? 0)}
                  </span>
                </Link>
              )
            })}
          </div>
        </details>
        {slice.verifiedCount > 0 || filters.verified ? (
          <FilterLink
            filters={filters}
            patch={{ verified: !filters.verified }}
            navigate={navigate}
            className={chip(filters.verified)}
          >
            Verified{" "}
            <span className="font-mono text-mini text-faint">
              {slice.verifiedCount}
            </span>
          </FilterLink>
        ) : (
          <span
            title="No independently verified records yet — every result is source-reported"
            className="key text-small whitespace-nowrap text-ghost"
          >
            Verified <span className="font-mono text-mini">0</span>
          </span>
        )}
        <FilterLink
          filters={filters}
          patch={{ source: !filters.source }}
          navigate={navigate}
          className={chip(filters.source)}
        >
          Has source
        </FilterLink>
        {slice.baselineCount > 0 && (
          <FilterLink
            filters={filters}
            patch={{ baselines: !filters.baselines }}
            navigate={navigate}
            className={chip(filters.baselines)}
          >
            Unbeaten baselines{" "}
            <span className="font-mono text-mini text-faint">
              {slice.baselineCount}
            </span>
          </FilterLink>
        )}
        <form
          action="/records"
          onSubmit={(event) => {
            event.preventDefault()
            const input = event.currentTarget.elements.namedItem(
              "f",
            ) as HTMLInputElement
            navigate({ filter: input.value.trim() })
          }}
          className="well ml-1 flex h-8 w-[220px] items-center px-2.5"
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
          {!filters.source && <input type="hidden" name="source" value="0" />}
          {filters.baselines && (
            <input type="hidden" name="baselines" value="1" />
          )}
          {filters.sort !== "contested" && (
            <input type="hidden" name="sort" value={filters.sort} />
          )}
          <input
            name="f"
            defaultValue={filters.filter}
            placeholder="Filter operation or kernel"
            aria-label="Filter records"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-small outline-none"
          />
        </form>
        {filters.filter !== "" && (
          <FilterLink
            filters={filters}
            patch={{ filter: "" }}
            navigate={navigate}
            className="text-small text-faint transition-colors hover:text-fg hover:no-underline"
          >
            Clear filter
          </FilterLink>
        )}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 text-small text-faint">
        {status}
      </div>
    </div>
  )
}

export function RecordsLedger({ initial }: { initial: LedgerSlice }) {
  // The page is ISR: the server always renders the default slice and the
  // island owns the URL. Deep-linked filters apply right after hydration
  // (window.location, not useSearchParams — that would drop the table out
  // of the static HTML). Interactions never navigate.
  const [model, setModel] = useState<LedgerModel | null>(null)
  const [filters, setFilters] = useState(initial.filters)

  // The full model loads on first interaction intent, not on mount: most
  // visits only read the server-rendered slice and skip the download.
  const prime = () => {
    loadModel().then((loaded) => {
      if (loaded) setModel(loaded)
    })
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only URL read; loadModel is module-memoized
  useEffect(() => {
    if (window.location.search === "") return
    setFilters(filtersFromParams(new URLSearchParams(window.location.search)))
    prime()
  }, [])

  const navigate: Navigate = (patch) => {
    const next = { ...filters, page: patch.page ?? 1, ...patch }
    if (model === null) prime()
    startTransition(() => setFilters(next))
    window.history.replaceState(
      null,
      "",
      recordsHref(next, { page: next.page }),
    )
  }

  // An unknown hardware filter falls back to "all" once the model can
  // validate it, matching what the server used to do.
  const effective =
    model !== null &&
    filters.hardware !== null &&
    !model.hardwareOptions.includes(filters.hardware)
      ? { ...filters, hardware: null }
      : filters
  const slice = model !== null ? ledgerSlice(model, effective) : initial
  const narrowed =
    slice.filters.filter !== "" ||
    slice.filters.hardware !== null ||
    slice.filters.verified ||
    slice.filters.source

  return (
    <div onPointerEnter={prime} onFocusCapture={prime}>
      <ContextHeader
        title="Performance records"
        context={slice.context}
        meta={[
          ...VIEWS.map((view) => (
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
              <span className="font-mono text-mini text-subtle">
                {slice.counts[view.key]}
              </span>
            </FilterLink>
          )),
          // Record changes as Atom (Week 12): subscribe without an account.
          <a
            key="feed"
            href="/records/feed.xml"
            className="whitespace-nowrap text-subtle transition-colors hover:text-fg hover:no-underline"
          >
            Feed
          </a>,
        ]}
      />

      <main className="shell animate-fade-in pb-24">
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
                        { key: "contested", label: "Contested" },
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
                className={`${CURRENT_GRID} border-b border-border-strong text-mini text-faint`}
              >
                <div className="py-2">Operation / workload</div>
                <div className="py-2 pr-4 text-right">Current record</div>
                <div className="py-2">Margin</div>
                <div className="py-2">Implementation</div>
                <div className="py-2">Hardware</div>
                <div className="py-2">Evidence</div>
                <div className="py-2">Availability</div>
                <div className="py-2">Set</div>
                <div />
              </div>
              {slice.holders.rows.map((holder) => (
                <HolderRow key={holder.cohortKey} holder={holder} />
              ))}
              {slice.holders.total === 0 && (
                <p className="py-8 text-body text-faint">
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
                  {slice.broken.total} broken in the last 30 days · sorted by
                  improvement
                </span>
              }
            />
            <div className="overflow-x-auto">
              <BrokenRows transitions={slice.broken.rows} />
            </div>
            <Pager
              page={slice.filters.page}
              pageCount={slice.broken.pageCount}
              filters={slice.filters}
              navigate={navigate}
            />
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
          <p className="text-small text-subtle">
            Runs too close to call share a rank.{" "}
            <Link href="/docs#records">How records are decided →</Link>
          </p>
          <span className="font-mono text-small text-faint">
            history only grows · <Link href="/legal">data licenses</Link>
          </span>
        </div>
      </main>
    </div>
  )
}
