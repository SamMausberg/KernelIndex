import Link from "next/link"
import { CopyButton } from "@/components/copy-button"
import type { ResultRow, SearchPageModel } from "@/lib/catalog"
import {
  evidenceLabel,
  formatDateUTC,
  formatPrimary,
  formatSpread,
} from "@/lib/format"
import { ResultRowItem } from "./result-row"

export type SearchFilters = { verified: boolean; deployable: boolean }

const isVerified = (row: ResultRow) =>
  row.evidence === "verified" || row.evidence === "replicated"
const isDeployable = (row: ResultRow) =>
  row.installable && row.sourceAvailable && row.license.concluded !== null

function keep(row: ResultRow, filters: SearchFilters) {
  return (
    (!filters.verified || isVerified(row)) &&
    (!filters.deployable || isDeployable(row))
  )
}

/** Toggle filters are URL state (§16.6): flipping one is a navigation. */
function toggleHref(query: string, filters: SearchFilters, flip: string) {
  const params = new URLSearchParams({ q: query })
  const next = {
    verified: filters.verified !== (flip === "verified"),
    deployable: filters.deployable !== (flip === "deployable"),
  }
  if (next.verified) params.set("verified", "1")
  if (next.deployable) params.set("deployable", "1")
  return `/search?${params.toString()}`
}

/** Answer heading tracks the evidence actually present — never upgraded. */
function answerLabel(row: ResultRow) {
  if (isVerified(row)) return "Fastest verified"
  if (row.evidence === "reproducible") return "Fastest reproducible"
  return "Fastest reported"
}

