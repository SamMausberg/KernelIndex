// Pareto display (§16.13): when a cohort shares a throughput and a latency
// axis, a static inline SVG scatter — frontier stroked in accent, dominated
// points muted; no chart library, no animation (§16.18). With fewer shared
// axes the frontier renders as the ranked table's marker column instead.
import type { ServingResultRow } from "@/lib/serving-models"

type Point = {
  row: ServingResultRow
  x: number
  y: number
}

const W = 460
const H = 220
const PAD = 42

function measurement(row: ServingResultRow, axis: string): number | null {
  const [metric, statistic] = axis.split("·")
  return (
    row.measurements.find(
      (m) => m.metric === metric && m.statistic === statistic,
    )?.value ?? null
  )
}

const AXIS_LABELS: Record<string, string> = {
  output_token_throughput_tps·reported: "tokens/s",
  ttft_ms·p99: "TTFT p99 (ms)",
  tpot_ms·p99: "TPOT p99 (ms)",
}

/**
 * Picks a throughput x-axis and a latency y-axis from the shared axes;
 * returns null (no chart) when the cohort has no such trade-off to show.
 */
export function ParetoScatter({
  rows,
  sharedAxes,
}: {
  rows: ServingResultRow[]
  sharedAxes: string[]
}) {
  const xAxis = sharedAxes.find((axis) => axis.includes("throughput"))
  const yAxis = sharedAxes.find(
    (axis) => axis.includes("ttft") || axis.includes("tpot"),
  )
  if (!xAxis || !yAxis || rows.length < 2) return null

  const points: Point[] = []
  for (const row of rows) {
    const x = measurement(row, xAxis)
    const y = measurement(row, yAxis)
    if (x !== null && y !== null) points.push({ row, x, y })
  }
  if (points.length < 2) return null

  const xMax = Math.max(...points.map((p) => p.x)) * 1.06
  const yMax = Math.max(...points.map((p) => p.y)) * 1.12
  const sx = (x: number) => PAD + (x / xMax) * (W - PAD - 12)
  const sy = (y: number) => H - PAD + (y / yMax) * (PAD + 12 - H)
  const frontier = points
    .filter((p) => p.row.onFrontier)
    .sort((a, b) => a.x - b.x)

  return (
    <figure className="mt-4 max-w-[520px]">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Pareto frontier: ${AXIS_LABELS[xAxis] ?? xAxis} against ${AXIS_LABELS[yAxis] ?? yAxis}`}
        className="w-full"
      >
        <line
          x1={PAD}
          y1={H - PAD}
          x2={W - 8}
          y2={H - PAD}
          stroke="var(--color-border)"
        />
        <line
          x1={PAD}
          y1={12}
          x2={PAD}
          y2={H - PAD}
          stroke="var(--color-border)"
        />
        {frontier.length > 1 && (
          <polyline
            points={frontier.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}
        {points.map((p) => (
          <circle
            key={p.row.runId}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={p.row.onFrontier ? 4 : 3}
            fill={
              p.row.onFrontier ? "var(--color-accent)" : "var(--color-faint)"
            }
          >
            <title>
              {`${p.row.configuration} · ${p.x.toLocaleString("en-US")} ${AXIS_LABELS[xAxis] ?? ""} · ${p.y} ${AXIS_LABELS[yAxis] ?? ""}`}
            </title>
          </circle>
        ))}
        <text
          x={W - 8}
          y={H - PAD + 26}
          textAnchor="end"
          className="fill-[var(--color-faint)] font-mono text-[10px]"
        >
          {AXIS_LABELS[xAxis] ?? xAxis} →
        </text>
        <text
          x={PAD}
          y={10}
          className="fill-[var(--color-faint)] font-mono text-[10px]"
        >
          ↑ {AXIS_LABELS[yAxis] ?? yAxis}
        </text>
      </svg>
      <figcaption className="mt-1 text-[11.5px] text-faint">
        Accent points sit on the Pareto frontier (no candidate is faster and
        lower-latency at once); muted points are dominated.
      </figcaption>
    </figure>
  )
}
