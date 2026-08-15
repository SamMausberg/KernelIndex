// Display formatting shared by catalog pages. Pure functions over the read
// models; keep unit conversion here so pages never touch raw base units.
import type { EvidenceLevel, PrimaryMetric } from "./catalog-models"

const LATENCY_SCALES = [
  { limit: 1e6, divisor: 1e3, unit: "µs" },
  { limit: 1e9, divisor: 1e6, unit: "ms" },
  { limit: Number.POSITIVE_INFINITY, divisor: 1e9, unit: "s" },
] as const

function scaleFor(ns: number) {
  return LATENCY_SCALES.find((scale) => ns < scale.limit)
}

/** "7.81 µs" from integer nanoseconds: two decimals under 10, one above. */
export function formatLatency(ns: number): string {
  const scale = scaleFor(ns)
  if (ns < 1e3 || !scale) return `${Math.round(ns)} ns`
  const value = ns / scale.divisor
  return `${value.toFixed(value < 10 ? 2 : 1)} ${scale.unit}`
}

/** Time-valued metrics get unit conversion (ns-native and second-native —
 * e.g. aggregate leaderboard scores); anything else prints as reported. */
export function formatPrimary(primary: PrimaryMetric): string {
  if (primary.unit === "ns") return formatLatency(primary.value)
  if (primary.unit === "s") return formatLatency(primary.value * 1e9)
  return `${primary.value} ${primary.unit}`.trim()
}

/** Split for large numerals so digits carry and the unit recedes. */
export function formatPrimaryParts(primary: PrimaryMetric): {
  value: string
  unit: string
} {
  const text = formatPrimary(primary)
  const split = text.indexOf(" ")
  return split === -1
    ? { value: text, unit: "" }
    : { value: text.slice(0, split), unit: text.slice(split + 1) }
}

/** "±0.03" — half-width of the uncertainty interval in the display unit. */
export function formatSpread(primary: PrimaryMetric): string | null {
  if (!primary.uncertainty || primary.unit !== "ns") return null
  const half = (primary.uncertainty.high - primary.uncertainty.low) / 2
  const divisor = scaleFor(primary.value)?.divisor ?? 1
  return `±${(half / divisor).toFixed(2)}`
}

/** "1.02×" relative to the cohort leader; "—" when either side is missing. */
export function formatRelative(
  primary: PrimaryMetric | null,
  best: PrimaryMetric | null,
): string {
  if (!primary || !best || best.value === 0) return "—"
  return `${(primary.value / best.value).toFixed(2)}×`
}

/** Short table label; trust badges stay derived, never chosen (§8.14). */
export function evidenceLabel(level: EvidenceLevel | null): string {
  switch (level) {
    case "verified":
      return "Verified"
    case "replicated":
      return "Replicated"
    case "reproducible":
      return "Reproducible"
    case "reported":
      return "Reported"
    default:
      return "No evidence"
  }
}

/** "2026-08-11" from an ISO timestamp; "—" when never tested. */
export function formatDateUTC(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—"
}

/** "08-11" month-day for dense table cells. */
export function formatDateShort(iso: string | null): string {
  return iso ? iso.slice(5, 10) : "—"
}
