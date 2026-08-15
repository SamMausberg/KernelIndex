import type { PrimaryMetric } from "@/lib/catalog-models"
import { formatPrimaryParts, formatSpread } from "@/lib/format"

/**
 * A primary metric for a right-aligned table cell: the value in a
 * caller-sized span, the unit in a fixed-width slot so digits align down a
 * column even when rows mix µs and ms, and optionally the ± spread in a
 * fixed left-aligned slot.
 */
export function Metric({
  primary,
  valueClassName,
  spread = false,
}: {
  primary: PrimaryMetric | null
  valueClassName: string
  spread?: boolean
}) {
  if (!primary) return <span className="font-mono text-faint">—</span>
  const parts = formatPrimaryParts(primary)
  return (
    <>
      <span className={valueClassName}>{parts.value}</span>
      <span className="ml-1 inline-block w-[22px] text-left font-mono text-[11px] text-faint">
        {parts.unit}
      </span>
      {spread && (
        <span className="ml-1 inline-block min-w-[52px] text-left font-mono text-[11px] text-faint">
          {formatSpread(primary)}
        </span>
      )}
    </>
  )
}
