"use client"

import { useState } from "react"
import { Link } from "@/components/quiet-link"

// One row per model across BOTH corpora (§16.21): kernel coverage and
// serving coverage sit side by side as stated counts — never summed, never
// ranked against each other (§8.16). `name` is data-provided only (the
// serving source's display name on an exact slug match); nothing is
// invented for kernel-only tags, which keep their canonical mono form.
export type ModelCatalogRow = {
  tag: string
  name: string | null
  operations: number | null
  kernelRuns: number | null
  gpus: number | null
  servingRuns: number | null
  /** Preformatted parameter label ("70B"); serving-provided only. */
  params: string | null
}

const GRID =
  "grid grid-cols-[minmax(260px,1.6fr)_minmax(120px,0.9fr)_repeat(3,92px)_100px] gap-x-4 min-w-[860px]"
const CAP = 30

/** The /models catalog: one filterable table over every model the index
 * knows, from either corpus. The filter matches tag and display name
 * (recognition over recall: type "deepseek", see the rows). */
export function ModelCatalog({ rows }: { rows: ModelCatalogRow[] }) {
  const [filter, setFilter] = useState("")
  const [expanded, setExpanded] = useState(false)
  const needle = filter.trim().toLowerCase()
  const matched =
    needle === ""
      ? rows
      : rows.filter(
          (row) =>
            row.tag.toLowerCase().includes(needle) ||
            row.name?.toLowerCase().includes(needle),
        )
  const shown = needle !== "" || expanded ? matched : matched.slice(0, CAP)
  const hidden = matched.length - shown.length
  const maxRuns = Math.max(...rows.map((row) => row.kernelRuns ?? 0), 1)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5 pb-3">
        <label className="well flex h-8 w-[260px] items-center px-2.5">
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter models"
            aria-label="Filter models"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-small outline-none"
          />
        </label>
        <span className="text-small text-faint">
          {needle === ""
            ? `${rows.length} models`
            : `${matched.length} of ${rows.length} models`}
        </span>
      </div>
      <div className="overflow-x-auto">
        <div
          className={`${GRID} items-baseline border-b border-border-strong pb-3 font-mono text-label text-faint uppercase`}
        >
          <div>Model</div>
          <div />
          <div className="text-right">Operations</div>
          <div className="text-right">Kernel runs</div>
          <div className="text-right">GPUs</div>
          <div className="text-right">Serving runs</div>
        </div>
        {shown.map((row) => (
          <div
            key={row.tag}
            className={`${GRID} h-12 items-center border-b border-line transition-colors hover:bg-raised`}
          >
            <div className="min-w-0 truncate">
              {row.kernelRuns !== null ? (
                <Link
                  href={`/models/${row.tag}`}
                  prefetch={false}
                  className={row.name ? "text-body" : "font-mono text-body"}
                >
                  {row.name ?? row.tag}
                </Link>
              ) : (
                <Link
                  href={`/serving?model=${encodeURIComponent(row.tag)}`}
                  prefetch={false}
                  className="text-body"
                >
                  {row.name ?? row.tag}
                </Link>
              )}
              {(row.name || row.params) && (
                <span className="ml-2 font-mono text-mini text-faint">
                  {[row.name ? row.tag : null, row.params]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
            </div>
            {/* Length carries the kernel-run share (§16.2); the printed
                count stays the record of fact. */}
            <div aria-hidden="true" className="flex items-center">
              <span
                className="block h-[9px]"
                style={{
                  width: `${Math.max(((row.kernelRuns ?? 0) / maxRuns) * 100, row.kernelRuns ? 1 : 0)}%`,
                  background: "var(--color-viz-1)",
                }}
              />
            </div>
            <div className="text-right font-mono text-small text-muted">
              {row.operations?.toLocaleString("en-US") ?? "—"}
            </div>
            <div className="text-right font-mono text-small text-fg">
              {row.kernelRuns?.toLocaleString("en-US") ?? "—"}
            </div>
            <div className="text-right font-mono text-small text-subtle">
              {row.gpus?.toLocaleString("en-US") ?? "—"}
            </div>
            <div className="text-right font-mono text-small">
              {row.servingRuns !== null ? (
                <Link
                  href={`/serving?model=${encodeURIComponent(row.tag)}`}
                  prefetch={false}
                  className="font-mono text-small"
                >
                  {row.servingRuns.toLocaleString("en-US")}
                </Link>
              ) : (
                <span className="text-faint">—</span>
              )}
            </div>
          </div>
        ))}
        {matched.length === 0 && (
          <p className="py-8 text-body text-faint">
            No model matches "{filter.trim()}".
          </p>
        )}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="key mt-3 cursor-pointer px-3 py-1 text-small text-subtle hover:text-fg"
        >
          Show all {matched.length} models ›
        </button>
      )}
    </div>
  )
}
