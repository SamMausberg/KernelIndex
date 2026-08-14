import Link from "next/link"
import type { PrimaryMetric, ResultRow } from "@/lib/catalog"
import {
  evidenceLabel,
  formatDateShort,
  formatDateUTC,
  formatPrimary,
  formatRelative,
  formatSpread,
} from "@/lib/format"

const GRID =
  "grid grid-cols-[40px_minmax(220px,1.6fr)_150px_64px_150px_minmax(150px,1fr)_76px_26px] min-w-[980px]"

type Tone = "success" | "warning" | "muted"
const TONE: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  muted: "text-subtle",
}

/** Expanded-row reasoning lines: eligibility, mismatches, caveats (§16.7). */
function whyLines(row: ResultRow) {
  const lines: { code: string; tone: Tone; text: string }[] = []
  if (row.match === "exact" && row.rank !== null) {
    lines.push({
      code: "ELIGIBLE",
      tone: "success",
      text: "Same workload, protocol, environment, and correctness policy as the request.",
    })
    lines.push({
      code: `RANK_${row.rank}${row.tiedWithPrevious ? "=" : ""}`,
      tone: "muted",
      text: "Ordered by primary metric inside the comparison cohort. Statistical tie policy arrives with ranking v1.",
    })
  }
  for (const mismatch of row.mismatches) {
    lines.push({
      code: mismatch.field,
      tone: "warning",
      text: `requested ${mismatch.requested}, observed ${mismatch.observed}`,
    })
  }
  for (const caveat of row.caveats) {
    lines.push({ code: "NOTE", tone: "warning", text: caveat })
  }
  if (row.stale) {
    lines.push({
      code: "STALE",
      tone: "warning",
      text: `Not retested recently — last observed ${formatDateUTC(row.lastTestedAt)}.`,
    })
  }
  return lines
}

function whyTitle(row: ResultRow) {
  if (row.mismatches.length > 0) return "Mismatch against the request"
  if (row.primary === null) return "Why there is no number"
  return "Why ranked here"
}

function licenseText(row: ResultRow) {
  const license = row.license.concluded ?? row.license.declared
  const install = row.installable
    ? "installable"
    : row.sourceAvailable
      ? "source only"
      : "no source"
  return `${license ?? "License unknown"} · ${install}`
}

export function ResultRowItem({
  row,
  best,
}: {
  row: ResultRow
  best: PrimaryMetric | null
}) {
  const rank = row.rank === null ? "—" : `${row.rank}`
  const kv = [
    { k: "Run", v: row.runId ? `${row.runId.slice(0, 13)}…` : "no run" },
    {
      k: "Statistic",
      v: row.primary
        ? `${row.primary.statistic} of ${row.primary.sampleCount ?? "unknown"}`
        : "—",
    },
    { k: "License declared", v: row.license.declared ?? "unknown" },
    { k: "License concluded", v: row.license.concluded ?? "unknown" },
    { k: "Last tested", v: formatDateUTC(row.lastTestedAt) },
  ]
  return (
    <details className="group border-b border-line">
      <summary
        className={`${GRID} cursor-pointer list-none items-center transition-colors hover:bg-raised [&::-webkit-details-marker]:hidden`}
      >
        <div
          className={`py-2.5 font-mono text-[12.5px] tabular-nums ${
            row.rank === 1
              ? "text-fg"
              : row.rank !== null
                ? "text-muted"
                : "text-faint"
          }`}
        >
          {rank}
        </div>
        <div className="min-w-0 truncate py-2.5 pr-3">
          <Link
            href={`/implementations/${row.implementation.slug}`}
            className="font-mono text-[13.5px]"
          >
            {row.implementation.name}
          </Link>
          <span className="ml-2.5 text-[12.5px] text-faint">
            {row.project.name}
          </span>
        </div>
        <div className="py-2.5 pr-[18px] text-right whitespace-nowrap">
          <span
            className={`font-mono text-[14.5px] tabular-nums ${
              row.primary ? "text-fg" : "text-faint"
            }`}
          >
            {row.primary ? formatPrimary(row.primary) : "no run"}
          </span>{" "}
          <span className="font-mono text-[11.5px] text-faint">
            {row.primary ? formatSpread(row.primary) : null}
          </span>
        </div>
        <div className="font-mono text-[12px] text-faint tabular-nums">
          {formatRelative(row.primary, best)}
        </div>
        <div
          className={`text-[13px] ${
            row.evidence === "verified" || row.evidence === "replicated"
              ? "text-fg"
              : "text-subtle"
          }`}
        >
          {evidenceLabel(row.evidence)}
        </div>
        <div
          className={`truncate pr-3.5 text-[13px] ${
            row.license.concluded === null || !row.sourceAvailable
              ? "text-warning"
              : "text-subtle"
          }`}
        >
          {licenseText(row)}
        </div>
        <div
          className={`font-mono text-[12px] ${
            row.stale ? "text-warning" : "text-subtle"
          }`}
        >
          {formatDateShort(row.lastTestedAt)}
        </div>
        <div className="text-right font-mono text-[13px] text-faint">
          <span className="group-open:hidden">+</span>
          <span className="hidden group-open:inline">−</span>
        </div>
      </summary>
      <div className="border-t border-line bg-surface pt-0.5 pr-3 pb-[18px] pl-10">
        <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-7 pt-3.5">
          <div>
            <div className="font-mono text-[11px] tracking-[0.03em] text-subtle uppercase">
              {whyTitle(row)}
            </div>
            {whyLines(row).map((line) => (
              <div
                key={`${line.code}:${line.text}`}
                className="mt-2 flex gap-[9px] text-[13px] leading-normal"
              >
                <span
                  className={`flex-none pt-px font-mono text-[11.5px] ${TONE[line.tone]}`}
                >
                  {line.code}
                </span>
                <span className="text-muted">{line.text}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="font-mono text-[11px] tracking-[0.03em] text-subtle uppercase">
              Evidence
            </div>
            {kv.map((entry) => (
              <div
                key={entry.k}
                className="mt-2 flex justify-between gap-3.5 border-b border-line pb-[7px]"
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
            </div>
          </div>
        </div>
      </div>
    </details>
  )
}
