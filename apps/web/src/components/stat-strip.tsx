import type { ReactNode } from "react"

/**
 * Dossier lead reading (§16 page grammar): a short row of engraved-label
 * facts with mono numerals — the one thing an entity page states before any
 * table. At most four facts; anything more belongs in the tables below.
 */
export function StatStrip({
  facts,
}: {
  facts: { label: string; value: ReactNode; detail?: string }[]
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-14 gap-y-4 border-b border-border py-6">
      {facts.map((fact) => (
        <div key={fact.label}>
          <div className="font-mono text-label text-faint uppercase">
            {fact.label}
          </div>
          <div className="mt-1.5 font-mono text-title font-medium text-fg">
            {fact.value}
            {fact.detail && (
              <span className="ml-2 text-small font-normal text-subtle">
                {fact.detail}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
