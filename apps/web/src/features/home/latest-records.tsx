import Link from "next/link"
import { Metric } from "@/components/metric"
import type { ResultRow } from "@/lib/catalog"
import { evidenceLabel, formatDateUTC } from "@/lib/format"

const GRID =
  "grid grid-cols-[1.2fr_1.4fr_110px_150px_150px_110px] min-w-[920px]"

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
        className={`${GRID} border-b border-border-strong text-[11.5px] tracking-[0.01em] text-faint`}
      >
        <div className="px-4 py-2.5">Operation / workload</div>
        <div className="px-4 py-2.5">Implementation</div>
        <div className="px-4 py-2.5 text-right">Median</div>
        <div className="px-4 py-2.5">Hardware</div>
        <div className="px-4 py-2.5">Evidence</div>
        <div className="px-4 py-2.5 text-right">Set</div>
      </div>
      {rows.map((row) => {
        const strong =
          row.evidence === "verified" || row.evidence === "replicated"
        return (
          <div
            key={row.runId ?? row.implementation.slug}
            className={`${GRID} h-[52px] items-center border-b border-line transition-colors hover:bg-raised`}
          >
            <div className="truncate px-4 text-[13px]">
              <span className="text-fg">{row.operation.name}</span>
              <span className="ml-2 font-mono text-[11.5px] text-faint">
                {row.workloadSummary}
              </span>
            </div>
            <div className="truncate px-4">
              <Link
                href={`/implementations/${row.implementation.slug}`}
                className="text-[13px]"
              >
                {row.implementation.name}
              </Link>
            </div>
            <div className="px-4 text-right whitespace-nowrap">
              <Metric
                primary={row.primary}
                valueClassName="font-mono text-[13.5px] text-fg"
              />
            </div>
            <div className="truncate px-4 font-mono text-[12.5px] text-muted">
              {row.hardware.model}
            </div>
            <div
              className={`px-4 text-[12.5px] ${strong ? "text-fg" : "text-subtle"}`}
            >
              {strong && (
                <span className="mr-1.5 text-[9px] text-success">●</span>
              )}
              {evidenceLabel(row.evidence)}
            </div>
            <div className="px-4 text-right font-mono text-[12px] text-faint">
              {formatDateUTC(row.lastTestedAt)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
