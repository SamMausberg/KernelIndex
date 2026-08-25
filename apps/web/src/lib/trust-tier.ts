// The availability ladder (§11.8 adjacent): one pure ranking used by search
// ordering, tier dividers, and the Trust cells. It states facts about a row
// — evidence level, mirrored source, concluded license — and never upgrades
// evidence ("Verified" only ever means verified evidence).
import type { EvidenceLevel } from "./catalog-models"

export type TrustFacts = {
  evidence: EvidenceLevel | null
  sourceAvailable: boolean
  /** Concluded license, falling back to declared — display-tier only; the
   * deployability policy (§11.8) still requires a concluded license. */
  license: string | null
}

/** Lower rank = stronger tier; `label` is the divider/section wording. */
export const TRUST_TIERS = [
  "Verified",
  "Reproduction-ready",
  "License + source",
  "Source available",
  "No source",
] as const

export function trustTier(facts: TrustFacts): number {
  if (facts.evidence === "verified" || facts.evidence === "replicated") return 0
  if (facts.evidence === "reproducible") return 1
  if (facts.sourceAvailable) return facts.license !== null ? 2 : 3
  return 4
}
