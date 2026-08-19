/**
 * The calibrated rule (§16.2: light as machining): a hairline baseline with
 * end ticks and a proportional fill riding on it — an instrument's scale,
 * not a progress bar. Painted once, never repainted. Purely supplementary —
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
      className={`relative inline-block h-[5px] flex-none ${className}`}
    >
      <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
      <span className="absolute top-0 left-0 h-full w-px bg-edge" />
      <span className="absolute top-0 right-0 h-full w-px bg-edge" />
      <span
        className="absolute top-1/2 left-0 h-[3px] -translate-y-1/2 bg-accent-dim"
        style={{ width: `${pct}%` }}
      />
    </span>
  )
}
