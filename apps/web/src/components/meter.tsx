/**
 * Static hairline meter (§16.2: light as machining): a recessed track with a
 * proportional fill, painted once and never repainted. Purely supplementary —
 * the adjacent text always states the value — so it stays aria-hidden.
 * Callers set the track width via className.
 */
export function Meter({
  fraction,
  className,
}: {
  fraction: number
  className: string
}) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100)
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-[3px] flex-none bg-line ${className}`}
    >
      <span
        className="block h-full bg-accent-dim"
        style={{ width: `${pct}%` }}
      />
    </span>
  )
}
