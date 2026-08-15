import Link from "next/link"
import { CopyButton } from "@/components/copy-button"
import { KeyValueList } from "@/components/key-value-list"
import { Meter } from "@/components/meter"
import type {
  BrowseFamily,
  OperationIndexEntry,
  ResultRow,
  SearchPageModel,
} from "@/lib/catalog"
import {
  evidenceLabel,
  formatDateUTC,
  formatPrimary,
  formatPrimaryParts,
  formatSpread,
} from "@/lib/format"
import { meetsTrust } from "@/lib/search-query"
import { licenseMatches } from "@/server/policy/deployability"
import { availabilityText, ResultRowItem, ResultTableHead } from "./result-row"
import { SuggestInput } from "./suggest"

export type ResultMode = "exact" | "compatible" | "supported" | "reported"
export type SearchFilters = {
  view?: ResultMode
  verified: boolean
  deployable: boolean
  page?: number
}

const PAGE_SIZE = 50

const MODES: { key: ResultMode; label: string; note: string | null }[] = [
  { key: "exact", label: "Exact", note: null },
  {
    key: "compatible",
    label: "Compatible",
    note: "Nearby measured evidence. Each row lists what differs from the request.",
  },
  {
    key: "supported",
    label: "Supported",
    note: "Declared or nearby-tested support with no run on this exact workload.",
  },
  {
    key: "reported",
    label: "Reported",
    note: "Preserved as published under the source protocol; never ranked against the exact cohort.",
  },
]

const isVerified = (row: ResultRow) =>
  row.evidence === "verified" || row.evidence === "replicated"
const isDeployable = (row: ResultRow) =>
  row.install !== null && row.sourceAvailable && row.license.concluded !== null

function searchHref(
  query: string,
  filters: SearchFilters,
  patch: Partial<SearchFilters>,
) {
  // Any change other than paging restarts at page 1.
  const next = { ...filters, page: patch.page ?? 1, ...patch }
  const params = new URLSearchParams({ q: query })
  if (next.view && next.view !== "exact") params.set("view", next.view)
  if (next.verified) params.set("verified", "1")
  if (next.deployable) params.set("deployable", "1")
  if (next.page > 1) params.set("page", String(next.page))
  return `/search?${params.toString()}`
}

/** Answer heading tracks the evidence actually present — never upgraded. */
function answerLabel(row: ResultRow) {
  if (isVerified(row)) return "Fastest verified"
  if (row.evidence === "reproducible") return "Fastest reproducible"
  return "Fastest reported"
}

/** The workload context line (§16.4): quiet, technical, shown once. */
function contextLine(model: SearchPageModel) {
  const facts = model.cohort?.facts ?? []
  const wanted = ["GPU", "Workload", "CUDA", "Framework"]
  const parts = wanted
    .map((key) => facts.find((fact) => fact.key === key)?.value)
    .filter((value): value is string => Boolean(value))
  return parts.length > 0 ? parts.join(" · ") : model.interpretedQuery
}

function SearchField({
  query,
  suggest,
}: {
  query: string
  suggest: OperationIndexEntry[]
}) {
  return (
    <form
      action="/search"
      id="workload-search"
      className="well relative flex h-12 items-center gap-3 pr-3.5 pl-4"
    >
      <SuggestInput
        key={query}
        index={suggest}
        inputId="header-search-input"
        defaultValue={query}
        placeholder="Search operation, GPU, dtype, shape, framework…"
        className="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[14px] outline-none"
      />
      <kbd className="key px-[6px] py-0.5 font-mono text-[12px] text-faint">
        ⏎
      </kbd>
    </form>
  )
}

/** Filter grammar shown once on the start state; the values are syntax. */
const SYNTAX_HINTS = [
  "gpu:B200",
  "dtype:bf16",
  "shape:[2048,4096]",
  "model:deepseek-v3",
  "framework:pytorch",
  "trust:verified",
  "license:mit",
]

