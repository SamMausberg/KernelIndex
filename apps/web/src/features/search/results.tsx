"use client"

import { Fragment, startTransition, useState } from "react"
import { ApiLink } from "@/components/api-link"
import { FilterChip } from "@/components/chip"
import { CopyButton } from "@/components/copy-button"
import { Pager } from "@/components/pager"
import { Link } from "@/components/quiet-link"
import { ResolverTabs } from "@/components/resolver-tabs"
import { FollowButton } from "@/features/follow/follow-button"
import type { ResultRow, SearchPageModel } from "@/lib/catalog"
import { formatDateUTC, formatPrimary } from "@/lib/format"
import { meetsTrust, removeToken } from "@/lib/search-query"
import { TRUST_TIERS, trustTier } from "@/lib/trust-tier"
import { licenseMatches } from "@/server/policy/deployability"
import { NearestMeasured } from "./nearest"
import { Recommendation } from "./recommendation"
import { RequestWorkload } from "./request-button"
import { ResultRowItem, ResultTableHead } from "./result-row"
import { type BrowseFilters, OperationList, StartState } from "./start-state"
import { SuggestInput } from "./suggest"

export type ResultMode = "exact" | "compatible" | "supported" | "reported"
export type ResultSort = "recommended" | "newest"
export type SearchFilters = {
  /** The pinned comparison cohort; a server-side selection, never toggled
   * client-side, so it rides every href unchanged. */
  cohort?: string
  view?: ResultMode
  sort?: ResultSort
  verified: boolean
  /** One-click availability filters (§16.7): rows lacking the fact drop. */
  source: boolean
  license: boolean
  installable: boolean
  page?: number
}

const PAGE_SIZE = 50

const SORTS: { key: ResultSort; label: string }[] = [
  { key: "recommended", label: "Recommended" },
  { key: "newest", label: "Newest" },
]

const rowTier = (row: ResultRow) =>
  trustTier({
    evidence: row.evidence,
    sourceAvailable: row.sourceAvailable,
    license: row.license.concluded ?? row.license.declared,
  })

/**
 * Presentation reorder inside one already-grouped view. "Recommended" is a
 * stable best-tier-first sort — inside a tier the group's native order
 * (ranking-v1 for the exact cohort) is untouched, so rank numbers keep
 * their cohort meaning and a uniform-tier corpus renders unchanged.
 */
function sortRows(rows: ResultRow[], sort: ResultSort): ResultRow[] {
  const sorted = [...rows]
  if (sort === "recommended") sorted.sort((a, b) => rowTier(a) - rowTier(b))
  if (sort === "newest")
    sorted.sort((a, b) =>
      (b.lastTestedAt ?? "").localeCompare(a.lastTestedAt ?? ""),
    )
  return sorted
}

const MODES: { key: ResultMode; label: string; note: string | null }[] = [
  { key: "exact", label: "Exact", note: null },
  {
    key: "compatible",
    label: "Compatible",
    note: "Close matches. Each row lists what differs.",
  },
  {
    key: "supported",
    label: "Supported",
    note: "Claims support; no run on this exact workload yet.",
  },
  {
    key: "reported",
    // "Other cohorts", not "Reported": the view groups source-protocol
    // cohorts, while Reported names an evidence level — one word, one meaning.
    label: "Other protocols",
    note: "Measured under a different protocol. Shown as published, never ranked against exact rows.",
  },
]

const isVerified = (row: ResultRow) =>
  row.evidence === "verified" || row.evidence === "replicated"

/** The clickable availability filters (§16.7), each one observable fact. */
const CHIP_FILTERS: {
  key: "source" | "license" | "installable" | "verified"
  label: string
  test: (row: ResultRow) => boolean
}[] = [
  { key: "source", label: "Has source", test: (row) => row.sourceAvailable },
  {
    key: "license",
    label: "License known",
    test: (row) => (row.license.concluded ?? row.license.declared) !== null,
  },
  { key: "installable", label: "Installable", test: (row) => row.installable },
  { key: "verified", label: "Verified", test: isVerified },
]

