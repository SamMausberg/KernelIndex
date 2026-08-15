// Line diff between two mirrored source revisions, precomputed server-side
// into render-ready lines (§16.9): three context lines around each change,
// elided unchanged runs, and a hard cap so pathological files stay bounded.
import { structuredPatch } from "diff"

export type SourceDiffLine = { kind: "add" | "del" | "ctx"; text: string }

const MAX_LINES = 1200

export function diffSource(
  previous: string,
  current: string,
): SourceDiffLine[] {
  const patch = structuredPatch(
    "previous",
    "current",
    previous,
    current,
    "",
    "",
    {
      context: 3,
    },
  )
  const lines: SourceDiffLine[] = []
  let lastEnd: number | null = null
  for (const hunk of patch.hunks) {
    if (lastEnd !== null && hunk.oldStart > lastEnd + 1) {
      lines.push({
        kind: "ctx",
        text: `⋯ ${hunk.oldStart - lastEnd - 1} unchanged lines`,
      })
    } else if (lastEnd === null && hunk.oldStart > 1) {
      lines.push({
        kind: "ctx",
        text: `⋯ ${hunk.oldStart - 1} unchanged lines`,
      })
    }
    for (const line of hunk.lines) {
      const kind =
        line[0] === "+" ? "add" : line[0] === "-" ? "del" : ("ctx" as const)
      lines.push({ kind, text: line.slice(1) })
      if (lines.length >= MAX_LINES) {
        lines.push({ kind: "ctx", text: "⋯ diff truncated" })
        return lines
      }
    }
    lastEnd = hunk.oldStart + hunk.oldLines - 1
  }
  return lines
}
