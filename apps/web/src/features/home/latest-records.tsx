import Link from "next/link"
import type { ResultRow } from "@/lib/catalog"
import { evidenceLabel, formatDateUTC, formatPrimary } from "@/lib/format"

const GRID =
  "grid grid-cols-[1.2fr_1.4fr_110px_140px_160px_110px] min-w-[900px]"

/** Homepage table of the most recent published records (§16.5). */
export function LatestRecords({ rows }: { rows: ResultRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="border-t border-edge py-6 text-[13.5px] text-subtle">
        No published records yet.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto border-t border-edge">
      <div
        className={`${GRID} border-b border-border-strong text-[12px] tracking-[0.01em] text-faint`}
      >
        <div className="px-4 py-2.5">Operation / workload</div>
        <div className="px-4 py-2.5">Implementation</div>
        <div className="px-4 py-2.5 text-right">Median</div>
        <div className="px-4 py-2.5">Hardware</div>
        <div className="px-4 py-2.5">Evidence</div>
        <div className="px-4 py-2.5 text-right">Set</div>
      </div>
      {rows.map((row) => (
        <div
          key={row.runId ?? row.implementation.slug}
          className={`${GRID} items-center border-b border-line transition-colors hover:bg-raised`}
        >
          <div className="truncate px-4 py-3.5 font-mono text-[13px] text-fg">
            {row.operation.name} · {row.workloadSummary}
          </div>
          <div className="truncate px-4 py-3.5">
            <Link
              href={`/implementations/${row.implementation.slug}`}
              className="font-mono text-[13px]"
            >
              {row.implementation.name}
            </Link>
          </div>
          <div className="px-4 py-3.5 text-right font-mono text-[13px] tabular-nums">
            {row.primary ? formatPrimary(row.primary) : "—"}
          </div>
          <div className="px-4 py-3.5 font-mono text-[13px] text-muted">
            {row.hardware.model}
          </div>
          <div
            className={`px-4 py-3.5 text-[13px] ${
              row.evidence === "verified" || row.evidence === "replicated"
                ? "text-fg"
                : "text-subtle"
            }`}
          >
            {evidenceLabel(row.evidence)}
          </div>
          <div className="px-4 py-3.5 text-right font-mono text-[13px] text-subtle">
            {formatDateUTC(row.lastTestedAt)}
          </div>
        </div>
      ))}
    </div>
  )
}
