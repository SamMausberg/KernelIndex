import type { ReactNode } from "react"

/**
 * Anchored document section (§16.3): detail pages are one vertical scroll.
 * A `summary` makes the section collapsible — the heading stays scannable
 * and the body ("9 fields") waits behind a disclosure, so evidence-heavy
 * pages state their structure without dumping every list at once.
 */
export function Section({
  id,
  title,
  summary,
  children,
}: {
  id?: string
  title: string
  summary?: string
  children: ReactNode
}) {
  if (summary === undefined) {
    return (
      <section id={id} className="mt-10">
        <h2 className="mb-3 text-lead font-medium">{title}</h2>
        {children}
      </section>
    )
  }
  return (
    <section id={id} className="mt-10">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-baseline gap-3 [&::-webkit-details-marker]:hidden">
          <h2 className="text-lead font-medium">{title}</h2>
          <span className="font-mono text-mini text-faint">
            {summary}{" "}
            <span
              aria-hidden="true"
              className="inline-block transition-transform group-open:rotate-90"
            >
              ›
            </span>
          </span>
        </summary>
        <div className="mt-3">{children}</div>
      </details>
    </section>
  )
}
