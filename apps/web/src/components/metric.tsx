import type { PrimaryMetric } from "@/lib/catalog-models"
import { formatPrimaryParts, formatSpread } from "@/lib/format"

/**
 * A primary metric for a right-aligned table cell: the value in a
 * caller-sized span, the unit in a fixed-width slot so digits align down a
 * column even when rows mix µs and ms, and optionally the ± spread in a
 * fixed left-aligned slot. The spread slot renders only when a spread
 * exists: an always-reserved slot floated every spread-less column ~53px
 * left of its right-aligned header.
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
  const spreadText = spread ? formatSpread(primary) : null
  return (
    <>
      <span className={valueClassName}>{parts.value}</span>
      <span className="ml-1 inline-block w-[22px] text-left font-mono text-[11px] text-faint">
        {parts.unit}
      </span>
      {spreadText && (
        <span className="ml-1 inline-block min-w-[52px] text-left font-mono text-[11px] text-faint">
          {spreadText}
        </span>
      )}
    </>
  )
}
