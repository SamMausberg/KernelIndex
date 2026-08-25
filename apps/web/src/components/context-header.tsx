import type { ReactNode } from "react"

/**
 * Page orientation strip (§16 brief): a human-readable title, a quiet
 * technical context line beneath it, and right-aligned page meta. The meta
 * bottom-aligns with the context line — the row it matches in size and
 * color — not the title baseline, where the size gap reads as misalignment.
 * Optional children render as an extra row (tabs, filters) inside the strip.
 */
export function ContextHeader({
  title,
  context,
  meta,
  children,
}: {
  title: ReactNode
  context?: ReactNode
  meta?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="border-b border-border bg-surface">
      <div className="shell pt-4 pb-3.5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
          <div className="min-w-0">
            {/* Display size (2026-08-25 hierarchy pass): the page title must
                outrank section headings and table text at a glance. */}
            <h1 className="text-display font-medium">{title}</h1>
            {/* Sans by default (mono is for data, not fact lists); callers
                wrap genuinely technical spans (shapes, slugs) in font-mono. */}
            {context && (
              <div className="mt-1.5 text-small text-subtle">{context}</div>
            )}
          </div>
          {meta && (
            <div className="flex items-baseline gap-5 pb-px text-small text-subtle">
              {meta}
            </div>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
