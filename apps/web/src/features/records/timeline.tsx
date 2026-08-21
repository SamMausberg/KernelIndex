// Record progression as a small stepped line (§16.12): each record holds
// its value until broken, so the trace steps down at every break and runs
// to "now" at the current value. One series — the cohort — in the accent
// color; the textual history beside it is the accessible table view.
// RecordSpark is the same object at row scale: the house signature for
// performance results — a contested record shows its descent, an
// unchallenged one draws nothing.
import type { RecordEvent } from "@/lib/catalog"

/** Shared staircase geometry: newest-first history → step path points. */
function steps(
  history: RecordEvent[],
  now: number,
  width: number,
  height: number,
  pad: number,
) {
  const events = [...history].reverse()
  const t0 = new Date(events[0].at).getTime()
  const span = Math.max(now - t0, 1)
  const values = events.map((event) => event.value.value)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const x = (t: number) => pad + ((t - t0) / span) * (width - 2 * pad)
  const y = (v: number) =>
    hi === lo
      ? height / 2
      : height - pad - ((v - lo) / (hi - lo)) * (height - 2 * pad)
  const path = events
    .map((event, index) => {
      const start = x(new Date(event.at).getTime())
      const end =
        index + 1 < events.length
          ? x(new Date(events[index + 1].at).getTime())
          : width - pad
      const level = y(event.value.value)
      return `${index === 0 ? "M" : "L"}${start.toFixed(1)} ${level.toFixed(1)} L${end.toFixed(1)} ${level.toFixed(1)}`
    })
    .join(" ")
  return { events, x, y, path }
}

const SPARK_W = 76
const SPARK_H = 16

/** Row-scale staircase: 1px hairline, one end dot at the current record.
 * Day-quantized `now` keeps server render and hydration identical. */
export function RecordSpark({ history }: { history: RecordEvent[] }) {
  if (history.length < 2) return null
  const now = Math.floor(Date.now() / 86_400_000) * 86_400_000
  const { events, x, y, path } = steps(history, now, SPARK_W, SPARK_H, 2)
  const current = events[events.length - 1]
  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      className="block h-4 w-[76px]"
      role="img"
      aria-label={`Record broken ${history.length - 1} time${history.length === 2 ? "" : "s"}`}
    >
      <path d={path} fill="none" stroke="var(--color-accent-dim)" />
      <circle
        cx={SPARK_W - 2}
        cy={y(current.value.value)}
        r={2}
        fill="var(--color-accent)"
      />
    </svg>
  )
}

const WIDTH = 300
const HEIGHT = 44
const PAD = 4

/** history is newest-first, as the ledger model stores it. */
export function RecordTimeline({
  history,
  now,
}: {
  history: RecordEvent[]
  now: number
}) {
  if (history.length < 2) return null
  const { events, x, y, path } = steps(history, now, WIDTH, HEIGHT, PAD)
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="block h-12 w-[300px] max-w-full"
      role="img"
      aria-label={`Record progression over ${events.length} events`}
    >
      <path
        d={path}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={1.5}
      />
      {events.map((event) => (
        <circle
          key={event.runId}
          cx={x(new Date(event.at).getTime())}
          cy={y(event.value.value)}
          r={2}
          fill="var(--color-accent)"
        />
      ))}
    </svg>
  )
}
