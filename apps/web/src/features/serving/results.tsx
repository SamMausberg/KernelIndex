// Serving results (§16.13): feasible configurations first, grouped by
// cohort with the identity line above them, then the per-cohort Pareto
// view. Every row states TTFT/TPOT/throughput/error rate as a value or
// "not reported" — and there is no score column by construction.
import { Link } from "@/components/quiet-link"
import type { ServingCohortGroup, ServingResultRow } from "@/lib/serving-models"
import { ParetoScatter } from "./pareto"

const GRID =
  "grid grid-cols-[34px_minmax(220px,1.4fr)_minmax(160px,1fr)_110px_86px_86px_64px_130px_28px] min-w-[1050px]"

// Render caps (§16 payload budget): the page answers "what leads this
// cohort"; the deep tail lives in /serving-runs and the API.
const ROW_CAP = 12
const EXCLUDED_CAP = 12

function metric(
  row: ServingResultRow,
  name: string,
  statistic: string,
): string | null {
  const found = row.measurements.find(
    (m) => m.metric === name && m.statistic === statistic,
  )
  if (!found) return null
  return name.includes("throughput")
    ? Math.round(found.value).toLocaleString("en-US")
    : `${found.value.toLocaleString("en-US")}`
}

/** A measured value, or an explicit quiet "n/r" (not reported) marker. */
function cell(value: string | null) {
  return value ?? <span className="text-[11px] text-faint">n/r</span>
}

function ResultRow({ row }: { row: ServingResultRow }) {
  return (
    <details className="group row-cv border-b border-line">
      <summary
        className={`${GRID} h-[47px] cursor-pointer list-none items-center transition-colors hover:bg-raised [&::-webkit-details-marker]:hidden`}
      >
        <div className="font-mono text-[12.5px] text-faint">
          {row.rank !== null ? row.rank : row.onFrontier ? "◆" : ""}
        </div>
        <div className="min-w-0 truncate pr-3 text-[13px] text-fg">
          {row.configuration}
        </div>
        <div className="min-w-0 truncate pr-3 font-mono text-[11.5px] text-subtle">
          {row.stack}
        </div>
        <div className="pr-3 text-right font-mono text-[13px] text-fg">
          {cell(metric(row, "output_token_throughput_tps", "reported"))}
        </div>
        <div className="pr-3 text-right font-mono text-[12px] text-subtle">
          {cell(metric(row, "ttft_ms", "p99"))}
        </div>
        <div className="pr-3 text-right font-mono text-[12px] text-subtle">
          {cell(metric(row, "tpot_ms", "p99"))}
        </div>
        <div className="pr-3 text-right font-mono text-[12px] text-muted">
          {row.hardware.total}
        </div>
        <div className="truncate pr-3 font-mono text-[11.5px] text-faint">
          {row.qualityPolicy}
        </div>
        <div
          aria-hidden="true"
          className="pr-1 text-right font-mono text-[12px] text-faint transition-transform group-open:rotate-90"
        >
          ›
        </div>
      </summary>
      <div className="border-t border-line bg-surface py-3.5 pr-4 pl-9 text-[12.5px] max-md:pl-4">
        <p className="text-muted">
          {row.hardware.perNode}× {row.hardware.model}
          {row.hardware.nodes > 1 && ` × ${row.hardware.nodes} nodes`}
          {" · "}
          {row.harness}
          {" · Reported evidence · observed "}
          {row.observedAt.slice(0, 10)}
        </p>
        {row.constraints.length > 0 && (
          <p className="mt-1.5 font-mono text-[11.5px] text-subtle">
            {row.constraints
              .map(
                (view) =>
                  `${view.constraint}: ${view.satisfied === false ? "unsatisfied" : view.detail}`,
              )
              .join(" · ")}
          </p>
        )}
        {row.caveats.length > 0 && (
          <p className="mt-1.5 text-subtle">{row.caveats.join(". ")}.</p>
        )}
        <p className="mt-2">
          <span className="text-faint">
            {row.source.name}
            {row.source.externalId && ` · entry ${row.source.externalId}`}
          </span>
          <Link href={`/serving-runs/${row.runId}`} className="ml-4">
            Run dossier →
          </Link>
        </p>
      </div>
    </details>
  )
}

export function ServingCohorts({ groups }: { groups: ServingCohortGroup[] }) {
  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <section key={group.cohortKey}>
          <h2 className="text-[15px] font-medium tracking-[-0.008em]">
            {group.description}
          </h2>
          <p className="mt-0.5 text-[12px] text-faint">
            Ranked only inside this cohort · {group.rows.length} feasible
            {group.excluded.length > 0 &&
              ` · ${group.excluded.length} excluded`}
          </p>
          <div className="mt-3 overflow-x-auto">
            <div
              className={`${GRID} border-b border-border-strong text-[11.5px] text-faint`}
            >
              <div className="py-2">#</div>
              <div className="py-2">Configuration</div>
              <div className="py-2">Stack</div>
              <div className="py-2 pr-3 text-right">tokens/s</div>
              <div className="py-2 pr-3 text-right">TTFT p99</div>
              <div className="py-2 pr-3 text-right">TPOT p99</div>
              <div className="py-2 pr-3 text-right">GPUs</div>
              <div className="py-2">Quality</div>
              <div />
            </div>
            {group.rows.slice(0, ROW_CAP).map((row) => (
              <ResultRow key={row.runId} row={row} />
            ))}
            {group.rows.length === 0 && (
              <p className="py-6 text-[13px] text-faint">
                Nothing in this cohort meets the bounds.
              </p>
            )}
          </div>
          {group.rows.length > ROW_CAP && (
            <p className="mt-2 text-[12px] text-faint">
              {group.rows.length - ROW_CAP} more rows in this cohort — narrow
              the filters to see them.
            </p>
          )}
          <ParetoScatter
            rows={group.rows.slice(0, ROW_CAP)}
            sharedAxes={group.sharedAxes}
          />
          {group.excluded.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer list-none text-[12.5px] text-subtle [&::-webkit-details-marker]:hidden">
                {group.excluded.length} excluded — bound not met, or the metric
                wasn't reported ›
              </summary>
              <div className="mt-2 space-y-1">
                {group.excluded.slice(0, EXCLUDED_CAP).map((entry) => (
                  <p
                    key={entry.runId}
                    className="font-mono text-[11.5px] text-faint"
                  >
                    {entry.configuration} · {entry.reasons.join(", ")}
                  </p>
                ))}
                {group.excluded.length > EXCLUDED_CAP && (
                  <p className="text-[11.5px] text-faint">
                    +{group.excluded.length - EXCLUDED_CAP} more
                  </p>
                )}
              </div>
            </details>
          )}
        </section>
      ))}
    </div>
  )
}
