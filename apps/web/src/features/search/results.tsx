"use client"

import Link from "next/link"
import { Fragment, startTransition, useState } from "react"
import { CopyButton } from "@/components/copy-button"
import { KeyValueList } from "@/components/key-value-list"
import type { ResultRow, SearchPageModel } from "@/lib/catalog"
import {
  evidenceLabel,
  formatDateUTC,
  formatPrimary,
  formatPrimaryParts,
  formatSpread,
} from "@/lib/format"
import { meetsTrust, removeToken } from "@/lib/search-query"
import { TRUST_TIERS, trustTier } from "@/lib/trust-tier"
import { deployability, licenseMatches } from "@/server/policy/deployability"
import { ResultRowItem, ResultTableHead } from "./result-row"
import { type BrowseFilters, OperationList, StartState } from "./start-state"
import { SuggestInput } from "./suggest"

export type ResultMode = "exact" | "compatible" | "supported" | "reported"
export type ResultSort = "recommended" | "newest"
export type SearchFilters = {
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
    label: "Other cohorts",
    note: "Measured under a different protocol. Shown as published, never ranked against exact rows.",
  },
]

const isVerified = (row: ResultRow) =>
  row.evidence === "verified" || row.evidence === "replicated"
// One policy, one predicate (§11.8): the chips filter on single facts; this
// combined boolean drives only the hero's deployability note.
const isDeployable = (row: ResultRow) =>
  deployability({
    sourceAvailable: row.sourceAvailable,
    installable: row.installable,
    licenseConcluded: row.license.concluded,
  }).eligible

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
        className="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[14px] outline-none"
      />
      <kbd className="key px-[6px] py-0.5 font-mono text-[12px] text-faint">
        ⏎
      </kbd>
    </form>
  )
}

/** Quiet labeled rule between trust tiers in the recommended order. */
function TierDivider({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-baseline gap-3 pt-4 pb-1.5">
      <span className="text-[10.5px] tracking-[0.08em] text-faint uppercase">
        {label}
      </span>
      <span className="h-px flex-1 self-center bg-line" />
      <span className="font-mono text-[11px] text-faint">{count}</span>
    </div>
  )
}

function Recommendation({
  top,
  fastest,
  model,
  hiddenFaster = null,
}: {
  top: ResultRow
  /** The cohort's pure-latency leader; differs from `top` when a stronger
   * tier surfaced first (§12: the faster number is stated, never hidden). */
  fastest: ResultRow | null
  model: SearchPageModel
  /** Cohort leader hidden by the default source filter: the faster number
   * is still stated (§12), just marked as source-less. */
  hiddenFaster?: ResultRow | null
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
  const fasterInCohort =
    fastest &&
    fastest.runId !== top.runId &&
    fastest.primary &&
    top.primary &&
    fastest.primary.value < top.primary.value
      ? fastest
      : null
  return (
    <section className="grid animate-row-in grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] gap-11 border-b border-border py-6 [animation-delay:.02s] max-lg:grid-cols-1">
      <div>
        <div className="font-mono text-[10px] tracking-[0.08em] text-faint uppercase">
          {answerLabel(top)}
          {fasterInCohort ? " with source" : ""}
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
                top.primary.statistic === "unspecified"
                  ? null
                  : `${top.primary.statistic}${top.primary.sampleCount ? ` of ${top.primary.sampleCount}` : ""}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </div>
        <div className="mt-3">
          <Link
            href={`/implementations/${top.implementation.slug}`}
            className="text-[15px] font-medium"
          >
            {top.implementation.name}
          </Link>
          <span className="ml-2.5 text-[13px] text-subtle">
            {[
              top.project.name === top.implementation.name
                ? null
                : top.project.name,
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
            <CopyButton text={top.install.command} event="install_copied" />
          </div>
        ) : (
          <p className="mt-4 text-[12.5px] text-faint">
            No install recipe recorded for this revision.
          </p>
        )}
        <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
          {top.sourceAvailable && (
            <Link href={`/implementations/${top.implementation.slug}#code`}>
              View source →
            </Link>
          )}
          {top.runId && <Link href={`/runs/${top.runId}`}>Run dossier →</Link>}
        </div>
        {fasterInCohort?.primary && (
          <p className="mt-3.5 text-[13px] text-subtle">
            Fastest overall in this cohort:{" "}
            <Link
              href={`/implementations/${fasterInCohort.implementation.slug}`}
              className="font-mono text-[13px]"
            >
              {fasterInCohort.implementation.name}
            </Link>{" "}
            at{" "}
            <span className="font-mono text-fg">
              {formatPrimary(fasterInCohort.primary)}
            </span>{" "}
            · {TRUST_TIERS[rowTier(fasterInCohort)].toLowerCase()} · row #
            {fasterInCohort.rank ?? "—"}
          </p>
        )}
        {deployableAlternative?.primary && (
          <p className="mt-2 text-[13px] text-subtle">
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
            </span>
          </p>
        )}
        {hiddenFaster?.primary && (
          <p className="mt-2 text-[13px] text-subtle">
            Fastest known without source:{" "}
            <span className="font-mono text-fg">
              {formatPrimary(hiddenFaster.primary)}
            </span>
            {hiddenFaster.runId && (
              <>
                {" "}
                <Link href={`/runs/${hiddenFaster.runId}`}>View →</Link>
              </>
            )}
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
          <div className="flex items-baseline justify-between gap-4 text-[12.5px]">
            <span className="text-subtle">
              {model.cohort.profile === "source_native"
                ? "Source-native cohort"
                : "Exact cohort"}
            </span>
            <Link href="/docs#comparability" className="text-[12px] text-faint">
              Why comparable?
            </Link>
          </div>
          <div className="mt-2.5">
            <KeyValueList items={model.cohort.facts} />
          </div>
        </div>
      )}
    </section>
  )
}

