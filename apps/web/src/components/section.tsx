import type { ReactNode } from "react"

/** Anchored document section (§16.3): detail pages are one vertical scroll,
 * every section always visible — facts are never hidden behind a click. */
export function Section({
  id,
  title,
  children,
}: {
  id?: string
  title: string
  children: ReactNode
}) {
  return (
    <section id={id} className="mt-10">
      {/* Title size (2026-08-25 hierarchy pass): one clear step below the
          display h1, one clear step above table text. */}
      <h2 className="mb-3 text-title font-medium">{title}</h2>
      {children}
    </section>
  )
}
