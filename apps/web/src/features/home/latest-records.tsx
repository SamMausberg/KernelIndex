import { Metric } from "@/components/metric"
import { Link } from "@/components/quiet-link"
import type { RecordHolder } from "@/lib/catalog"
import {
  formatImprovement,
  formatPrimary,
  formatSolScoreCell,
} from "@/lib/format"

const GRID = "grid grid-cols-[1.3fr_1.2fr_110px_195px_120px] min-w-[900px]"

/** Homepage table of the newest record breaks (§16.5), five columns; trust
 * and indexing dates live on the run dossier a row opens. Each row is a
 * record holder; the margin column states what the run displaced. */
export function LatestRecords({ rows }: { rows: RecordHolder[] }) {
  if (rows.length === 0) {
    return (
      <p className="border-t border-border-strong py-8 text-body text-faint">
        No published records yet.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto border-t border-border-strong">
      <div
        className={`${GRID} border-b border-border-strong font-mono text-label text-faint uppercase`}
      >
        <div className="px-4 py-2.5">Operation / workload</div>
        <div className="px-4 py-2.5">Implementation</div>
        <div className="px-4 py-2.5 text-right">Latency</div>
        <div className="px-4 py-2.5">Margin</div>
        <div className="px-4 py-2.5">Hardware</div>
      </div>
      {rows.map((holder) => {
        const row = holder.current
        const event = holder.history[0]
        return (
          <div
            key={holder.cohortKey}
            className={`${GRID} relative h-14 items-center border-b border-line transition-colors hover:bg-raised`}
          >
            {/* The whole row reaches the record's run dossier; the cell
                links sit above it (no nested anchors). */}
            {row.runId && (
              <Link
                href={`/runs/${row.runId}`}
                aria-label={`Record run for ${row.operation.name}`}
                className="absolute inset-0"
              />
            )}
            <div className="truncate px-4 text-body">
              <Link
                href={`/operations/${row.operation.slug}`}
                className="relative z-10 text-fg hover:text-accent-bright"
              >
                {row.operation.name}
              </Link>
              <span className="ml-2 font-mono text-mini text-faint">
                {holder.workloadSummary}
              </span>
            </div>
            <div className="truncate px-4">
              <Link
                href={`/implementations/${row.implementation.slug}`}
                className="relative z-10 text-body font-medium"
              >
                {row.implementation.name}
              </Link>
            </div>
            <div className="px-4 text-right whitespace-nowrap">
              <Metric
                primary={row.primary}
                secondary={
                  row.solScore !== null
                    ? formatSolScoreCell(row.solScore)
                    : null
                }
                valueClassName="font-mono text-lead font-medium text-fg"
              />
            </div>
            <div className="truncate px-4 font-mono text-small whitespace-nowrap">
              {formatImprovement(event?.improvementPct) &&
              event?.previousValue ? (
                <span className="text-subtle">
                  {formatImprovement(event.improvementPct)}
                  <span className="text-faint">
                    {" "}
                    · was {formatPrimary(event.previousValue)}
                  </span>
                </span>
              ) : (
                <span className="text-faint">first</span>
              )}
            </div>
            <div className="truncate px-4 font-mono text-small text-muted">
              {holder.hardware}
            </div>
          </div>
        )
      })}
    </div>
  )
}
