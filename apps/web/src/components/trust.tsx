import type { EvidenceLevel } from "@/lib/catalog-models"

/** The row fields the trust presentation reads; ResultRow satisfies it. */
export type TrustRow = {
  evidence: EvidenceLevel | null
  sourceAvailable: boolean
  installable: boolean
  license: { declared: string | null; concluded: string | null }
}

/**
 * One-cell trust summary for row grids (search, records, home): evidence
 * only when it says something ("Verified"/"Reproducible"), the license
 * state quietly, and "source" as a cobalt cue that code is viewable
 * on-site. License unknown is a fact, not a warning — never amber.
 */
export function TrustCell({ row }: { row: TrustRow }) {
  const strong = row.evidence === "verified" || row.evidence === "replicated"
  const license = row.license.concluded ?? row.license.declared
  return (
    <div className="truncate pr-3 text-[12.5px] text-subtle">
      {strong && (
        <span className="text-fg">
          <span className="mr-1.5 text-[9px] text-success">●</span>
          Verified ·{" "}
        </span>
      )}
      {row.evidence === "reproducible" && "Reproducible · "}
      {license ?? <span className="text-faint">license unknown</span>}
      {" · "}
      {row.sourceAvailable ? (
        <span className="text-accent">source</span>
      ) : (
        <span className="text-faint">no source</span>
      )}
    </div>
  )
}

/** Machined fact chips for row expansions: source, license, install. */
export function TierChips({ row }: { row: TrustRow }) {
  const license = row.license.concluded ?? row.license.declared
  const chips = [
    row.sourceAvailable
      ? { text: "source mirrored", on: true }
      : { text: "no source", on: false },
    license
      ? { text: license, on: true }
      : { text: "license unknown", on: false },
    row.installable
      ? { text: "installable", on: true }
      : { text: "no install recipe", on: false },
  ]
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.text}
          className={`key px-2 py-[2px] font-mono text-[11px] ${
            chip.on ? "text-muted" : "text-faint"
          }`}
        >
          {chip.text}
        </span>
      ))}
    </span>
  )
}