/** Empty-query start state (§16.5): the published corpus, ready to browse. */
function StartState({ families }: { families: BrowseFamily[] }) {
  const totalOperations = families.reduce((n, f) => n + f.operations, 0)
  const totalRuns = families.reduce((n, f) => n + f.runs, 0)
  const maxRuns = Math.max(1, ...families.map((f) => f.runs))
  const examples = families.slice(0, 2).map((f) => `${f.family} B200 bf16`)
  return (
    <section className="animate-row-in pt-6">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2 text-[13px]">
        <span className="text-faint">Try</span>
        {examples.map((example) => (
          <Link
            key={example}
            href={`/search?q=${encodeURIComponent(example)}`}
            className="font-mono text-[12.5px]"
          >
            {example}
          </Link>
        ))}
        <Link
          href="/docs#query-syntax"
          className="ml-auto text-[12.5px] text-faint"
        >
          Query syntax
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5 text-[12px]">
        <span className="text-faint">Filter with</span>
        {SYNTAX_HINTS.map((hint) => (
          <code key={hint} className="font-mono text-[11.5px] text-subtle">
            {hint}
          </code>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-4 border-b border-border-strong pb-3">
        <h2 className="text-[15px] font-medium tracking-[-0.01em]">
          Browse the index
        </h2>
        <span className="text-[12.5px] text-faint">
          {totalOperations} operations · {totalRuns} published runs
        </span>
      </div>
      <div className="grid grid-cols-[minmax(220px,1fr)_140px_220px] text-[11.5px] text-faint">
        <div className="py-2">Family</div>
        <div className="py-2 text-right">Operations</div>
        <div className="py-2 text-right">Published runs</div>
      </div>
      {families.map((entry) => (
        <Link
          key={entry.family}
          href={`/search?q=${encodeURIComponent(entry.family)}`}
          className="grid h-[47px] grid-cols-[minmax(220px,1fr)_140px_220px] items-center border-t border-line transition-colors hover:bg-raised hover:no-underline"
        >
          <span className="truncate pr-3 font-mono text-[13px] text-fg">
            {entry.family}
          </span>
          <span className="text-right font-mono text-[13px] text-muted">
            {entry.operations}
          </span>
          <span className="flex items-center justify-end gap-2.5">
            {entry.runs > 0 && (
              <Meter
                fraction={entry.runs / maxRuns}
                className="w-[96px] max-sm:hidden"
              />
            )}
            <span
              className={`min-w-[52px] text-right font-mono text-[13px] ${
                entry.runs > 0 ? "text-muted" : "text-faint"
              }`}
            >
              {entry.runs > 0 ? entry.runs : "none yet"}
            </span>
          </span>
        </Link>
      ))}
    </section>
  )
}

function Recommendation({
  top,
  model,
}: {
  top: ResultRow
  model: SearchPageModel
}) {
  const deployableAlternative = isDeployable(top)
    ? null
    : model.groups.exact.find(isDeployable)
  const fasterElsewhere = [
    ...model.groups.reported,
    ...model.groups.compatible,
  ].find(
    (row) =>
      row.primary !== null &&
      top.primary !== null &&
      row.primary.value < top.primary.value,
  )
  return (
    <section className="grid animate-row-in grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] gap-11 border-b border-border py-6 [animation-delay:.02s] max-lg:grid-cols-1">
      <div>
        <div className="font-mono text-[10px] tracking-[0.08em] text-faint uppercase">
          {answerLabel(top)}
        </div>
        <div className="mt-3 flex flex-wrap items-baseline gap-4">
          <span className="font-mono text-[34px] leading-none font-medium">
            {top.primary ? formatPrimaryParts(top.primary).value : "—"}
            {top.primary && (
              <span className="ml-1.5 text-[19px] font-normal text-subtle">
                {formatPrimaryParts(top.primary).unit}
              </span>
            )}
          </span>
          {top.primary && (
            <span className="font-mono text-[13px] text-subtle">
              {[
                formatSpread(top.primary),
                `${top.primary.statistic}${top.primary.sampleCount ? ` of ${top.primary.sampleCount}` : ""}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </div>
        <div className="mt-3">
          <Link
            href={`/implementations/${top.implementation.slug}`}
            className="font-mono text-[15px]"
          >
            {top.implementation.name}
          </Link>
          <span className="ml-2.5 text-[13px] text-subtle">
            {[
              top.project.name,
              top.license.concluded ??
                top.license.declared ??
                "License unknown",
              top.language,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <p className="mt-2 max-w-[64ch] text-[13.5px] text-muted">
          {evidenceLabel(top.evidence)} evidence · last observed{" "}
          {formatDateUTC(top.lastTestedAt)}.
          {top.caveats.length > 0 ? ` ${top.caveats.join(". ")}.` : ""}
        </p>
        {top.install ? (
          <div className="plate mt-4 flex max-w-[520px] items-center gap-2.5 py-2 pr-2 pl-3">
            <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-muted">
              {top.install.command}
            </code>
            <CopyButton text={top.install.command} />
          </div>
        ) : (
          <p className="mt-4 text-[12.5px] text-faint">
            No verified install recipe for this revision.
          </p>
        )}
        {deployableAlternative?.primary && (
          <p className="mt-3.5 text-[13px] text-subtle">
            Fastest deployable:{" "}
            <Link
              href={`/implementations/${deployableAlternative.implementation.slug}`}
              className="font-mono text-[13px]"
            >
              {deployableAlternative.implementation.name}
            </Link>{" "}
            at{" "}
            <span className="font-mono text-fg">
              {formatPrimary(deployableAlternative.primary)}
            </span>{" "}
            · {availabilityText(deployableAlternative)}
          </p>
        )}
        {fasterElsewhere?.primary && (
          <p className="mt-2 text-[13px] text-subtle">
            A faster result exists outside this cohort:{" "}
            <span className="font-mono text-fg">
              {formatPrimary(fasterElsewhere.primary)}
            </span>
            , not comparable under this protocol.{" "}
            {fasterElsewhere.runId && (
              <Link href={`/runs/${fasterElsewhere.runId}`}>View →</Link>
            )}
          </p>
        )}
      </div>
      {model.cohort && (
        <div className="border-l border-border pl-9 max-lg:border-l-0 max-lg:pl-0">
          <div className="mb-2.5 flex items-baseline justify-between gap-4 text-[12.5px] text-subtle">
            <span>
              {model.cohort.profile === "source_native"
                ? "Source-native cohort"
                : "Exact cohort"}
            </span>
            <Link href="/docs#comparability">Why comparable?</Link>
          </div>
          <KeyValueList items={model.cohort.facts} />
        </div>
      )}
    </section>
  )
}

export function SearchResults({
  model,
  filters,
  suggest = [],
}: {
  model: SearchPageModel
  filters: SearchFilters
  suggest?: OperationIndexEntry[]
}) {
  const groupsByMode: Record<ResultMode, ResultRow[]> = {
    exact: model.groups.exact,
    compatible: model.groups.compatible,
    supported: model.groups.supportedUnmeasured,
    reported: model.groups.reported,
  }
  const view =
    filters.view ??
    MODES.find((mode) => groupsByMode[mode.key].length > 0)?.key ??
    "exact"
  // Policy facets from the query (trust:, license:, source:, installable:)
  // filter rows inside a group; they never reclassify evidence (§11.4).
  const { policy } = model
  const keep = (row: ResultRow) =>
    (!filters.verified || isVerified(row)) &&
    (!filters.deployable || isDeployable(row)) &&
    meetsTrust(row.evidence, policy.minimumTrust) &&
    (policy.license === null ||
      licenseMatches(policy.license, row.license.concluded)) &&
    (!policy.requireSource || row.sourceAvailable) &&
    (!policy.requireInstallable || row.installable)
  const allRows = groupsByMode[view].filter(keep)
  const hidden = groupsByMode[view].length - allRows.length
  const pageCount = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE))
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount)
  const rows = allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const top = model.groups.exact.find(keep)
  const best = top?.primary ?? null
  const anyTie = rows.some((row) => row.tiedWithPrevious)
  const modeNote = MODES.find((mode) => mode.key === view)?.note
  // When the active view is empty, point at the nearest view that is not.
  const alternative = MODES.find(
    (mode) => mode.key !== view && groupsByMode[mode.key].length > 0,
  )

  return (
    <>
      <div className="scan-line" />

      <div className="border-b border-border bg-surface">
        <div className="shell animate-fade-in pt-5 pb-4">
          <SearchField query={model.query} suggest={suggest} />
          {(model.facets.length > 0 || model.queryIssues.length > 0) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              {model.facets.map((facet) => (
                <span
                  key={facet.token}
                  className="key inline-flex items-center gap-1.5 px-2 py-[3px] font-mono text-[11.5px] text-muted"
                >
                  {facet.display}
                  <Link
                    href={`/search?q=${encodeURIComponent(facet.removeQuery)}`}
                    aria-label={`Remove ${facet.display}`}
                    className="text-faint transition-colors hover:text-fg hover:no-underline"
                  >
                    ✕
                  </Link>
                </span>
              ))}
              {model.queryIssues.map((issue) => (
                <span key={issue.token} className="text-[12px] text-warning">
                  <span className="font-mono text-[11.5px]">{issue.token}</span>
                  {" · "}
                  {issue.message}
                </span>
              ))}
            </div>
          )}
          {model.operation !== null && (
            <>
              <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h1 className="text-[20px] leading-tight font-medium tracking-[-0.012em]">
                  {model.operation ? (
                    <Link
                      href={`/operations/${model.operation.slug}`}
                      className="text-fg transition-colors hover:text-accent-bright hover:no-underline"
                    >
                      {model.operation.name}
                    </Link>
                  ) : (
                    model.interpretedQuery
                  )}
                </h1>
                <div className="flex items-baseline gap-5 text-[12.5px]">
                  <span className="text-subtle">
                    {model.groups.exact.length} exact measurement
                    {model.groups.exact.length === 1 ? "" : "s"}
                  </span>
                  <Link href="/docs#query-syntax" className="text-faint">
                    Query syntax
                  </Link>
                </div>
              </div>
              <div className="mt-1 font-mono text-[12.5px] text-subtle">
                {contextLine(model)}
              </div>
            </>
          )}
        </div>
      </div>

      <main className="shell pb-20">
        {model.browse ? (
          <StartState families={model.browse} />
        ) : model.noResult ? (
          <section className="py-14">
            <p className="max-w-[64ch] text-[14px] text-muted">
              {model.noResult.guidance}
            </p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              {model.noResult.suggestions.map((suggestion) => (
                <Link
                  key={suggestion}
                  href={`/search?q=${encodeURIComponent(suggestion)}`}
                  className="font-mono text-[13px]"
                >
                  {suggestion}
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <>
            {top && <Recommendation top={top} model={model} />}

            <div className="mt-7 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-border-strong animate-row-in [animation-delay:.08s]">
              {MODES.map((mode) => {
                const total = groupsByMode[mode.key].length
                const selected = mode.key === view
                return (
                  <Link
                    key={mode.key}
                    href={searchHref(model.query, filters, { view: mode.key })}
                    className={`pb-[9px] text-[13.5px] transition-colors hover:text-fg hover:no-underline ${
                      selected
                        ? "-mb-px border-b border-fg font-medium text-fg"
                        : total === 0
                          ? "text-faint"
                          : "text-subtle"
                    }`}
                  >
                    {mode.label}{" "}
                    <span className="font-mono text-[11.5px] text-faint">
                      {total}
                    </span>
                  </Link>
                )
              })}
              <div className="ml-auto flex items-baseline gap-5 pb-[9px] text-[12.5px]">
                {hidden > 0 && (
                  <span className="text-faint">{hidden} hidden by filters</span>
                )}
                <Link
                  href={searchHref(model.query, filters, {
                    verified: !filters.verified,
                  })}
                  className={`transition-colors hover:text-fg hover:no-underline ${
                    filters.verified ? "text-accent" : "text-subtle"
                  }`}
                >
                  Verified only
                </Link>
                <Link
                  href={searchHref(model.query, filters, {
                    deployable: !filters.deployable,
                  })}
                  className={`transition-colors hover:text-fg hover:no-underline ${
                    filters.deployable ? "text-accent" : "text-subtle"
                  }`}
                >
                  Deployable only
                </Link>
                {view === "exact" && (
                  <span className="text-faint">Sorted by median</span>
                )}
              </div>
            </div>

            {modeNote && (
              <p className="mt-3 text-[12.5px] text-faint">{modeNote}</p>
            )}

            <div className="mt-1 animate-row-in overflow-x-auto [animation-delay:.12s]">
              {rows.length > 0 ? (
                <>
                  <ResultTableHead
                    relativeLabel={
                      view === "exact"
                        ? "vs #1"
                        : view === "compatible"
                          ? "Differs"
                          : undefined
                    }
                  />
                  {rows.map((row, index) => (
                    <ResultRowItem
                      key={row.runId ?? row.implementation.slug}
                      row={row}
                      best={best}
                      relative={view === "exact"}
                      compareWith={top?.runId ?? null}
                      tiedWithNext={
                        rows[index + 1]?.tiedWithPrevious &&
                        rows[index + 1]?.rank === row.rank
                      }
                    />
                  ))}
                </>
              ) : (
                <p className="py-8 text-[13px] text-faint">
                  No {view} results for this workload
                  {hidden > 0 ? " under the active filters" : ""}.
                  {alternative && (
                    <>
                      {" "}
                      <Link
                        href={searchHref(model.query, filters, {
                          view: alternative.key,
                        })}
                      >
                        {groupsByMode[alternative.key].length}{" "}
                        {alternative.label.toLowerCase()} result
                        {groupsByMode[alternative.key].length === 1 ? "" : "s"}{" "}
                        →
                      </Link>
                    </>
                  )}
                </p>
              )}
            </div>

            {pageCount > 1 && (
              <div className="mt-4 flex items-baseline gap-5 text-[12.5px]">
                {page > 1 ? (
                  <Link
                    href={searchHref(model.query, filters, {
                      view,
                      page: page - 1,
                    })}
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span className="text-ghost">← Previous</span>
                )}
                <span className="font-mono text-[12px] text-faint">
                  page {page} of {pageCount}
                </span>
                {page < pageCount ? (
                  <Link
                    href={searchHref(model.query, filters, {
                      view,
                      page: page + 1,
                    })}
                  >
                    Next →
                  </Link>
                ) : (
                  <span className="text-ghost">Next →</span>
                )}
              </div>
            )}

            {anyTie && (
              <p className="mt-3.5 text-[12.5px] text-faint">
                Ranks shown as N= are statistically tied: the latency difference
                interval contains zero.{" "}
                <Link href="/docs#ranking">How ranking works →</Link>
              </p>
            )}

            {model.related.length > 0 && (
              <section className="mt-12 animate-row-in [animation-delay:.16s]">
                <h2 className="text-[14px] font-medium text-muted">Related</h2>
                <div className="mt-2.5 flex flex-wrap gap-x-7 gap-y-2.5">
                  {model.related.map((item) => (
                    <span key={item.slug} className="text-[13px]">
                      {item.kind === "operation" ? (
                        <Link
                          href={`/operations/${item.slug}`}
                          className="font-mono text-[12.5px]"
                        >
                          {item.name}
                        </Link>
                      ) : (
                        <span className="font-mono text-[12.5px] text-muted">
                          {item.name}
                        </span>
                      )}
                      <span className="ml-1.5 text-faint">{item.summary}</span>
                    </span>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <div className="mt-12 flex flex-wrap items-baseline justify-between gap-5 border-t border-border pt-5">
          <p className="text-[12.5px] text-subtle">
            {model.operation
              ? "Missing an implementation for this workload? Evidence submissions open with the contribution beta."
              : "Results are ranked only inside comparable workloads and environments."}
          </p>
          {model.cohort && (
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[12px] text-faint">
                cohort {model.cohort.comparisonKey.slice(0, 23)}…
              </span>
              <CopyButton text={model.cohort.comparisonKey} />
            </div>
          )}
        </div>
        {model.sources.length > 0 && (
          <p className="mt-2 font-mono text-[11.5px] text-faint">
            {model.sources
              .map(
                (source) =>
                  `${source.name} · last observed ${formatDateUTC(source.observedAt)}`,
              )
              .join("  ·  ")}
          </p>
        )}
      </main>
    </>
  )
}
