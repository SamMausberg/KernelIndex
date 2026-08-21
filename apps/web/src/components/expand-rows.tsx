import type { ReactNode } from "react"

/**
 * Top-N rows visible, the rest behind a native disclosure (§16.7): long
 * tables lead with the rows that answer, and the tail stays one click away
 * without JavaScript. Rows must be self-contained blocks (the grid lives on
 * each row, not on a shared parent), which every table here already does.
 */
export function ExpandRows({
  rows,
  cap,
  noun = "rows",
}: {
  rows: ReactNode[]
  cap: number
  noun?: string
}) {
  if (rows.length <= cap) return <>{rows}</>
  return (
    <>
      {rows.slice(0, cap)}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-baseline gap-3 border-b border-line py-2.5 text-small text-subtle transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">
            Show all {rows.length} {noun} ›
          </span>
          <span className="hidden group-open:inline">
            Showing all {rows.length} {noun} ⌄
          </span>
        </summary>
        {rows.slice(cap)}
      </details>
    </>
  )
}
