import type { EvidenceLevel } from "@/lib/catalog-models"

/** The row fields the trust presentation reads; ResultRow satisfies it. */
export type TrustRow = {
  evidence: EvidenceLevel | null
  sourceAvailable: boolean
  installable: boolean
  license: { declared: string | null; concluded: string | null }
}

const EVIDENCE_LABELS: Record<string, string> = {
  reported: "Reported",
  reproducible: "Reproducible",
  verified: "Verified",
  replicated: "Replicated",
}

/**
 * Evidence tier, always stated (§8.14) so "Reported" is a visible fact, not
 * an absence. The green dot marks only tiers KernelIndex itself stands
 * behind (verified/replicated).
 */
export function EvidenceCell({ row }: { row: TrustRow }) {
  const strong = row.evidence === "verified" || row.evidence === "replicated"
  return (
    <div className="truncate pr-3 text-[12.5px] text-subtle">
      {strong && <span className="mr-1.5 text-[9px] text-success">●</span>}
      <span className={strong ? "text-fg" : undefined}>
        {row.evidence ? (EVIDENCE_LABELS[row.evidence] ?? row.evidence) : "—"}
      </span>
    </div>
  )
}

/**
 * License and source availability — orthogonal to evidence, and facts, not
 * warnings (§16.16): license unknown is faint, "source" is the cobalt cue
 * that code is viewable on-site. Never amber.
 */
export function AvailabilityCell({ row }: { row: TrustRow }) {
  const license = row.license.concluded ?? row.license.declared
  return (
    <div className="truncate pr-3 text-[12.5px] text-subtle">
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
