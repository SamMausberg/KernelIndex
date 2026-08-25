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

// Below sm the same cells reflow into a card: operation · latency on the
// first line, implementation and hardware beneath (audit 2026-08-25).
const GRID =
  "grid grid-cols-[1.4fr_1.1fr_170px_120px] min-w-[780px] max-sm:min-w-0 max-sm:grid-cols-[minmax(0,1fr)_auto]"

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
            className={`${GRID} border-b border-border-strong font-mono text-label text-faint uppercase max-sm:hidden`}
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
                className={`${GRID} relative h-14 items-center border-b border-line transition-colors hover:bg-raised max-sm:h-auto max-sm:grid-flow-dense max-sm:py-2.5`}
              >
                <td className="truncate px-4 text-body max-sm:col-start-1">
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
                <td className="truncate px-4 max-sm:col-span-2 max-sm:col-start-1">
                  <Link
                    href={`/implementations/${row.implementation.slug}`}
                    className="relative z-10 text-body font-medium"
                  >
                    <ImplName name={row.implementation.name} />
                  </Link>
                </td>
                <td className="px-4 text-right whitespace-nowrap max-sm:col-start-2 max-sm:row-start-1">
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
                <td className="truncate px-4 font-mono text-small text-muted max-sm:col-span-2 max-sm:col-start-1">
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
