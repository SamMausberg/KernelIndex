import { ImplName } from "@/components/impl-name"
import { Metric } from "@/components/metric"
import { Link } from "@/components/quiet-link"
import type { SearchPageModel } from "@/lib/catalog"

const GRID =
  "grid grid-cols-[minmax(150px,0.9fr)_150px_minmax(200px,1.4fr)_64px_minmax(190px,1fr)] min-w-[780px] items-center gap-x-4"

/**
 * The bracketed answer (§12.5): the request bound a case nobody measured,
 * so the two measured cases on either side of it lead, each with its own
 * fastest known run. Two hairline rows in the house grid; every number
 * names its case, and each case ranks only inside its own cohort.
 */
export function NearestMeasured({
  nearest,
  operationSlug,
}: {
  nearest: NonNullable<SearchPageModel["nearest"]>
  operationSlug: string
}) {
  const sides = [nearest.below, nearest.above].filter(
    (side): side is NonNullable<typeof side> => side !== null,
  )
  return (
    <section className="border-b border-border py-6">
      <p className="text-body text-muted">
        Not measured at{" "}
        <span className="font-mono text-fg">
          {nearest.axis} = {nearest.requested}
        </span>
        . Nearest measured:
      </p>
      <div className="mt-3 overflow-x-auto">
        <div
          className={`${GRID} border-b border-border-strong font-mono text-label text-faint uppercase`}
        >
          <div className="py-2">Case</div>
          <div className="py-2 pr-3.5 text-right">Fastest known</div>
          <div className="py-2">Implementation</div>
          <div className="py-2 text-right">Runs</div>
          <div />
        </div>
        {sides.map((side) => (
          <div
            key={side.workloadId}
            className={`${GRID} h-12 border-b border-line transition-colors hover:bg-raised`}
          >
            <div className="min-w-0 truncate font-mono text-body text-fg">
              {nearest.axis} = {side.value}
            </div>
            <div className="pr-3.5 text-right whitespace-nowrap">
              <Metric
                primary={side.head?.primary ?? null}
                spread
                valueClassName="font-mono text-body text-fg"
              />
            </div>
            <div className="min-w-0 truncate">
              {side.head ? (
                <Link
                  href={`/implementations/${side.head.implementation.slug}`}
                  className="text-body"
                >
                  <ImplName name={side.head.implementation.name} />
                </Link>
              ) : (
                <span className="text-small text-faint">no ranked run</span>
              )}
            </div>
            <div className="text-right font-mono text-small text-subtle">
              {side.runs}
            </div>
            <div className="flex justify-end gap-x-5 pr-1">
              <Link
                href={`/search?q=${encodeURIComponent(side.query)}`}
                className="action"
              >
                Resolve →
              </Link>
              {side.cohortKey && (
                <Link
                  href={`/operations/${operationSlug}?workload=${side.workloadId}&cohort=${encodeURIComponent(side.cohortKey)}`}
                  className="action"
                >
                  Cohort →
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-small text-faint">
        {sides.length === 2
          ? "Two measured cases on either side of the request; each ranks only inside its own cohort."
          : "One measured case beside the request; it ranks only inside its own cohort."}
      </p>
    </section>
  )
}
