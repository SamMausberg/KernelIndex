"use client"

import { startTransition, useEffect, useState } from "react"
import { KeyValueList } from "@/components/key-value-list"
import { Link } from "@/components/quiet-link"
import { Section } from "@/components/section"
import { AnswerSlots, isDeployable } from "@/features/answer/answer-slots"
import { ResultRowItem, ResultTableHead } from "@/features/search/result-row"
import type { WorkloadOption } from "@/lib/catalog"
import { formatDateUTC } from "@/lib/format"
import { SweepChart } from "./sweep"
import type { OperationVariant } from "./variant"
import { WatchButton } from "./watch-button"
import { WorkloadPicker } from "./workload-picker"

// The operation records island (§16.6, records-island pattern §16.12): the
// ISR page always renders the default workload/cohort variant, and this
// island owns the URL. Picker and cohort links keep real shareable hrefs;
// a plain click swaps in the CDN-cached variant from /operations/[slug]/data
// instead of navigating, and a deep-linked selection applies right after
// hydration. Modified clicks (new tab) still navigate normally.

// One in-flight/settled fetch per variant per session (CDN-cached).
const variantCache = new Map<string, Promise<OperationVariant | null>>()
function loadVariant(slug: string, search: URLSearchParams) {
  const key = `${slug}?${search}`
  let promise = variantCache.get(key)
  if (!promise) {
    promise = fetch(`/operations/${slug}/data?${search}`)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
    promise.then((variant) => {
      // Drop failed loads so a later click can retry.
      if (variant === null) variantCache.delete(key)
    })
    variantCache.set(key, promise)
  }
  return promise
}

export function OperationRecords({
  slug,
  workloads,
  lastObservedAt,
  initial,
}: {
  slug: string
  workloads: WorkloadOption[]
  lastObservedAt: string | null
  initial: OperationVariant
}) {
  const [variant, setVariant] = useState(initial)

  const swap = (search: URLSearchParams) => {
    loadVariant(slug, search).then((loaded) => {
      if (loaded) startTransition(() => setVariant(loaded))
    })
  }

  // Deep-linked selection applies after hydration (window.location, not
  // useSearchParams — that would drop the section out of the static HTML).
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only URL read
  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    if (search.has("workload") || search.has("cohort")) swap(search)
  }, [])

  const onClickCapture = (event: React.MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return
    const anchor = (event.target as HTMLElement).closest("a")
    const href = anchor?.getAttribute("href")
    if (!href?.startsWith(`/operations/${slug}?`)) return
    event.preventDefault()
    event.stopPropagation()
    window.history.replaceState(null, "", href)
    swap(new URLSearchParams(href.slice(href.indexOf("?") + 1)))
  }

  const best = variant.records[0]?.primary ?? null
  const baselineMetric =
    variant.records.find((row) => row.baseline)?.primary ?? null
  const overflow = variant.recordsTotal - variant.records.length
  // The answer before the machinery (§16.6): the cohort leader — a leading
  // unbeaten baseline is stated as such, never skipped for a slower entry —
  // and, when it differs, the fastest row passing deployability (§11.8).
  const top = variant.records[0]
  const deploy =
    top && !isDeployable(top)
      ? (variant.records.find(isDeployable) ?? null)
      : null
  const vsBaseline =
    top &&
    !top.baseline &&
    baselineMetric &&
    top.primary &&
    top.primary.value > 0 &&
    baselineMetric.value !== top.primary.value
      ? baselineMetric.value / top.primary.value
      : null

  return (
    <div onClickCapture={onClickCapture}>
      {top && (
        <div className="animate-row-in border-b border-border pb-6">
          <AnswerSlots
            top={top}
            topLabel={top.baseline ? "Source baseline · unbeaten" : undefined}
            deploy={deploy}
            vsBaseline={vsBaseline}
          />
        </div>
      )}
      <Section id="records" title="Current records">
        {/* The sweep table stays compact; the cohort panel uses the rest
            of the width instead of leaving it empty. */}
        <div className="mb-4 grid grid-cols-[minmax(0,1fr)_minmax(300px,370px)] gap-10 max-lg:grid-cols-1">
          <div>
            <WorkloadPicker
              workloads={workloads}
              selectedId={variant.selectedWorkloadId}
              slug={slug}
            />
            {variant.cohortOptions.length > 1 && (
              <div className="flex flex-wrap items-center gap-2 text-small">
                <span className="mr-1 text-faint">Hardware</span>
                {variant.cohortOptions.map((option) => (
                  <Link
                    key={option.key}
                    href={`/operations/${slug}?${new URLSearchParams({
                      ...(variant.selectedWorkloadId
                        ? { workload: variant.selectedWorkloadId }
                        : {}),
                      cohort: option.key,
                    }).toString()}`}
                    className={`key font-mono text-small whitespace-nowrap no-underline ${
                      option.key === variant.cohort?.comparisonKey
                        ? "key-on"
                        : "text-subtle hover:text-fg"
                    }`}
                  >
                    {option.label}
                    <span className="ml-1.5 text-mini text-faint">
                      {option.runs}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          {variant.cohort && (
            <div className="border-l border-border pl-9 max-lg:border-l-0 max-lg:pl-0">
              <div className="mb-2.5 text-small text-subtle">
                {variant.cohort.profile === "source_native"
                  ? "Source-native comparison"
                  : "Exact comparison"}
              </div>
              <KeyValueList
                items={[
                  ...variant.cohort.facts,
                  { key: "results", value: String(variant.recordsTotal) },
                  ...(lastObservedAt
                    ? [
                        {
                          key: "last observed",
                          value: formatDateUTC(lastObservedAt),
                        },
                      ]
                    : []),
                ]}
              />
              <WatchButton comparisonKey={variant.cohort.comparisonKey} />
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          {variant.records.length > 0 ? (
            <>
              <ResultTableHead relativeLabel="vs #1" />
              {variant.records.map((row) => (
                <ResultRowItem
                  key={row.runId ?? row.implementation.slug}
                  row={row}
                  best={best}
                  relative
                  baselineMetric={baselineMetric}
                />
              ))}
            </>
          ) : (
            <p className="py-6 text-body text-faint">
              No published measurement for the selected workload.
            </p>
          )}
        </div>
        {overflow > 0 && (
          <p className="mt-3 text-small text-faint">
            {overflow} more row{overflow === 1 ? "" : "s"} in this comparison
            group.{" "}
            <Link
              href={`/search?q=${encodeURIComponent(`op:${slug}`)}`}
              className="action"
            >
              Open all in search →
            </Link>
          </p>
        )}
      </Section>

      {variant.sweep && (
        <Section id="sweep" title={`Scaling by ${variant.sweep.axis}`}>
          <SweepChart sweep={variant.sweep} />
        </Section>
      )}
    </div>
  )
}
