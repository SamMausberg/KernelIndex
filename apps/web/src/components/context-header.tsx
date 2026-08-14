import type { ReactNode } from "react"

/**
 * Page orientation strip (§16 brief): a human-readable title, a quiet
 * technical context line beneath it, and right-aligned page meta. Optional
 * children render as an extra row (tabs, filters) inside the same strip.
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
      <div className="shell animate-fade-in pt-[18px] pb-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h1 className="text-[20px] leading-tight font-medium tracking-[-0.012em]">
            {title}
          </h1>
          {meta && (
            <div className="flex items-baseline gap-5 text-[12.5px] text-subtle">
              {meta}
            </div>
          )}
        </div>
        {context && (
          <div className="mt-1.5 font-mono text-[12.5px] text-subtle">
            {context}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
