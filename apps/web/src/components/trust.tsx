import type { EvidenceLevel } from "@/lib/catalog-models"

/** The row fields the trust presentation reads; ResultRow satisfies it. */
export type TrustRow = {
  evidence: EvidenceLevel | null
  sourceAvailable: boolean
  installable: boolean
  license: { declared: string | null; concluded: string | null }
}

// "reproducible" (the stored fact and API value) displays as
// "Reproduction-ready": the rerun inputs are present, not necessarily rerun.
const EVIDENCE_LABELS: Record<string, string> = {
  reported: "Reported",
  reproducible: "Reproduction-ready",
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
    <div className="truncate pr-3 text-small text-subtle">
      {strong && <span className="mr-1.5 text-label text-success">●</span>}
      <span className={strong ? "text-fg" : undefined}>
        {row.evidence ? (EVIDENCE_LABELS[row.evidence] ?? row.evidence) : "—"}
      </span>
    </div>
  )
}

/**
 * The one trust cell for dense rows (§16.7): evidence level, license, and
 * source state in reading order — the can-I-use-it facts without a second
 * column. Facts, not warnings (§16.16): unknowns are faint, "source" is the
 * cobalt cue that code is viewable on-site, the green dot marks only tiers
 * KernelIndex itself stands behind. The row expansion keeps the full chips.
 */
export function TrustCell({ row }: { row: TrustRow }) {
  const strong = row.evidence === "verified" || row.evidence === "replicated"
  const license = row.license.concluded ?? row.license.declared
  return (
    <div className="truncate pr-3 text-small text-subtle">
      {strong && <span className="mr-1.5 text-label text-success">●</span>}
      <span className={strong ? "text-fg" : undefined}>
        {row.evidence ? (EVIDENCE_LABELS[row.evidence] ?? row.evidence) : "—"}
      </span>
      {" · "}
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

/**
 * License and source availability — orthogonal to evidence, and facts, not
 * warnings (§16.16): license unknown is faint, "source" is the cobalt cue
 * that code is viewable on-site. Never amber.
 */
export function AvailabilityCell({ row }: { row: TrustRow }) {
  const license = row.license.concluded ?? row.license.declared
  return (
    <div className="truncate pr-3 text-small text-subtle">
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
          className={`key py-0.5 font-mono text-mini ${
            chip.on ? "text-muted" : "text-faint"
          }`}
        >
          {chip.text}
        </span>
      ))}
    </span>
  )
}
