import Link from "next/link"
import { Meter } from "@/components/meter"
import type { PrimaryMetric, ResultRow } from "@/lib/catalog"
import {
  evidenceLabel,
  formatDateShort,
  formatDateUTC,
  formatPrimary,
  formatRelative,
  formatSpread,
} from "@/lib/format"

export const RESULT_GRID =
  "grid grid-cols-[44px_minmax(240px,1.6fr)_150px_118px_140px_minmax(150px,1fr)_78px_120px_28px] min-w-[1190px]"

/** "Apache-2.0 · pip" — license state plus how the build is obtained. */
export function availabilityText(row: ResultRow) {
  const license = row.license.concluded ?? row.license.declared
  const install = row.install
    ? row.install.kind
    : row.sourceAvailable
      ? "source only"
      : "no source"
  return `${license ?? "License unknown"} · ${install}`
}

function EvidenceCell({ row }: { row: ResultRow }) {
  const strong = row.evidence === "verified" || row.evidence === "replicated"
  return (
    <div className={`text-[12.5px] ${strong ? "text-fg" : "text-subtle"}`}>
      {strong && <span className="mr-1.5 text-[9px] text-success">●</span>}
      {evidenceLabel(row.evidence)}
    </div>
  )
}

/**
 * Header row for the result grid; kept beside the row so columns stay in
 * sync. `relativeLabel` titles the comparison column: "vs #1" when every row
 * shares one cohort, "Differs" for compatible matches, empty otherwise.
 */
export function ResultTableHead({ relativeLabel }: { relativeLabel?: string }) {
  return (
    <div
      className={`${RESULT_GRID} border-b border-border-strong text-[11.5px] text-faint`}
    >
      <div className="py-2">#</div>
      <div className="py-2">Implementation</div>
      <div className="py-2 pr-3.5 text-right">Median</div>
      <div className="py-2">{relativeLabel}</div>
      <div className="py-2">Evidence</div>
      <div className="py-2">Availability</div>
      <div className="py-2">Tested</div>
      <div />
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
        <span className="font-mono text-[11.5px] text-subtle">
          {formatRelative(row.primary, best)}
        </span>
      </div>
    )
  }
  if (row.mismatches.length > 0) {
    return (
      <div className="truncate pr-3 text-[12px] text-subtle">
        {row.mismatches.map((mismatch) => mismatch.field).join(", ")}
      </div>
    )
  }
  return <div />
}

/**
 * One dense result row (§16.7): six scannable facts, secondary actions on
 * hover/focus, full reasoning and evidence one disclosure away (§12).
 */
