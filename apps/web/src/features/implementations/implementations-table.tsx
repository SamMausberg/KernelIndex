import { ExpandRows } from "@/components/expand-rows"
import { ImplName } from "@/components/impl-name"
import { Metric } from "@/components/metric"
import { Link } from "@/components/quiet-link"
import { AvailabilityCell, EvidenceCell } from "@/components/trust"
import type { ImplementationSummary } from "@/lib/catalog"

type Row = ImplementationSummary & {
  operation?: { name: string; slug: string }
}

const OPERATION_GRID =
  "grid min-w-[1080px] grid-cols-[minmax(240px,1.5fr)_minmax(170px,1fr)_150px_150px_130px_minmax(150px,1fr)]"
const SINGLE_GRID =
  "grid min-w-[980px] grid-cols-[minmax(240px,1.6fr)_150px_150px_130px_minmax(150px,1fr)]"

/**
 * The implementations table shared by the operation and project pages
 * (§16.15 two-use rule). On one operation every best latency states its
 * multiple of the fastest (the house ratio notation, §16.7); across
 * operations (`withOperation`) no multiple is computed, since the rows come
 * from different cohorts and are never comparable (§11.1).
 */
export function ImplementationsTable({
  rows,
  withOperation = false,
  cap = 8,
  noun = "implementations",
}: {
  rows: Row[]
  withOperation?: boolean
  cap?: number
  noun?: string
}) {
  const grid = withOperation ? OPERATION_GRID : SINGLE_GRID
  const fastest = withOperation
    ? Number.NaN
    : Math.min(
        ...rows
          .map((impl) => impl.bestPrimary?.value)
          .filter((value): value is number => value !== undefined),
      )
  const multiple = (value: number | undefined) =>
    value !== undefined && Number.isFinite(fastest) && fastest > 0
      ? `${(value / fastest).toFixed(2)}×`
      : null
  return (
    <div className="overflow-x-auto">
      <div
        className={`${grid} border-b border-border-strong font-mono text-label text-faint uppercase`}
      >
        <div className="py-2">Implementation</div>
        {withOperation && <div className="py-2">Operation</div>}
        <div className="py-2">Runtime</div>
        <div className="py-2 pr-3.5 text-right">Best latency</div>
        <div className="py-2">Evidence</div>
        <div className="py-2">Availability</div>
      </div>
      {/* Slugs can repeat when an implementation appears once per revision
          or evidence source; the list is server-rendered and never
          reordered, so the index is a safe disambiguator. */}
      <ExpandRows
        cap={cap}
        noun={noun}
        rows={rows.map((impl, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static read-only rows
            key={`${impl.slug}-${index}`}
            className={`${grid} items-center border-b border-line transition-colors hover:bg-raised`}
          >
            <div className="min-w-0 truncate py-3 pr-3">
              <Link
                href={`/implementations/${impl.slug}`}
                className="text-body"
              >
                <ImplName name={impl.name} />
              </Link>
              {impl.project.name !== impl.name && (
                <span className="ml-2 text-small text-faint">
                  {impl.project.name}
                </span>
              )}
            </div>
            {withOperation && impl.operation && (
              <div className="min-w-0 truncate py-3 pr-3">
                <Link
                  href={`/operations/${impl.operation.slug}`}
                  className="text-small text-subtle"
                >
                  {impl.operation.name}
                </Link>
              </div>
            )}
            <div className="py-3 font-mono text-small text-subtle">
              {[impl.language, impl.framework].filter(Boolean).join(" · ") ||
                "—"}
            </div>
            <div className="py-3 pr-3.5 text-right whitespace-nowrap">
              <Metric
                primary={impl.bestPrimary}
                valueClassName="font-mono text-body text-fg"
              />
              {multiple(impl.bestPrimary?.value) && (
                <div className="font-mono text-mini text-faint">
                  {multiple(impl.bestPrimary?.value)}
                </div>
              )}
            </div>
            <div className="py-3">
              <EvidenceCell row={impl} />
            </div>
            <div className="py-3">
              <AvailabilityCell row={impl} />
            </div>
          </div>
        ))}
      />
    </div>
  )
}