function searchHref(
  query: string,
  filters: SearchFilters,
  patch: Partial<SearchFilters>,
) {
  // Any change other than paging restarts at page 1.
  const next = { ...filters, page: patch.page ?? 1, ...patch }
  const params = new URLSearchParams({ q: query })
  if (next.cohort) params.set("cohort", next.cohort)
  if (next.view && next.view !== "exact") params.set("view", next.view)
  if (next.sort && next.sort !== "recommended") params.set("sort", next.sort)
  if (next.verified) params.set("verified", "1")
  // Source-backed is the default state; only widening needs a param.
  if (!next.source) params.set("source", "0")
  if (next.license) params.set("license", "1")
  if (next.installable) params.set("installable", "1")
  if (next.page > 1) params.set("page", String(next.page))
  return `/search?${params.toString()}`
}

/** The API twin of the current search, including the pinned cohort. */
function apiPath(query: string, cohort: string | undefined) {
  const params = new URLSearchParams({ q: query })
  if (cohort) params.set("cohort", cohort)
  return `/api/v1/search?${params.toString()}`
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

function SearchField({ query }: { query: string }) {
  return (
    <form
      action="/search"
      id="workload-search"
      className="well relative flex h-12 items-center gap-3 pr-3.5 pl-4"
    >
      <SuggestInput
        inputId="header-search-input"
        defaultValue={query}
        placeholder="Search operation, GPU, dtype, shape, framework…"
        className="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-body outline-none"
      />
      <kbd className="key px-1.5 py-0.5 font-mono text-small text-faint">⏎</kbd>
    </form>
  )
}

/**
 * The band the search field lives in. Shared with the page's Suspense
 * fallback so a cold query never swaps geometry: the field a visitor just
 * typed into keeps its position and its value while the resolver works, and
 * only the body beneath it is replaced by skeleton rows. Everything derived
 * from the resolved model rides in as children.
 */
export function SearchBand({
  query,
  serving = false,
  children,
}: {
  query: string
  /** Shows the Kernels · Serving mode tabs; the server page passes the
   * serving flag since env never reaches this client island. */
  serving?: boolean
  children?: React.ReactNode
}) {
  return (
    // z-30: the suggest popup must paint above the result sections.
    <div className="relative z-30 border-b border-border bg-surface">
      <div className="shell pt-4 pb-3.5">
        <ResolverTabs mode="kernels" serving={serving} />
        <SearchField query={query} />
        {children}
      </div>
    </div>
  )
}

/** Quiet labeled rule between trust tiers in the recommended order. */
function TierDivider({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-baseline gap-3 pt-4 pb-1.5">
      <span className="text-label text-faint uppercase">{label}</span>
      <span className="h-px flex-1 self-center bg-line" />
      <span className="font-mono text-mini text-faint">{count}</span>
    </div>
  )
}

export function SearchResults({
  model,
  filters,
  browse,
  serving = false,
}: {
  model: SearchPageModel
  filters: SearchFilters
  browse?: BrowseFilters
  serving?: boolean
}) {
  // Filter, sort, view, and pagination are instant client transitions over
  // the already-delivered model; the URL tracks state for shareability and
  // the server renders any deep link identically (no-JS unchanged).
  const [state, setState] = useState<SearchFilters>(filters)
  const [lastQuery, setLastQuery] = useState(model.query)
  if (lastQuery !== model.query) {
    setLastQuery(model.query)
    setState(filters)
  }
  const apply = (patch: Partial<SearchFilters>) => {
    const next = { ...state, page: patch.page ?? 1, ...patch }
    startTransition(() => setState(next))
    window.history.replaceState(
      null,
      "",
      searchHref(model.query, next, { page: next.page }),
    )
  }

  const groupsByMode: Record<ResultMode, ResultRow[]> = {
    exact: model.groups.exact,
    compatible: model.groups.compatible,
    supported: model.groups.supportedUnmeasured,
    reported: model.groups.reported,
  }
  const view =
    state.view ??
    MODES.find((mode) => groupsByMode[mode.key].length > 0)?.key ??
    "exact"
  // Policy facets from the query (trust:, license:, source:, installable:)
  // filter rows inside a group; they never reclassify evidence (§11.4).
  const { policy } = model
  const keep = (row: ResultRow) =>
    (!state.verified || isVerified(row)) &&
    (!state.source || row.sourceAvailable) &&
    (!state.license ||
      (row.license.concluded ?? row.license.declared) !== null) &&
    (!state.installable || row.installable) &&
    meetsTrust(row.evidence, policy.minimumTrust) &&
    (policy.license === null ||
      licenseMatches(policy.license, row.license.concluded)) &&
    (!policy.requireSource || row.sourceAvailable) &&
    (!policy.requireInstallable || row.installable)
  const sort = state.sort ?? "recommended"
  const allRows = sortRows(groupsByMode[view].filter(keep), sort)
  const hidden = groupsByMode[view].length - allRows.length
  const pageCount = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE))
  const page = Math.min(Math.max(1, state.page ?? 1), pageCount)
  const rows = allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  // The cohort's native leader anchors rank/meter semantics; the hero is
  // the best-tier leader (the tiered list's first row).
  const exactKept = model.groups.exact.filter(keep)
  const fastest = exactKept[0] ?? null
  const top = sortRows(exactKept, "recommended")[0]
  // The default source filter never hides the faster number silently: the
  // cohort's true leader is restated as "fastest known without source".
  const cohortLeader = model.groups.exact[0] ?? null
  const hiddenBySourceFilter =
    state.source &&
    cohortLeader &&
    !cohortLeader.sourceAvailable &&
    cohortLeader.runId !== (fastest?.runId ?? null)
      ? cohortLeader
      : null
  const best = fastest?.primary ?? null
  const anyTie = rows.some((row) => row.tiedWithPrevious)
  const modeNote = MODES.find((mode) => mode.key === view)?.note
  // Tier dividers appear only when the recommended order actually spans
  // more than one tier; a uniform corpus renders as a plain list.
  const tierCounts = new Map<number, number>()
  if (sort === "recommended")
    for (const row of allRows) {
      const tier = rowTier(row)
      tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1)
    }
  const showDividers = tierCounts.size > 1
  // When the active view is empty, point at the nearest view that is not.
  const alternative = MODES.find(
    (mode) => mode.key !== view && groupsByMode[mode.key].length > 0,
  )
  // A model: facet names a whole-model question; search resolves one
  // operation, so the model page (every relevant operation on one GPU) is
  // offered beside the facet chips. The display carries the kebab slug.
  const modelSlug =
    model.facets
      .find((facet) => facet.display.startsWith("model "))
      ?.display.slice("model ".length) ?? null

  return (
    <>
      <SearchBand query={model.query} serving={serving}>
        {(model.facets.length > 0 || model.queryIssues.length > 0) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            {model.facets.map((facet) => (
              <span
                key={facet.token}
                className="key inline-flex items-center gap-1.5 px-2 py-1 font-mono text-mini text-muted"
              >
                {facet.display}
                <Link
                  href={`/search?q=${encodeURIComponent(facet.removeQuery)}`}
                  aria-label={`Remove ${facet.display}`}
                  className="text-faint transition-colors hover:text-fg no-underline"
                >
                  ✕
                </Link>
              </span>
            ))}
            {/* Parse notes are guidance, not hazards: the token is bright,
                  the message quiet, amber stays for act-on states (§16.16). */}
            {model.queryIssues.map((issue) => (
              <span key={issue.token} className="text-small text-subtle">
                <span className="font-mono text-mini text-fg">
                  {issue.token}
                </span>
                {" · "}
                {issue.message}
              </span>
            ))}
            {model.facets.length >= 2 && (
              <Link
                href={`/search?q=${encodeURIComponent(
                  model.facets.reduce(
                    (q, facet) => removeToken(q, facet.token),
                    model.query,
                  ),
                )}`}
                className="text-mini text-faint transition-colors hover:text-fg"
              >
                Clear filters
              </Link>
            )}
          </div>
        )}
        {model.operation !== null && (
          <>
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h1 className="text-title font-medium">
                {model.operation ? (
                  <Link
                    href={`/operations/${model.operation.slug}`}
                    className="text-fg transition-colors hover:text-accent-bright no-underline"
                  >
                    {model.operation.name}
                  </Link>
                ) : (
                  model.interpretedQuery
                )}
              </h1>
              <span className="text-small text-subtle">
                {model.groups.exact.length} exact measurement
                {model.groups.exact.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-1 font-mono text-small text-subtle">
              {contextLine(model)}
            </div>
            {/* §12.1: a multi-match query answers with its most-measured
                  candidate; the interpretation is stated where the answer
                  starts, never as a footnote (audit 2026-08-25), and the
                  full match list is one click away. */}
            {model.matches && model.matches.length > 0 && (
              <p className="mt-1.5 text-small">
                <span className="text-muted">
                  {model.matches.length + 1} operations match this query;
                  resolved to the most measured.
                </span>{" "}
                <Link
                  href={`/search?q=${encodeURIComponent(model.query)}&choose=1`}
                  prefetch={false}
                  className="text-small"
                >
                  Choose from all {model.matches.length + 1} →
                </Link>
              </p>
            )}
            {/* Every measured cohort for this workload, one chip each
                  (§16.6): switching hardware is a link, never a syntax
                  lesson. The selection is URL state (`cohort`), so the
                  page re-resolves server-side. */}
            {model.cohortOptions.length > 1 &&
              (() => {
                // Six chips is the scan budget; the pinned cohort is always
                // among them, and the rest open in place (3-second rule).
                const CHIP_CAP = 6
                const selected = model.cohortOptions.findIndex(
                  (option) => option.key === model.cohort?.comparisonKey,
                )
                const visible = model.cohortOptions.slice(0, CHIP_CAP)
                if (selected >= CHIP_CAP)
                  visible.splice(CHIP_CAP - 1, 1, model.cohortOptions[selected])
                const folded = model.cohortOptions.filter(
                  (option) => !visible.includes(option),
                )
                const chip = (option: (typeof visible)[number]) => {
                  const on = option.key === model.cohort?.comparisonKey
                  return (
                    <Link
                      key={option.key}
                      href={searchHref(model.query, state, {
                        cohort: option.key,
                      })}
                      prefetch={false}
                      className={`key font-mono text-small whitespace-nowrap no-underline ${
                        on ? "key-on" : "text-subtle hover:text-fg"
                      }`}
                    >
                      {option.label}
                      <span
                        className={`ml-1.5 text-mini ${on ? "text-subtle" : "text-faint"}`}
                      >
                        {option.runs}
                      </span>
                    </Link>
                  )
                }
                return (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 text-small">
                    <span className="mr-1 text-faint">Hardware</span>
                    {visible.map(chip)}
                    {folded.length > 0 && (
                      <details className="group">
                        <summary className="cursor-pointer list-none text-faint transition-colors hover:text-fg [&::-webkit-details-marker]:hidden group-open:hidden">
                          +{folded.length} more ›
                        </summary>
                        <span className="hidden flex-wrap items-center gap-2 group-open:flex">
                          {folded.map(chip)}
                        </span>
                      </details>
                    )}
                  </div>
                )
              })()}
          </>
        )}
      </SearchBand>

      <main className="shell pb-24">
        {model.browse ? (
          <StartState
            operations={model.browse}
            filters={browse ?? { sort: "indexed", family: null, page: 1 }}
          />
        ) : model.matches && !model.operation ? (
          <section className="pt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-border-strong pb-3">
              <h1 className="text-title font-medium">
                {model.matches.length} operations match
              </h1>
              <span className="text-small text-faint">
                Pick one to compare its implementations
                {model.facets.length > 0 ? "; your filters carry over" : ""}
              </span>
            </div>
            <OperationList
              entries={model.matches}
              hrefFor={(entry) =>
                `/search?q=${encodeURIComponent(
                  [
                    ...model.facets.map((facet) => facet.token),
                    `op:${entry.slug}`,
                  ].join(" "),
                )}`
              }
            />
          </section>
        ) : model.noResult ? (
          <section className="py-14">
            <p className="max-w-[64ch] text-body text-muted">
              {model.noResult.guidance}
            </p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              {model.noResult.suggestions.map((suggestion) => (
                <Link
                  key={suggestion.query}
                  href={`/search?q=${encodeURIComponent(suggestion.query)}`}
                  className="font-mono text-body"
                >
                  {suggestion.label}
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <>
            {model.nearest && model.operation && exactKept.length === 0 && (
              <NearestMeasured
                nearest={model.nearest}
                operationSlug={model.operation.slug}
              />
            )}
            {model.operation && model.groups.exact.length === 0 && (
              <div className="border-b border-border py-4">
                <RequestWorkload
                  operation={model.operation.slug}
                  query={model.query}
                />
              </div>
            )}
            {top && (
              <Recommendation
                top={top}
                fastest={fastest}
                model={model}
                hiddenFaster={hiddenBySourceFilter}
                // The pinned cohort was chosen by evidence density, not by
                // the query (§12.1) — the answer states the inference.
                cohortInferred={!state.cohort && model.cohortOptions.length > 1}
              />
            )}

            {/* One control band (3-second rule): views and sort share the
                ruled line; the filter chips sit beneath it. */}
            <div className="mt-7 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-border-strong">
              {/* Empty views render nothing, not a dead tab. */}
              {MODES.map((mode) => {
                const total = groupsByMode[mode.key].length
                const selected = mode.key === view
                if (total === 0 && !selected) return null
                return (
                  <Link
                    key={mode.key}
                    href={searchHref(model.query, state, { view: mode.key })}
                    prefetch={false}
                    onClick={(event) => {
                      event.preventDefault()
                      apply({ view: mode.key })
                    }}
                    className={`pb-2 text-body transition-colors hover:text-fg no-underline ${
                      selected
                        ? "-mb-px border-b border-fg font-medium text-fg"
                        : total === 0
                          ? "text-faint"
                          : "text-subtle"
                    }`}
                  >
                    {mode.label}{" "}
                    <span className="font-mono text-mini text-faint">
                      {total}
                    </span>
                  </Link>
                )
              })}
              {allRows.length > 1 && (
                <span className="ml-auto flex flex-wrap items-baseline gap-x-2.5 gap-y-1 pb-2 text-small">
                  <span className="whitespace-nowrap text-faint">
                    sorted by
                  </span>
                  {SORTS.map((option) =>
                    sort === option.key ? (
                      <span key={option.key} className="text-fg">
                        {option.label}
                      </span>
                    ) : (
                      <Link
                        key={option.key}
                        href={searchHref(model.query, state, {
                          view,
                          sort: option.key,
                        })}
                        prefetch={false}
                        onClick={(event) => {
                          event.preventDefault()
                          apply({ view, sort: option.key })
                        }}
                        className="text-subtle transition-colors hover:text-fg no-underline"
                      >
                        {option.label}
                      </Link>
                    ),
                  )}
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {CHIP_FILTERS.map((chip) => {
                const count = groupsByMode[view].filter(chip.test).length
                const on = state[chip.key]
                // Verification is corpus-wide zero today: hide the chip
                // rather than advertising the deficiency on every search
                // (records-page rule). The availability chips stay dead-
                // rendered — their zeros are per-result-set facts.
                if (chip.key === "verified" && count === 0 && !on) return null
                return (
                  <FilterChip
                    key={chip.key}
                    href={searchHref(model.query, state, { [chip.key]: !on })}
                    on={on}
                    dead={count === 0 && !on}
                    label={chip.label}
                    count={count}
                    onClick={(event) => {
                      event.preventDefault()
                      apply({ [chip.key]: !on })
                    }}
                  />
                )
              })}
              {hidden > 0 && (
                <span className="ml-1 text-small text-faint">
                  {hidden} hidden
                </span>
              )}
            </div>

            {/* The note line renders only when it actually says something:
                a non-exact view's semantics, a cap cut, or tie notation. */}
            {(() => {
              const cut =
                model.overflow[
                  view === "supported" ? "supportedUnmeasured" : view
                ]
              if (!modeNote && cut <= 0 && !anyTie) return null
              return (
                <p className="mt-2.5 text-small text-faint">
                  {modeNote}
                  {cut > 0 &&
                    ` ${cut} more rows past the cap. Narrow the workload to see them.`}
                  {anyTie && (
                    <>
                      {" "}
                      N= means tied: too close to call.{" "}
                      <Link href="/docs#ranking">How ranking works →</Link>
                    </>
                  )}
                </p>
              )
            })()}

            <div className="mt-1 overflow-x-auto">
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
                  {rows.map((row, index) => {
                    const tier = rowTier(row)
                    const opensTier =
                      showDividers &&
                      (index === 0 || rowTier(rows[index - 1]) !== tier)
                    return (
                      <Fragment key={row.runId ?? row.implementation.slug}>
                        {opensTier && (
                          <TierDivider
                            label={TRUST_TIERS[tier]}
                            count={tierCounts.get(tier) ?? 0}
                          />
                        )}
                        <ResultRowItem
                          row={row}
                          best={best}
                          relative={view === "exact"}
                          compareWith={fastest?.runId ?? null}
                          tiedWithNext={
                            rows[index + 1]?.tiedWithPrevious &&
                            rows[index + 1]?.rank === row.rank
                          }
                          baselineMetric={
                            view === "exact"
                              ? (model.groups.exact.find((r) => r.baseline)
                                  ?.primary ?? null)
                              : null
                          }
                        />
                      </Fragment>
                    )
                  })}
                </>
              ) : (
                <p className="py-8 text-body text-faint">
                  No {view} results for this workload
                  {hidden > 0 ? " under the active filters" : ""}.
                  {alternative && (
                    <>
                      {" "}
                      <Link
                        href={searchHref(model.query, state, {
                          view: alternative.key,
                        })}
                        prefetch={false}
                        onClick={(event) => {
                          event.preventDefault()
                          apply({ view: alternative.key })
                        }}
                      >
                        {groupsByMode[alternative.key].length}{" "}
                        {alternative.label.toLowerCase()} result
                        {groupsByMode[alternative.key].length === 1 ? "" : "s"}{" "}
                        →
                      </Link>
                    </>
                  )}
                  {/* §12: the faster number is stated, never hidden — an
                      empty filtered view still names the best it is hiding. */}
                  {state.source &&
                    groupsByMode[view].some((row) => !row.sourceAvailable) && (
                      <>
                        {(() => {
                          const best = groupsByMode[view].find(
                            (row) => row.primary !== null,
                          )?.primary
                          return best ? (
                            <>
                              {" "}
                              Best without source:{" "}
                              <span className="font-mono text-subtle">
                                {formatPrimary(best)}
                              </span>
                              .
                            </>
                          ) : null
                        })()} <Link
                          href={searchHref(model.query, state, {
                            source: false,
                          })}
                          prefetch={false}
                          onClick={(event) => {
                            event.preventDefault()
                            apply({ source: false })
                          }}
                        >
                          Include results without source →
                        </Link>
                      </>
                    )}
                </p>
              )}
            </div>

            <Pager
              page={page}
              pageCount={pageCount}
              hrefFor={(target) =>
                searchHref(model.query, state, { view, page: target })
              }
              onNavigate={(target) => apply({ view, page: target })}
            />

            {model.related.length > 0 && (
              <section className="mt-12">
                <h2 className="text-body font-medium text-muted">Related</h2>
                <div className="mt-2.5 flex flex-wrap gap-x-7 gap-y-2.5">
                  {model.related.map((item) => (
                    <span key={item.slug} className="text-body">
                      {item.kind === "operation" ? (
                        <Link
                          href={`/operations/${item.slug}`}
                          className="font-mono text-small"
                        >
                          {item.name}
                        </Link>
                      ) : (
                        <span className="font-mono text-small text-muted">
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

        <div className="mt-12 border-t border-border pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-5">
            <p className="text-small text-subtle">
              {model.operation
                ? "Missing a kernel here? Evidence submissions open with the contribution beta."
                : "Ranked only against runs that measured the same thing."}
              {/* The whole-model question, out of the band's first three
                  seconds but one line from the results (§12.1). */}
              {modelSlug && (
                <>
                  {" "}
                  <Link href={`/models/${modelSlug}`}>
                    Every operation for this model →
                  </Link>
                </>
              )}
            </p>
            {/* Following a cohort never requires finding the operation
                page (§13.11): the result footer carries the toggle. */}
            {model.operation && model.cohort && (
              <FollowButton
                kind="cohort"
                followKey={model.cohort.comparisonKey}
                label={`${model.operation.name} · ${
                  model.cohortOptions.find(
                    (option) => option.key === model.cohort?.comparisonKey,
                  )?.label ?? "cohort"
                }`}
                href={`/operations/${model.operation.slug}?cohort=${encodeURIComponent(model.cohort.comparisonKey)}`}
                noun="cohort"
              />
            )}
          </div>
          {/* The same request as a machine call (§16.6): one disclosure on
              its own line holds every copyable form — curl, ki, comparison
              key — instead of a four-item strip. */}
          {model.operation && (
            <details className="group mt-2">
              <summary className="cursor-pointer list-none text-small text-faint transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
                This search as an API call
              </summary>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5">
                <span className="flex items-center gap-1.5 font-mono text-small text-faint">
                  curl
                  <CopyButton
                    text={`curl "https://kernelindex.com${apiPath(model.query, state.cohort)}"`}
                  />
                </span>
                <span className="flex items-center gap-1.5 font-mono text-small text-faint">
                  ki
                  <CopyButton
                    text={`ki search ${JSON.stringify(model.query)} --json`}
                  />
                </span>
                {model.cohort && (
                  <span className="flex items-center gap-2.5">
                    <span className="font-mono text-small text-faint">
                      comparison key {model.cohort.comparisonKey.slice(0, 23)}…
                    </span>
                    <CopyButton text={model.cohort.comparisonKey} />
                  </span>
                )}
                <ApiLink path={apiPath(model.query, state.cohort).slice(7)} />
              </div>
            </details>
          )}
        </div>
        {model.sources.length > 0 && (
          <p className="mt-2 font-mono text-mini text-faint">
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