export function SearchResults({
  model,
  filters,
  browse,
}: {
  model: SearchPageModel
  filters: SearchFilters
  browse?: BrowseFilters
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

  return (
    <>
      <div className="scan-line" />

      {/* z-30: the suggest popup must paint above the result sections. */}
      <div className="relative z-30 border-b border-border bg-surface">
        <div className="shell animate-fade-in pt-5 pb-4">
          <SearchField query={model.query} />
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
              {model.facets.length >= 2 && (
                <Link
                  href={`/search?q=${encodeURIComponent(
                    model.facets.reduce(
                      (q, facet) => removeToken(q, facet.token),
                      model.query,
                    ),
                  )}`}
                  className="text-[11.5px] text-faint transition-colors hover:text-fg"
                >
                  Clear filters
                </Link>
              )}
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
          <StartState
            operations={model.browse}
            filters={browse ?? { sort: "indexed", family: null, page: 1 }}
          />
        ) : model.matches ? (
          <section className="animate-row-in pt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-border-strong pb-3">
              <h1 className="text-[15px] font-medium tracking-[-0.01em]">
                {model.matches.length} operations match
              </h1>
              <span className="text-[12.5px] text-faint">
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
            <p className="max-w-[64ch] text-[14px] text-muted">
              {model.noResult.guidance}
            </p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              {model.noResult.suggestions.map((suggestion) => (
                <Link
                  key={suggestion.query}
                  href={`/search?q=${encodeURIComponent(suggestion.query)}`}
                  className="font-mono text-[13px]"
                >
                  {suggestion.label}
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <>
            {top && (
              <Recommendation
                top={top}
                fastest={fastest}
                model={model}
                hiddenFaster={hiddenBySourceFilter}
              />
            )}

            <div className="mt-7 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-border-strong animate-row-in [animation-delay:.08s]">
              {MODES.map((mode) => {
                const total = groupsByMode[mode.key].length
                const selected = mode.key === view
                return (
                  <Link
                    key={mode.key}
                    href={searchHref(model.query, state, { view: mode.key })}
                    prefetch={false}
                    onClick={(event) => {
                      event.preventDefault()
                      apply({ view: mode.key })
                    }}
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
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                {CHIP_FILTERS.map((chip) => {
                  const count = groupsByMode[view].filter(chip.test).length
                  const on = state[chip.key]
                  const dead = count === 0 && !on
                  return (
                    <Link
                      key={chip.key}
                      href={searchHref(model.query, state, {
                        [chip.key]: !on,
                      })}
                      prefetch={false}
                      // Toggles with an href fallback: aria-pressed is only
                      // valid with the button role.
                      role="button"
                      aria-pressed={on}
                      onClick={(event) => {
                        event.preventDefault()
                        if (!dead) apply({ [chip.key]: !on })
                      }}
                      className={`key px-2.5 py-[3px] text-[12px] hover:no-underline ${
                        on
                          ? "key-on"
                          : dead
                            ? "pointer-events-none text-ghost"
                            : "text-subtle hover:text-fg"
                      }`}
                    >
                      {chip.label}{" "}
                      <span className="font-mono text-[11px] text-faint">
                        {count}
                      </span>
                    </Link>
                  )
                })}
                {hidden > 0 && (
                  <span className="ml-1 text-[12px] text-faint">
                    {hidden} hidden
                  </span>
                )}
              </div>
              {allRows.length > 1 && (
                <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[12.5px]">
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
                        className="text-subtle transition-colors hover:text-fg hover:no-underline"
                      >
                        {option.label}
                      </Link>
                    ),
                  )}
                </span>
              )}
            </div>

            <p className="mt-2.5 text-[12.5px] text-faint">
              {modeNote ??
                "Ranked by latency within one cohort. Tied ranks share a number."}
              {(() => {
                const cut =
                  model.overflow[
                    view === "supported" ? "supportedUnmeasured" : view
                  ]
                return cut > 0
                  ? ` ${cut} more rows past the cap — narrow the workload to see them.`
                  : null
              })()}
            </p>

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
                        />
                      </Fragment>
                    )
                  })}
                </>
              ) : (
                <p className="py-8 text-[13px] text-faint">
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
                  {state.source &&
                    groupsByMode[view].some((row) => !row.sourceAvailable) && (
                      <>
                        {" "}
                        <Link
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

            {pageCount > 1 && (
              <div className="mt-4 flex items-baseline gap-5 text-[12.5px]">
                {page > 1 ? (
                  <Link
                    href={searchHref(model.query, state, {
                      view,
                      page: page - 1,
                    })}
                    prefetch={false}
                    onClick={(event) => {
                      event.preventDefault()
                      apply({ view, page: page - 1 })
                    }}
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
                    href={searchHref(model.query, state, {
                      view,
                      page: page + 1,
                    })}
                    prefetch={false}
                    onClick={(event) => {
                      event.preventDefault()
                      apply({ view, page: page + 1 })
                    }}
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
                N= means tied — too close to call.{" "}
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
              ? "Missing a kernel here? Evidence submissions open with the contribution beta."
              : "Ranked only against runs that measured the same thing."}
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