function NoResult({ model }: { model: SearchPageModel }) {
  return (
    <section className="py-16">
      <p className="max-w-[70ch] text-[14px] text-muted">
        {model.noResult?.guidance}
      </p>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        {model.noResult?.suggestions.map((suggestion) => (
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
  )
}

function Answer({ top, model }: { top: ResultRow; model: SearchPageModel }) {
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
    <section className="animate-row-in [animation-delay:.02s]">
      <div className="text-[13px] text-subtle">{answerLabel(top)}</div>
      <div className="mt-2.5 flex flex-wrap items-baseline gap-4">
        <span className="font-mono text-[44px] font-medium tracking-[-0.02em] tabular-nums">
          {top.primary ? formatPrimary(top.primary) : "—"}
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
          className="font-mono text-[16px]"
        >
          {top.implementation.name}
        </Link>
        <span className="ml-3 text-[13.5px] text-subtle">
          {[
            top.project.name,
            top.license.concluded ?? top.license.declared ?? "License unknown",
            top.language,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <p className="mt-2 max-w-[70ch] text-[14px] text-muted">
        {evidenceLabel(top.evidence)} evidence, last observed{" "}
        {formatDateUTC(top.lastTestedAt)}.
        {top.caveats.length > 0 ? ` ${top.caveats.join(". ")}.` : ""}
      </p>
      {fasterElsewhere?.primary && (
        <p className="mt-4 text-[13px] text-subtle">
          A faster result exists outside this cohort —{" "}
          <span className="font-mono text-fg">
            {formatPrimary(fasterElsewhere.primary)}
          </span>
          , not comparable under this protocol.{" "}
          {fasterElsewhere.runId && (
            <Link href={`/runs/${fasterElsewhere.runId}`}>View →</Link>
          )}
        </p>
      )}
    </section>
  )
}

export function SearchResults({
  model,
  filters,
}: {
  model: SearchPageModel
  filters: SearchFilters
}) {
  const groups = [
    {
      title: "Exact results",
      note: "Identical workload, protocol, environment, and correctness policy",
      rows: model.groups.exact,
      delay: ".06s",
    },
    {
      title: "Compatible results",
      note: "Nearby measured evidence — rows show what differs from the request",
      rows: model.groups.compatible,
      delay: ".12s",
    },
    {
      title: "Supported, unmeasured",
      note: "Declared or nearby-tested support, no run on this exact workload",
      rows: model.groups.supportedUnmeasured,
      delay: ".16s",
    },
    {
      title: "Reported elsewhere",
      note: "Preserved as published under the source protocol, never ranked above",
      rows: model.groups.reported,
      delay: ".2s",
    },
  ].map((group) => ({
    ...group,
    shown: group.rows.filter((row) => keep(row, filters)),
  }))
  const total = groups.reduce((n, group) => n + group.rows.length, 0)
  const hidden = total - groups.reduce((n, group) => n + group.shown.length, 0)
  const top = model.groups.exact[0]
  const best = top?.primary ?? null

  return (
    <>
      <div className="h-px origin-left animate-scan bg-accent" />

      <div className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1220px] animate-fade-in px-8 pt-[18px] pb-4">
          <h1 className="font-mono text-[14.5px] leading-normal font-medium">
            {model.interpretedQuery}
          </h1>
          {model.cohort && (
            <p className="mt-[7px] font-mono text-[12px] text-subtle">
              {model.cohort.description}
            </p>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-[1220px] px-8 pt-10 pb-20">
        {model.noResult ? (
          <NoResult model={model} />
        ) : (
          <>
            {top && <Answer top={top} model={model} />}

            <div className="mt-12 flex flex-wrap items-baseline justify-between gap-5 border-b border-border-strong pb-3 animate-row-in [animation-delay:.08s]">
              <div className="flex items-baseline gap-[18px]">
                <h2 className="text-[17px] font-medium tracking-[-0.01em]">
                  All results
                </h2>
                <span className="text-[13px] text-faint">
                  {hidden > 0
                    ? `${hidden} hidden by filters`
                    : `${total} results in ${groups.filter((g) => g.rows.length > 0).length} groups`}
                </span>
              </div>
              <div className="flex items-baseline gap-5 text-[13px]">
                <Link
                  href={toggleHref(model.query, filters, "verified")}
                  className={`transition-colors hover:text-fg hover:no-underline ${
                    filters.verified ? "text-accent" : "text-subtle"
                  }`}
                >
                  Verified only
                </Link>
                <Link
                  href={toggleHref(model.query, filters, "deployable")}
                  className={`transition-colors hover:text-fg hover:no-underline ${
                    filters.deployable ? "text-accent" : "text-subtle"
                  }`}
                >
                  Deployable only
                </Link>
                <span className="text-faint">Sorted by primary metric</span>
              </div>
            </div>

            {groups
              .filter((group) => group.shown.length > 0)
              .map((group) => (
                <section
                  key={group.title}
                  className="mt-10 animate-row-in"
                  style={{ animationDelay: group.delay }}
                >
                  <div className="flex flex-wrap items-baseline gap-3.5">
                    <h2 className="text-[15px] font-medium text-muted">
                      {group.title}
                    </h2>
                    <span className="font-mono text-[12px] text-faint tabular-nums">
                      {group.shown.length} of {group.rows.length}
                    </span>
                    <span className="text-[13px] text-faint">{group.note}</span>
                  </div>
                  <div className="mt-3 overflow-x-auto border-t border-border">
                    {group.shown.map((row) => (
                      <ResultRowItem
                        key={row.runId ?? row.implementation.slug}
                        row={row}
                        best={best}
                      />
                    ))}
                  </div>
                </section>
              ))}

            {model.related.length > 0 && (
              <section className="mt-12 animate-row-in [animation-delay:.22s]">
                <h2 className="text-[15px] font-medium text-muted">Related</h2>
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
                        <span className="font-mono text-[12.5px]">
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

        <div className="mt-11 flex flex-wrap items-baseline justify-between gap-5 border-t border-border pt-[22px]">
          <p className="text-[13px] text-subtle">
            Missing an implementation for this workload? Evidence submissions
            open with the contribution beta.
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
      </main>
    </>
  )
}
