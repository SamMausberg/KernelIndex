import { FilterChip } from "@/components/chip"
import { Meter } from "@/components/meter"
import { Pager } from "@/components/pager"
import { Link } from "@/components/quiet-link"
import type { OperationIndexEntry } from "@/lib/catalog"
import { formatDateUTC, formatPrimary } from "@/lib/format"

/** "38.6 µs" from a chooser best value. */
const formatLatency = (best: { value: number; unit: string }) =>
  formatPrimary({
    metric: "latency",
    unit: best.unit,
    statistic: "best",
    value: best.value,
    sampleCount: null,
    uncertainty: null,
  })

export type BrowseSort = "indexed" | "active" | "az"
export type BrowseFilters = {
  sort: BrowseSort
  family: string | null
  page: number
}

const PAGE_SIZE = 50

const SORTS: { key: BrowseSort; label: string }[] = [
  { key: "indexed", label: "Most indexed" },
  { key: "active", label: "Recently active" },
  { key: "az", label: "A–Z" },
]

const byName = (a: OperationIndexEntry, b: OperationIndexEntry) =>
  a.name.localeCompare(b.name, undefined, { numeric: true })

function sortEntries(entries: OperationIndexEntry[], sort: BrowseSort) {
  const sorted = [...entries]
  if (sort === "az") return sorted.sort(byName)
  if (sort === "active")
    return sorted.sort(
      (a, b) =>
        (b.lastObservedAt ?? "").localeCompare(a.lastObservedAt ?? "") ||
        byName(a, b),
    )
  return sorted.sort((a, b) => b.runs - a.runs || byName(a, b))
}

function browseHref(filters: BrowseFilters, patch: Partial<BrowseFilters>) {
  // Any change other than paging restarts at page 1.
  const next = { ...filters, page: patch.page ?? 1, ...patch }
  const params = new URLSearchParams()
  if (next.sort !== "indexed") params.set("sort", next.sort)
  if (next.family) params.set("family", next.family)
  if (next.page > 1) params.set("page", String(next.page))
  const suffix = params.toString()
  return suffix ? `/search?${suffix}` : "/search"
}

/**
 * The operation table shared by the browse start state and the multi-match
 * chooser: humanized name, family, run coverage, and freshness, each row one
 * link into exact resolution.
 */
export function OperationList({
  entries,
  hrefFor,
}: {
  entries: OperationIndexEntry[]
  hrefFor: (entry: OperationIndexEntry) => string
}) {
  // Floor the meter domain so a 3-run corpus slice never paints full bars —
  // the same value must look the same on every result set.
  const maxRuns = Math.max(100, ...entries.map((entry) => entry.runs))
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[738px] grid-cols-[minmax(280px,1fr)_150px_190px_92px] border-b border-border-strong font-mono text-label text-faint uppercase">
        <div className="py-2">Operation</div>
        <div className="py-2">Family</div>
        <div className="py-2 text-right">Published runs</div>
        <div className="py-2 text-right">Last run</div>
      </div>
      {entries.map((entry) => (
        <Link
          key={entry.slug}
          href={hrefFor(entry)}
          className={`grid ${entry.match ? "h-14" : "h-12"} min-w-[738px] grid-cols-[minmax(280px,1fr)_150px_190px_92px] items-center border-t border-line transition-colors hover:bg-raised no-underline`}
        >
          <span className="min-w-0 pr-4">
            <span className="block truncate text-body text-fg">
              {entry.name}
            </span>
            {entry.match && (
              <span
                className={`mt-0.5 block truncate font-mono text-mini ${
                  entry.match.matching > 0 ? "text-subtle" : "text-faint"
                }`}
              >
                {entry.match.matching > 0
                  ? [
                      `${entry.match.matching} on ${entry.match.facetLabel}`,
                      entry.match.best &&
                        `best ${formatLatency(entry.match.best)}`,
                      entry.match.withSource > 0 &&
                        `${entry.match.withSource} with source`,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : `none on ${entry.match.facetLabel}`}
              </span>
            )}
          </span>
          <span className="truncate pr-3 text-small text-subtle">
            {entry.family}
          </span>
          <span className="flex items-center justify-end gap-2.5">
            {entry.runs > 0 && (
              <Meter
                fraction={entry.runs / maxRuns}
                className="w-[72px] max-sm:hidden"
              />
            )}
            <span
              className={`min-w-[52px] text-right font-mono text-small ${
                entry.runs > 0 ? "text-muted" : "text-faint"
              }`}
            >
              {entry.runs > 0 ? entry.runs : "none yet"}
            </span>
          </span>
          <span className="text-right font-mono text-mini text-faint">
            {formatDateUTC(entry.lastObservedAt)}
          </span>
        </Link>
      ))}
    </div>
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
export function StartState({
  operations,
  filters,
}: {
  operations: OperationIndexEntry[]
  filters: BrowseFilters
}) {
  const families = [
    ...operations
      .reduce((counts, entry) => {
        counts.set(entry.family, (counts.get(entry.family) ?? 0) + entry.runs)
        return counts
      }, new Map<string, number>())
      .entries(),
  ]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([family]) => family)
  const scoped =
    filters.family === null
      ? operations
      : operations.filter((entry) => entry.family === filters.family)
  const sorted = sortEntries(scoped, filters.sort)
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const page = Math.min(Math.max(1, filters.page), pageCount)
  const rows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalRuns = operations.reduce((n, entry) => n + entry.runs, 0)
  const examples = families.slice(0, 2).map((family) => `${family} B200 bf16`)

  return (
    <section className="animate-row-in pt-6">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2 text-body">
        <span className="text-faint">Try</span>
        {examples.map((example) => (
          <Link
            key={example}
            href={`/search?q=${encodeURIComponent(example)}`}
            className="font-mono text-small"
          >
            {example}
          </Link>
        ))}
        <Link
          href="/docs#query-syntax"
          className="ml-auto text-small text-faint"
        >
          Query syntax
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5 text-small">
        <span className="text-faint">Filter with</span>
        {SYNTAX_HINTS.map((hint) => (
          <code key={hint} className="font-mono text-mini text-subtle">
            {hint}
          </code>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-4 border-b border-border-strong pb-3">
        <h2 className="text-lead font-medium">Browse the index</h2>
        <div className="flex flex-wrap items-baseline gap-x-4 text-small">
          <span className="text-faint">
            {scoped.length} operation{scoped.length === 1 ? "" : "s"} ·{" "}
            {totalRuns} published runs
          </span>
          <span className="flex items-baseline gap-2.5">
            <span className="text-faint">sorted by</span>
            {SORTS.map((option) =>
              filters.sort === option.key ? (
                <span key={option.key} className="text-fg">
                  {option.label}
                </span>
              ) : (
                <Link
                  key={option.key}
                  href={browseHref(filters, { sort: option.key })}
                  className="text-subtle transition-colors hover:text-fg no-underline"
                >
                  {option.label}
                </Link>
              ),
            )}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-3 pb-1">
        {["All families", ...families].map((label) => {
          const value = label === "All families" ? null : label
          return (
            <FilterChip
              key={label}
              href={browseHref(filters, { family: value })}
              on={filters.family === value}
              label={label}
            />
          )
        })}
      </div>

      <OperationList
        entries={rows}
        hrefFor={(entry) =>
          `/search?q=${encodeURIComponent(`op:${entry.slug}`)}`
        }
      />

      <Pager
        page={page}
        pageCount={pageCount}
        hrefFor={(target) => browseHref(filters, { page: target })}
      />
    </section>
  )
}
