"use client"

import { startTransition, useEffect, useState } from "react"
import { ExpandRows } from "@/components/expand-rows"
import { Link } from "@/components/quiet-link"
import { Section } from "@/components/section"
import {
  AnswerSlots,
  ByLanguage,
  isDeployable,
} from "@/features/answer/answer-slots"
import { FollowButton } from "@/features/follow/follow-button"
import { ResultRowItem, ResultTableHead } from "@/features/search/result-row"
import type { HeadroomEstimate, WorkloadOption } from "@/lib/catalog"
import { formatDateUTC, formatLatency, formatPrimary } from "@/lib/format"
import { HERO_GPUS } from "@/lib/priority"
import { SweepChart } from "./sweep"
import type { OperationVariant } from "./variant"
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

const ENV_GRID =
  "grid grid-cols-[minmax(150px,1.2fr)_110px_minmax(150px,1fr)_48px] items-baseline gap-x-4"

/** headroom-v1 (§11.9): the roofline estimate under the cohort record,
 * labeled as an estimate in the same breath as the numbers. The
 * assumptions open on demand; nothing here is evidence. */
function HeadroomNote({ headroom }: { headroom: HeadroomEstimate }) {
  const binding =
    headroom.computeFloorNs !== null &&
    headroom.computeFloorNs >= headroom.dramFloorNs
      ? "compute"
      : "bandwidth"
  return (
    <details className="group mt-3 border-t border-line pt-2.5">
      <summary className="cursor-pointer list-none text-small [&::-webkit-details-marker]:hidden">
        <span className="text-subtle">Estimated floor</span>{" "}
        <span className="font-mono text-fg">
          {formatLatency(headroom.floorNs)}
        </span>{" "}
        <span className="font-mono text-subtle">
          · record {headroom.ratio}× above it
        </span>
        <span className="ml-2 text-mini text-faint">
          estimate, not evidence ›
        </span>
      </summary>
      <div className="mt-2 space-y-1 text-mini text-faint">
        <div className="font-mono text-subtle">
          DRAM {formatLatency(headroom.dramFloorNs)}
          {headroom.computeFloorNs !== null &&
            ` · compute ${formatLatency(headroom.computeFloorNs)}`}{" "}
          · {binding}-bound on {headroom.hardware}
        </div>
        {headroom.assumptions.map((assumption) => (
          <div key={assumption}>{assumption}</div>
        ))}
        <div>
          {headroom.policyVersion}: a lower bound from declared tensors and
          datasheet peaks. A kernel can sit well above it for good reasons.
        </div>
      </div>
    </details>
  )
}

export function OperationRecords({
  slug,
  operationName,
  workloads,
  lastObservedAt,
  initial,
}: {
  slug: string
  operationName: string
  workloads: WorkloadOption[]
  lastObservedAt: string | null
  initial: OperationVariant
}) {
  const [variant, setVariant] = useState(initial)
  const cohortHref = (key: string) =>
    `/operations/${slug}?${new URLSearchParams({
      ...(variant.selectedWorkloadId
        ? { workload: variant.selectedWorkloadId }
        : {}),
      cohort: key,
    }).toString()}`

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

  // §16.8 coverage gaps, stated for the selected workload: the priority
  // GPUs with no measured environment here. A zero stated is a fact.
  const missing = HERO_GPUS.filter(
    (gpu) =>
      !variant.cohortOptions.some((option) => option.label.includes(gpu)),
  ).map((gpu) => gpu.replace("NVIDIA ", ""))
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
        <div className="border-b border-border pb-6">
          <AnswerSlots
            top={top}
            topLabel={top.baseline ? "Source baseline · unbeaten" : undefined}
            deploy={deploy}
            vsBaseline={vsBaseline}
          />
          <ByLanguage rows={variant.records} />
        </div>
      )}
      <Section id="records" title="Current records">
        {/* One scope zone (§16 page grammar): the workload picker and the
            environment chooser are the only machinery between the section
            heading and the table. */}
        <div className="mb-4 max-w-[760px]">
          <WorkloadPicker
            workloads={workloads}
            selectedId={variant.selectedWorkloadId}
            slug={slug}
          />
          {/* The environment chooser states what each cohort holds (§16.8
              coverage made positive): its best known run, not only a
              label. The selected row reads as the current cohort. */}
          {variant.cohortOptions.length > 1 && (
            <div className="text-small">
              <div
                className={`${ENV_GRID} border-b border-border-strong pb-1.5 font-mono text-label text-faint uppercase`}
              >
                <span>Hardware</span>
                <span className="text-right">Best known</span>
                <span>Implementation</span>
                <span className="text-right">Runs</span>
              </div>
              <ExpandRows
                cap={6}
                noun="environments"
                rows={variant.cohortOptions.map((option) => {
                  const selected = option.key === variant.cohort?.comparisonKey
                  return (
                    <Link
                      key={option.key}
                      href={cohortHref(option.key)}
                      aria-current={selected ? "true" : undefined}
                      className={`${ENV_GRID} border-b border-line py-1.5 no-underline transition-colors hover:bg-raised ${
                        selected ? "text-fg" : "text-subtle"
                      }`}
                    >
                      <span className="truncate font-mono">{option.label}</span>
                      <span className="text-right font-mono">
                        {option.head ? formatPrimary(option.head.primary) : "—"}
                      </span>
                      <span className="truncate">
                        {option.head?.implementation.name ?? "no ranked run"}
                      </span>
                      <span className="text-right font-mono text-faint">
                        {option.runs}
                      </span>
                    </Link>
                  )
                })}
              />
            </div>
          )}
          {variant.records.length > 0 && missing.length > 0 && (
            <p className="mt-2.5 text-small text-faint">
              Not measured on {missing.join(", ")} for this workload.{" "}
              <Link href="/challenges" prefetch={false} className="text-small">
                Challenges →
              </Link>
            </p>
          )}
        </div>
        {/* The cohort's facts as one quiet line over the table (§16 row
            diet), replacing the old side panel; the headroom estimate keeps
            its disclosure beneath it. */}
        {variant.cohort && (
          <div className="mb-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5">
              <span className="min-w-0 font-mono text-mini text-subtle">
                <span className="font-sans text-faint">
                  {variant.cohort.profile === "source_native"
                    ? "Source-native comparison"
                    : "Exact comparison"}
                  {" · "}
                </span>
                {[
                  ...variant.cohort.facts.map(
                    (fact) => `${fact.key} ${fact.value}`,
                  ),
                  `${variant.recordsTotal} results`,
                  ...(lastObservedAt
                    ? [`last observed ${formatDateUTC(lastObservedAt)}`]
                    : []),
                ].join(" · ")}
              </span>
              <span className="flex items-baseline gap-x-5">
                <Link
                  href={`/records?view=history&f=${encodeURIComponent(operationName)}`}
                  prefetch={false}
                  className="text-small whitespace-nowrap"
                >
                  Record history →
                </Link>
                <FollowButton
                  kind="cohort"
                  followKey={variant.cohort.comparisonKey}
                  label={`${operationName} · ${
                    variant.cohortOptions.find(
                      (option) => option.key === variant.cohort?.comparisonKey,
                    )?.label ?? "cohort"
                  }`}
                  href={cohortHref(variant.cohort.comparisonKey)}
                  noun="cohort"
                />
              </span>
            </div>
            {variant.headroom && <HeadroomNote headroom={variant.headroom} />}
          </div>
        )}
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