export function ResultRowItem({
  row,
  best,
  compareWith = null,
  tiedWithNext = false,
  relative = false,
}: {
  row: ResultRow
  best: PrimaryMetric | null
  /** Cohort leader's run ID; enables the row's compare action (§16.7). */
  compareWith?: string | null
  tiedWithNext?: boolean
  /** True only when every row shares one cohort with `best` (§16.7). */
  relative?: boolean
}) {
  const tied = row.tiedWithPrevious || tiedWithNext
  const rank = row.rank === null ? "—" : `${row.rank}${tied ? "=" : ""}`
  const availabilityWarns =
    row.license.concluded === null || !row.sourceAvailable
  return (
    <details className="group border-b border-line">
      <summary
        className={`${RESULT_GRID} h-[47px] cursor-pointer list-none items-center transition-colors hover:bg-raised focus-visible:bg-raised [&::-webkit-details-marker]:hidden`}
      >
        <div
          className={`font-mono text-[12.5px] ${
            row.rank === 1 ? "text-fg" : "text-faint"
          }`}
        >
          {rank}
        </div>
        <div className="min-w-0 truncate pr-3">
          <Link
            href={`/implementations/${row.implementation.slug}`}
            className="font-mono text-[13px] text-fg hover:text-accent-bright"
          >
            {row.implementation.name}
          </Link>
          <span className="ml-2 text-[12px] text-faint">
            {row.project.name}
          </span>
        </div>
        <div className="pr-3.5 text-right whitespace-nowrap">
          <span
            className={`font-mono ${
              row.rank === 1 ? "text-[14.5px]" : "text-[13.5px]"
            } ${row.primary ? "text-fg" : "text-faint"}`}
          >
            {row.primary ? formatPrimary(row.primary) : "no run"}
          </span>{" "}
          <span className="font-mono text-[11px] text-faint">
            {row.primary ? formatSpread(row.primary) : null}
          </span>
        </div>
        <RelativeCell row={row} best={best} relative={relative} />
        <EvidenceCell row={row} />
        <div
          className={`truncate pr-3 text-[12.5px] ${
            availabilityWarns ? "text-warning" : "text-subtle"
          }`}
        >
          {availabilityText(row)}
        </div>
        <div
          className={`font-mono text-[11.5px] ${
            row.stale ? "text-warning" : "text-faint"
          }`}
        >
          {formatDateShort(row.lastTestedAt)}
        </div>
        <div className="text-right text-[12px] whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100 group-open:opacity-100 group-focus-within:opacity-100">
          <Link href={`/implementations/${row.implementation.slug}`}>
            Source
          </Link>
          {row.runId && (
            <>
              <span className="text-ghost"> · </span>
              <Link href={`/runs/${row.runId}`}>Evidence</Link>
            </>
          )}
        </div>
        <div
          aria-hidden="true"
          className="pr-1 text-right font-mono text-[12px] text-faint transition-transform group-open:rotate-90"
        >
          ›
        </div>
      </summary>

      <div className="border-t border-line bg-surface pr-3 pb-[18px] pl-11">
        <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-7 pt-3.5">
          <div>
            <div className="text-[11.5px] tracking-[0.03em] text-faint uppercase">
              {row.mismatches.length > 0
                ? "Mismatch against the request"
                : row.primary === null
                  ? "Why there is no number"
                  : "Why ranked here"}
            </div>
            {row.mismatches.map((mismatch) => (
              <div
                key={mismatch.field}
                className="mt-2 flex gap-[9px] text-[12.5px]"
              >
                <span className="flex-none pt-px font-mono text-[11.5px] text-warning">
                  {mismatch.field}
                </span>
                <span className="text-muted">
                  requested {mismatch.requested}, observed {mismatch.observed}
                </span>
              </div>
            ))}
            {row.match === "exact" && row.rank !== null && (
              <p className="mt-2 text-[12.5px] text-muted">
                Same workload, protocol, environment, and correctness policy as
                the request. Ordered by primary metric
                {tied ? "; statistically tied ranks share a number" : ""}.
              </p>
            )}
            {row.caveats.map((caveat) => (
              <div key={caveat} className="mt-2 flex gap-2 text-[12.5px]">
                <span className="pt-px text-[9px] text-warning">●</span>
                <span className="text-muted">{caveat}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="text-[11.5px] tracking-[0.03em] text-faint uppercase">
              Evidence
            </div>
            {[
              {
                k: "Run",
                v: row.runId ? `${row.runId.slice(0, 13)}…` : "no run",
              },
              { k: "vs #1", v: formatRelative(row.primary, best) },
              {
                k: "Statistic",
                v: row.primary
                  ? `${row.primary.statistic} of ${row.primary.sampleCount ?? "unknown"}`
                  : "—",
              },
              { k: "License declared", v: row.license.declared ?? "unknown" },
              { k: "License concluded", v: row.license.concluded ?? "unknown" },
              { k: "Last tested", v: formatDateUTC(row.lastTestedAt) },
            ].map((entry) => (
              <div
                key={entry.k}
                className="mt-2 flex justify-between gap-3.5 border-b border-line pb-[6px]"
              >
                <span className="text-[12px] text-subtle">{entry.k}</span>
                <span className="text-right font-mono text-[12px] break-all text-muted">
                  {entry.v}
                </span>
              </div>
            ))}
            <div className="mt-3 flex gap-4 text-[12.5px]">
              {row.runId && (
                <Link href={`/runs/${row.runId}`}>Run dossier →</Link>
              )}
              <Link href={`/implementations/${row.implementation.slug}`}>
                Implementation
              </Link>
              <Link href={`/operations/${row.operation.slug}`}>Operation</Link>
              {row.runId && compareWith && compareWith !== row.runId && (
                <Link href={`/compare?run=${compareWith}&run=${row.runId}`}>
                  Compare with #1
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </details>
  )
}
