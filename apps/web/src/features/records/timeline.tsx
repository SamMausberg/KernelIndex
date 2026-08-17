// Record progression as a small stepped line (§16.12): each record holds
// its value until broken, so the trace steps down at every break and runs
// to "now" at the current value. One series — the cohort — in the accent
// color; the textual history beside it is the accessible table view.
import type { RecordEvent } from "@/lib/catalog"

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
  const events = [...history].reverse()
  const t0 = new Date(events[0].at).getTime()
  const span = Math.max(now - t0, 1)
  const values = events.map((event) => event.value.value)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const x = (t: number) => PAD + ((t - t0) / span) * (WIDTH - 2 * PAD)
  const y = (v: number) =>
    hi === lo
      ? HEIGHT / 2
      : HEIGHT - PAD - ((v - lo) / (hi - lo)) * (HEIGHT - 2 * PAD)

  const path = events
    .map((event, index) => {
      const start = x(new Date(event.at).getTime())
      const end =
        index + 1 < events.length
          ? x(new Date(events[index + 1].at).getTime())
          : WIDTH - PAD
      const level = y(event.value.value)
      return `${index === 0 ? "M" : "L"}${start.toFixed(1)} ${level.toFixed(1)} L${end.toFixed(1)} ${level.toFixed(1)}`
    })
    .join(" ")

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="block h-[44px] w-[300px] max-w-full"
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
