// Pure rendering helpers for ki's human output: latency rescaling and
// column-aligned tables as strings, so the command file only prints.

const NS = [
  { limit: 1e3, divisor: 1, unit: "ns" },
  { limit: 1e6, divisor: 1e3, unit: "µs" },
  { limit: 1e9, divisor: 1e6, unit: "ms" },
  { limit: Number.POSITIVE_INFINITY, divisor: 1e9, unit: "s" },
]
const NS_PER: Record<string, number> = {
  ns: 1,
  us: 1e3,
  µs: 1e3,
  ms: 1e6,
  s: 1e9,
}

/** Human-scale a primary metric: duration units rescale to the readable
 * band; non-duration units (throughput, bytes) pass through verbatim. */
export function formatPrimary(
  primary: { value: number; unit: string } | null,
): string {
  if (!primary) return "—"
  const factor = NS_PER[primary.unit]
  if (factor === undefined) return `${primary.value} ${primary.unit}`
  const ns = primary.value * factor
  const scale = NS.find((s) => ns < s.limit) ?? NS[3]
  const value = ns / scale.divisor
  return `${value.toFixed(value < 10 && scale.unit !== "ns" ? 2 : 0)} ${scale.unit}`
}

/** Column-aligned rows, padded to the widest cell, trailing space trimmed. */
export function tableLines(rows: string[][]): string[] {
  if (rows.length === 0) return []
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => row[column].length)),
  )
  return rows.map((row) =>
    row
      .map((cell, index) => cell.padEnd(widths[index]))
      .join("  ")
      .trimEnd(),
  )
}
