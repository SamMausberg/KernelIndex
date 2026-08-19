import type { PrimaryMetric } from "@/lib/catalog-models"
import { formatPrimaryParts, formatSpread } from "@/lib/format"

/**
 * A primary metric for a right-aligned table cell: the value in a
 * caller-sized span, the unit in a fixed-width slot, and one fixed
 * left-aligned annotation slot for the ± spread or a secondary fact
 * (e.g. "81% SOL"). The slot is reserved for every row of a column that
 * uses it — passing `spread` or `secondary` (even null) keeps digits
 * aligned down the column when only some rows carry an annotation.
 */
export function Metric({
  primary,
  valueClassName,
  spread = false,
  secondary,
}: {
  primary: PrimaryMetric | null
  valueClassName: string
  spread?: boolean
  /** Slot text when there is no spread; null still reserves the slot. */
  secondary?: string | null
}) {
  if (!primary) return <span className="font-mono text-faint">—</span>
  const parts = formatPrimaryParts(primary)
  const slotText = (spread ? formatSpread(primary) : null) ?? secondary ?? null
  return (
    <>
      <span className={valueClassName}>{parts.value}</span>
      <span className="ml-1 inline-block w-[22px] text-left font-mono text-mini text-faint">
        {parts.unit}
      </span>
      {(spread || secondary !== undefined) && (
        <span className="ml-1 inline-block min-w-[56px] text-left font-mono text-mini text-faint">
          {slotText}
        </span>
      )}
    </>
  )
}
