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

/** "3 cohorts", "1 issue": counted noun for summary lines. */
export const countNoun = (n: number, noun: string) =>
  `${n} ${noun}${n === 1 ? "" : "s"}`

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
  if (!primary.uncertainty) return null
  const toNs = primary.unit === "ns" ? 1 : primary.unit === "s" ? 1e9 : null
  if (toNs === null) return null
  const half = ((primary.uncertainty.high - primary.uncertainty.low) / 2) * toNs
  const divisor = scaleFor(primary.value * toNs)?.divisor ?? 1
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

const FIELD_LABELS: Record<string, string> = {
  "hardware.gpu": "GPU",
  "hardware.architecture": "architecture",
}

/** Mismatch field paths ("hardware.gpu", "axes.n") as human words — raw
 * dotted paths must never reach a rendered row. */
export function humanizeField(field: string): string {
  return (
    FIELD_LABELS[field] ??
    field
      .replace(/^(axes|workload|environment|hardware)\./, "")
      .replaceAll("_", " ")
  )
}

/**
 * Source-published metrics as one dossier line: "SOL 0.6161 · 1.66× reference
 * · 16/16 cases faster". Latency keys are skipped (the primary measurement
 * already states them); unrecognized keys render as "key value" so nothing a
 * source publishes silently disappears.
 */
export function formatSourceNativeMetrics(
  metrics: Record<string, number>,
): string | null {
  const parts: string[] = []
  const used = new Set(["latency_ms", "reference_latency_ms"])
  if (typeof metrics.sol_score === "number") {
    parts.push(`SOL ${metrics.sol_score.toFixed(4)}`)
    used.add("sol_score")
  }
  const speedup = metrics.avg_speedup ?? metrics.speedup_factor
  if (typeof speedup === "number") {
    parts.push(`${speedup.toFixed(2)}× reference`)
    used.add("avg_speedup").add("speedup_factor")
  }
  if (
    typeof metrics.fast_1_count === "number" &&
    typeof metrics.fast_1_total === "number"
  ) {
    parts.push(`${metrics.fast_1_count}/${metrics.fast_1_total} cases faster`)
    used.add("fast_1_count").add("fast_1_total")
  }
  for (const [key, value] of Object.entries(metrics))
    if (!used.has(key)) parts.push(`${key.replaceAll("_", " ")} ${value}`)
  return parts.length > 0 ? parts.join(" · ") : null
}

/** "2026-08-11" from an ISO timestamp; "—" when never tested. Dense cells
 * use it too: a year-less "10-21" across a year boundary misleads. */
export function formatDateUTC(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—"
}

/** "62% of SOL" from a source-published SOL-Score fraction (SOL-ExecBench):
 * the source's own speed-of-light estimate, never a KernelIndex claim. */
export function formatSolScore(score: number): string {
  return `${Math.round(score * 100)}% of SOL`
}

/** Verbose storage dtype names → their element family, display only —
 * manifests and digests keep the source-declared name. */
const DTYPE_DISPLAY: Record<string, string> = { float4_e2m1fn_x2: "fp4" }

/**
 * Workload dtype label: compute dtypes lead; integer/bool index and mask
 * plumbing shows only when nothing else does (an fp4 GEMM must never read
 * as "int8" because its scales and indices are integers). Capped for the
 * dense rows — the run dossier keeps the full per-tensor detail.
 */
export function dtypeLabel(dtypes: string[]): string {
  const display = [...new Set(dtypes.map((d) => DTYPE_DISPLAY[d] ?? d))]
  const compute = display.filter((d) => !/^(u?int|bool$|index)/.test(d))
  const lead = compute.length > 0 ? compute : display
  return lead.length > 3
    ? `${lead.slice(0, 3).join("/")} +${lead.length - 3}`
    : lead.join("/")
}
