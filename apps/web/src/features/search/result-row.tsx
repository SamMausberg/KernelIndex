import { Meter } from "@/components/meter"
import { Metric } from "@/components/metric"
import { Link } from "@/components/quiet-link"
import { TierChips, TrustCell } from "@/components/trust"
import type { PrimaryMetric, ResultRow } from "@/lib/catalog"
import {
  formatDateUTC,
  formatRelative,
  formatSolScoreCell,
  humanizeField,
} from "@/lib/format"

export const RESULT_GRID =
  "grid grid-cols-[44px_minmax(200px,1.6fr)_150px_112px_minmax(190px,1.1fr)_92px_28px] min-w-[820px]"

/** "Apache-2.0 · pip" — license state plus how the build is obtained. */
export function availabilityText(row: ResultRow) {
  const license = row.license.concluded ?? row.license.declared
  const install = row.install
    ? row.install.kind
    : row.sourceAvailable
      ? "source mirrored"
      : "no source"
  return `${license ?? "License unknown"} · ${install}`
}

/**
 * Header row for the result grid; kept beside the row so columns stay in
 * sync. `relativeLabel` titles the comparison column: "vs #1" when every row
 * shares one cohort, "Differs" for compatible matches, empty otherwise.
 */
export function ResultTableHead({ relativeLabel }: { relativeLabel?: string }) {
  return (
    <div
      className={`${RESULT_GRID} border-b border-border-strong font-mono text-label text-faint uppercase`}
    >
      <div className="py-2">#</div>
      <div className="py-2">Implementation</div>
      <div className="py-2 pr-3.5 text-right">Latency</div>
      <div className="py-2">{relativeLabel}</div>
      <div className="py-2">Trust</div>
      <div className="py-2">Observed</div>
      <div />
    </div>
  )
}

/**
 * The comparison cell: inside one cohort a meter against the leader (fuller
 * is faster, the text states the exact multiple); for compatible matches the
 * fields that differ from the request; otherwise nothing — cross-cohort
 * numbers are never implied comparable.
 */
function RelativeCell({
  row,
  best,
  relative,
}: {
  row: ResultRow
  best: PrimaryMetric | null
  relative: boolean
}) {
  if (relative && row.primary && best) {
    return (
      <div className="flex items-center gap-2 pr-3">
        <Meter fraction={best.value / row.primary.value} className="w-11" />
        <span className="font-mono text-mini text-subtle">
          {formatRelative(row.primary, best)}
        </span>
      </div>
    )
  }
  if (row.mismatches.length > 0) {
    return (
      <div className="truncate pr-3 text-small text-subtle">
        {row.mismatches
          .map((mismatch) => humanizeField(mismatch.field))
          .join(", ")}
      </div>
    )
  }
  return <div />
}

/** One plain-English line for the expansion: why the row sits where it does
 * plus the caveat that matters. License/source/install state lives in the
 * chips, so those caveats never repeat here. */
function whyLine(
  row: ResultRow,
  tied: boolean,
  baselineMetric: PrimaryMetric | null,
): string {
  const parts: string[] = []
  if (
    !row.baseline &&
    baselineMetric &&
    row.primary &&
    row.primary.value > 0 &&
    row.primary.value !== baselineMetric.value
  ) {
    const speedup = baselineMetric.value / row.primary.value
    parts.push(
      speedup > 1
        ? `${speedup.toFixed(2)}× faster than the baseline.`
        : `${(1 / speedup).toFixed(2)}× slower than the baseline.`,
    )
  }
  if (row.mismatches.length > 0)
    parts.push(
      `Differs from the request. ${row.mismatches
        .map(
          (mismatch) =>
            `${humanizeField(mismatch.field)}: requested ${mismatch.requested}, observed ${mismatch.observed}`,
        )
        .join("; ")}.`,
    )
  else if (row.match === "exact" && row.rank !== null)
    parts.push(
      `Measured exactly what you asked${
        tied ? "; tied ranks share a number" : ""
      }.`,
    )
  for (const caveat of row.caveats)
    if (!/^(license unknown|no public source)/i.test(caveat))
      parts.push(`${caveat}.`)
  return parts.join(" ")
}

