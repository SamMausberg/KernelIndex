// The serving default view (§16.13): the corpus summarized to one row per
// model × workload, best reported-throughput configuration leading. Each row
// opens the narrowed resolver, where the cohort stream and Pareto view live.
import { Link } from "@/components/quiet-link"
import type { ServingOverviewRow } from "@/lib/serving-models"

const GRID =
  "grid grid-cols-[minmax(200px,1.1fr)_minmax(180px,1fr)_120px_minmax(190px,1.1fr)_minmax(180px,1fr)_80px] gap-x-4 min-w-[1000px]"

export function ServingOverview({ rows }: { rows: ServingOverviewRow[] }) {
  if (rows.length === 0)
    return <p className="py-8 text-body text-faint">No serving results yet.</p>
  return (
    <div className="overflow-x-auto">
      <div
        className={`${GRID} border-b border-border-strong font-mono text-label text-faint uppercase`}
      >
        <div className="py-2">Model</div>
        <div className="py-2">Benchmark</div>
        <div className="py-2 pr-2 text-right">Best tokens/s</div>
        <div className="py-2">Stack</div>
        <div className="py-2">Hardware</div>
        <div className="py-2 pr-1 text-right">Configs</div>
      </div>
      {rows.map((row) => (
        <Link
          key={`${row.model.slug}-${row.workload.slug}`}
          href={`/serving?model=${encodeURIComponent(row.model.slug)}&workload=${encodeURIComponent(row.workload.slug)}`}
          className={`${GRID} h-12 items-center border-b border-line text-fg transition-colors hover:bg-raised no-underline`}
        >
          <span className="min-w-0 truncate text-body">{row.model.name}</span>
          <span className="min-w-0 truncate font-mono text-small text-subtle">
            {row.workload.name}
          </span>
          <span className="pr-2 text-right font-mono text-lead font-medium">
            {row.best
              ? Math.round(row.best.throughput).toLocaleString("en-US")
              : "…"}
          </span>
          <span className="min-w-0 truncate font-mono text-small text-muted">
            {row.best?.stack}
          </span>
          <span className="min-w-0 truncate font-mono text-small text-subtle">
            {row.best && `${row.best.totalAccelerators}× ${row.best.hardware}`}
          </span>
          <span className="pr-1 text-right font-mono text-small text-faint">
            {row.configurations}
          </span>
        </Link>
      ))}
    </div>
  )
}
