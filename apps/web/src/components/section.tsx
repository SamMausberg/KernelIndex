import type { ReactNode } from "react"

/** Anchored document section (§16.3): detail pages are one vertical scroll. */
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
      <h2 className="mb-3 text-[15px] font-medium tracking-[-0.01em]">
        {title}
      </h2>
      {children}
    </section>
  )
}