/**
 * One dense result row (§16.7): five scannable facts, and one disclosure
 * away (§12) a single explanatory line, the availability chips, and the
 * three actions that matter — source, dossier, compare. Everything deeper
 * lives on the run dossier.
 */
export function ResultRowItem({
  row,
  best,
  compareWith = null,
  tiedWithNext = false,
  relative = false,
  baselineMetric = null,
}: {
  row: ResultRow
  best: PrimaryMetric | null
  /** Cohort leader's run ID; enables the row's compare action (§16.7). */
  compareWith?: string | null
  tiedWithNext?: boolean
  /** True only when every row shares one cohort with `best` (§16.7). */
  relative?: boolean
  /** The cohort's source-designated baseline, when one is in the group;
   * non-baseline expansions state the multiple against it. */
  baselineMetric?: PrimaryMetric | null
}) {
  const tied = row.tiedWithPrevious || tiedWithNext
  const rank = row.rank === null ? "—" : `${row.rank}${tied ? "=" : ""}`
  return (
    <details className="group row-cv border-b border-line">
      <summary
        className={`${RESULT_GRID} h-12 cursor-pointer list-none items-center transition-colors hover:bg-raised focus-visible:bg-raised [&::-webkit-details-marker]:hidden`}
      >
        <div
          className={`font-mono text-small ${
            row.rank === 1 ? "text-fg" : "text-faint"
          }`}
        >
          {rank}
        </div>
        <div className="min-w-0 truncate pr-3">
          <Link
            href={`/implementations/${row.implementation.slug}`}
            className="text-body text-fg hover:text-accent-bright"
          >
            {row.implementation.name}
          </Link>
          {row.baseline && (
            <span className="ml-2 font-mono text-label text-faint uppercase">
              baseline
            </span>
          )}
          {row.project.name !== row.implementation.name && (
            <span className="ml-2 text-small text-faint">
              {row.project.name}
            </span>
          )}
        </div>
        <div className="pr-3.5 text-right whitespace-nowrap">
          <Metric
            primary={row.primary}
            spread
            secondary={
              row.solScore !== null ? formatSolScoreCell(row.solScore) : null
            }
            valueClassName={`font-mono ${
              row.rank === 1 ? "text-lead" : "text-body"
            } text-fg`}
          />
        </div>
        <RelativeCell row={row} best={best} relative={relative} />
        <TrustCell row={row} />
        {/* Staleness is a freshness fact, not a warning (§16.16): the word
            carries it, amber stays reserved for act-on states. */}
        <div className="font-mono text-mini text-faint">
          {formatDateUTC(row.lastTestedAt)}
          {row.stale && <span className="ml-1.5 text-subtle">stale</span>}
        </div>
        <div
          aria-hidden="true"
          className="pr-1 text-right font-mono text-small text-faint transition-transform group-open:rotate-90"
        >
          ›
        </div>
      </summary>

      <div className="border-t border-line bg-surface py-3.5 pr-4 pl-11 max-md:pl-4">
        <p className="max-w-[96ch] text-small text-muted">
          {whyLine(row, tied, baselineMetric)}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-6 gap-y-2">
          <TierChips row={row} />
          <span className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            {row.sourceAvailable && (
              <Link
                href={`/implementations/${row.implementation.slug}#code`}
                className="action"
              >
                View source →
              </Link>
            )}
            {row.runId && (
              <Link href={`/runs/${row.runId}`} className="action">
                Run detail →
              </Link>
            )}
            {row.runId && compareWith && compareWith !== row.runId && (
              <Link
                href={`/compare?run=${compareWith}&run=${row.runId}`}
                className="action"
              >
                Compare with #1 →
              </Link>
            )}
          </span>
        </div>
      </div>
    </details>
  )
}
