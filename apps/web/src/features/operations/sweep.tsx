// Workload sweep chart (§16.8): one hairline trace per implementation,
// latency against the varying axis, server-rendered as inline SVG. No chart
// library, no animation; hover emphasis and point values are CSS-only.
// Identity is never color-alone: series are direct-labeled at their line
// ends and listed in the legend; the cohort table below is the table view.
import Link from "next/link"
import type { OperationSweep } from "@/lib/catalog"
import { formatLatency } from "@/lib/format"

const WIDTH = 640
const HEIGHT = 240
const PAD = { top: 10, right: 148, bottom: 26, left: 56 }
const SERIES_COLORS = [
  "var(--color-viz-1)",
  "var(--color-viz-2)",
  "var(--color-viz-3)",
  "var(--color-viz-4)",
  "var(--color-viz-5)",
]

const formatAxisValue = (x: number) =>
  x >= 8192 && x % 1024 === 0 ? `${x / 1024}k` : String(x)

function formatValue(value: number, unit: string): string {
  return unit === "ns"
    ? formatLatency(value)
    : `${value.toLocaleString("en-US")} ${unit}`
}

/** Evenly-stepped "nice" ticks up to max (linear y). */
function niceTicks(max: number): number[] {
  const pow = 10 ** Math.floor(Math.log10(max / 4))
  const step =
    [1, 2, 5, 10].map((m) => m * pow).find((s) => max / s <= 5) ?? pow * 10
  const ticks: number[] = []
  for (let v = step; v <= max; v += step) ticks.push(v)
  return ticks
}

export function SweepChart({ sweep }: { sweep: OperationSweep }) {
  const points = sweep.series.flatMap((s) => s.points)
  const xs = [...new Set(points.map((p) => p.x))].sort((a, b) => a - b)
  const values = points.map((p) => p.value)
  const maxValue = Math.max(...values)
  const minValue = Math.min(...values)

  // Doubling sweeps read on a log2 x; wide ranges read on a log10 y.
  const logX = xs[xs.length - 1] / xs[0] >= 8
  const logY = maxValue / minValue > 20
  const xPos = (x: number) => {
    const [lo, hi] = [xs[0], xs[xs.length - 1]]
    const t = logX
      ? (Math.log2(x) - Math.log2(lo)) / (Math.log2(hi) - Math.log2(lo) || 1)
      : (x - lo) / (hi - lo || 1)
    return PAD.left + t * (WIDTH - PAD.left - PAD.right)
  }
  const yLo = logY ? minValue / 1.25 : 0
  const yHi = maxValue * 1.06
  const yPos = (v: number) => {
    const t = logY
      ? (Math.log10(v) - Math.log10(yLo)) / (Math.log10(yHi) - Math.log10(yLo))
      : (v - yLo) / (yHi - yLo)
    return HEIGHT - PAD.bottom - t * (HEIGHT - PAD.top - PAD.bottom)
  }
  const yTicks = logY
    ? Array.from(
        {
          length: Math.floor(Math.log10(yHi)) - Math.ceil(Math.log10(yLo)) + 1,
        },
        (_, i) => 10 ** (Math.ceil(Math.log10(yLo)) + i),
      )
    : niceTicks(yHi)

  // Dense sweeps (FlashInfer definitions carry dozens of cases) keep at
  // most seven x tick labels, always including both ends.
  const tickXs =
    xs.length <= 7
      ? xs
      : Array.from(
          { length: 7 },
          (_, i) => xs[Math.round((i * (xs.length - 1)) / 6)],
        )

  // Direct labels at the right edge, nudged apart so they never collide —
  // only for series that actually reach the final workload; a trace ending
  // mid-chart is named by the legend instead of a floating label.
  const lastX = xs[xs.length - 1]
  const labels = sweep.series
    .map((series, index) => ({
      name: series.implementation.name,
      index,
      last: series.points[series.points.length - 1],
    }))
    .filter((entry) => entry.last.x === lastX)
    .map((entry) => ({ ...entry, y: yPos(entry.last.value) }))
    .sort((a, b) => a.y - b.y)
  for (let i = 1; i < labels.length; i++)
    labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 13)

  return (
    <figure className="sweep">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block w-full max-w-[880px]"
        role="img"
        aria-label={`${sweep.metricLabel} against ${sweep.axis} for ${sweep.series.length} implementations on ${sweep.environmentLabel}`}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={yPos(tick)}
              y2={yPos(tick)}
              stroke="var(--color-line)"
            />
            <text
              x={PAD.left - 8}
              y={yPos(tick) + 3}
              textAnchor="end"
              fontSize={10}
              fill="var(--color-faint)"
              fontFamily="var(--font-mono)"
            >
              {formatValue(tick, sweep.unit)}
            </text>
          </g>
        ))}
        {tickXs.map((x) => (
          <text
            key={x}
            x={xPos(x)}
            y={HEIGHT - PAD.bottom + 16}
            textAnchor="middle"
            fontSize={10}
            fill="var(--color-faint)"
            fontFamily="var(--font-mono)"
          >
            {formatAxisValue(x)}
          </text>
        ))}
        <text
          x={WIDTH - PAD.right}
          y={HEIGHT - PAD.bottom + 16}
          textAnchor="start"
          fontSize={10}
          fill="var(--color-ghost)"
          fontFamily="var(--font-mono)"
          dx={40}
        >
          {sweep.axis} →
        </text>
        {sweep.series.map((series, index) => {
          const color = SERIES_COLORS[index]
          const path = series.points
            .map(
              (p, i) =>
                `${i === 0 ? "M" : "L"}${xPos(p.x).toFixed(1)} ${yPos(p.value).toFixed(1)}`,
            )
            .join(" ")
          const label = labels.find((entry) => entry.index === index)
          return (
            <g key={series.implementation.slug} className="series">
              <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
              {series.points.map((p) => (
                <g key={p.workloadId}>
                  <circle
                    cx={xPos(p.x)}
                    cy={yPos(p.value)}
                    r={2.5}
                    fill={color}
                    stroke="var(--color-surface)"
                    strokeWidth={1}
                  />
                  <text
                    className="pt-label"
                    x={xPos(p.x)}
                    y={yPos(p.value) - 7}
                    textAnchor="middle"
                    fontSize={9.5}
                    fill="var(--color-muted)"
                    fontFamily="var(--font-mono)"
                  >
                    {formatValue(p.value, sweep.unit)}
                  </text>
                </g>
              ))}
              {label && (
                <text
                  x={WIDTH - PAD.right + 10}
                  y={label.y + 3}
                  fontSize={10.5}
                  fill="var(--color-subtle)"
                >
                  {label.name}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px] text-faint">
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          {sweep.series.map((series, index) => (
            <span
              key={series.implementation.slug}
              className="inline-flex items-baseline gap-1.5"
            >
              <span
                aria-hidden
                className="inline-block h-[2px] w-3.5 translate-y-[-3px]"
                style={{ background: SERIES_COLORS[index] }}
              />
              <Link
                href={`/implementations/${series.implementation.slug}`}
                className="text-subtle"
              >
                {series.implementation.name}
              </Link>
            </span>
          ))}
        </span>
        <span>
          best per workload · {sweep.environmentLabel} held constant
          {logY ? " · log scale" : ""}
          {sweep.overflow > 0 &&
            ` · ${sweep.overflow} more implementation${sweep.overflow === 1 ? "" : "s"} in the table`}
        </span>
      </figcaption>
    </figure>
  )
}
