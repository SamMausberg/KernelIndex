import { ImplName } from "@/components/impl-name"
import { Metric } from "@/components/metric"
import { Link } from "@/components/quiet-link"
import type { RecordHolder } from "@/lib/catalog"
import {
  formatImprovement,
  formatPrimary,
  formatSolScoreCell,
  formatWorkloadSummary,
  shortHardware,
} from "@/lib/format"

const GRID = "grid grid-cols-[1.4fr_1.1fr_170px_120px] min-w-[780px]"

/** Homepage table of the newest record breaks (§16.5), four columns; trust
 * and indexing dates live on the run dossier a row opens. Each row is a
 * record holder; the margin rides under the value it qualifies (§16 row
 * diet), not in a column of its own. */
export function LatestRecords({ rows }: { rows: RecordHolder[] }) {
  if (rows.length === 0) {
    return (
      <p className="border-t border-border-strong py-8 text-body text-faint">
        No published records yet.
      </p>
    )
  }
  return (
    // A real table (audit 2026-08-25): screen readers get rows and column
    // headers. The grid layout rides on each <tr> (thead/tbody are
    // display:contents), so the visual system is unchanged.
    <div className="overflow-x-auto border-t border-border-strong">
      <table aria-label="Latest records" className="block">
        <thead className="contents">
          <tr
            className={`${GRID} border-b border-border-strong font-mono text-label text-faint uppercase`}
          >
            <th scope="col" className="px-4 py-2.5 text-left font-normal">
              Operation / workload
            </th>
            <th scope="col" className="px-4 py-2.5 text-left font-normal">
              Implementation
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-normal">
              Latency
            </th>
            <th scope="col" className="px-4 py-2.5 text-left font-normal">
              Hardware
            </th>
          </tr>
        </thead>
        <tbody className="contents">
          {rows.map((holder) => {
            const row = holder.current
            const event = holder.history[0]
            return (
              <tr
                key={holder.cohortKey}
                className={`${GRID} relative h-14 items-center border-b border-line transition-colors hover:bg-raised`}
              >
                <td className="truncate px-4 text-body">
                  {/* The whole row reaches the record's run dossier (inset-0
                  resolves against the row, the nearest positioned ancestor);
                  living inside the first cell keeps the table row valid. The
                  cell links sit above it (no nested anchors). */}
                  {row.runId && (
                    <Link
                      href={`/runs/${row.runId}`}
                      aria-label={`Record run for ${row.operation.name}`}
                      className="absolute inset-0"
                    />
                  )}
                  <Link
                    href={`/operations/${row.operation.slug}`}
                    className="relative z-10 text-fg hover:text-accent-bright"
                  >
                    {row.operation.name}
                  </Link>
                  <span className="ml-2 font-mono text-mini text-faint">
                    {formatWorkloadSummary(holder.workloadSummary)}
                  </span>
                </td>
                <td className="truncate px-4">
                  <Link
                    href={`/implementations/${row.implementation.slug}`}
                    className="relative z-10 text-body font-medium"
                  >
                    <ImplName name={row.implementation.name} />
                  </Link>
                </td>
                <td className="px-4 text-right whitespace-nowrap">
                  <Metric
                    primary={row.primary}
                    secondary={
                      row.solScore !== null
                        ? formatSolScoreCell(row.solScore)
                        : null
                    }
                    valueClassName="font-mono text-lead font-medium text-fg"
                  />
                  <div className="font-mono text-mini text-faint">
                    {formatImprovement(event?.improvementPct) &&
                    event?.previousValue
                      ? `${formatImprovement(event.improvementPct)} · was ${formatPrimary(event.previousValue)}`
                      : "first"}
                  </div>
                </td>
                <td className="truncate px-4 font-mono text-small text-muted">
                  {shortHardware(holder.hardware)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
