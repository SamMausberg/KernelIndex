// Ranking policy v1 (§11.4–11.5). Frozen by version: rank changes require a
// new policy version, never a silent edit. Eligibility returns structured
// reason codes; ranking assigns dense ranks with a conservative tie rule.
//
// Tie rule v1: without paired samples, two runs cannot receive a strict order
// when their declared confidence intervals overlap (or when either interval
// is missing and the point values are equal). Source-native cohorts preserve
// the upstream ordering semantics and tie only on equal values (§11.5 rule 8).
import type {
  ComparisonProfile,
  EvidenceLevel,
} from "../../lib/catalog-models.ts"

export const RANKING_POLICY_VERSION = "ranking-v1"

export type EligibilityFacts = {
  status: string
  published: boolean
  retracted: boolean
  superseded: boolean
  primaryValue: number | null
}

/** §11.4 pipeline with structured reason codes; empty reasons = eligible. */
export function eligibilityReasons(facts: EligibilityFacts): string[] {
  const reasons: string[] = []
  if (!facts.published) reasons.push("UNPUBLISHED")
  if (facts.status !== "passed")
    reasons.push(`STATUS_${facts.status.toUpperCase()}`)
  if (facts.retracted) reasons.push("RETRACTED")
  if (facts.superseded) reasons.push("SUPERSEDED")
  if (facts.primaryValue === null) reasons.push("MISSING_PRIMARY_METRIC")
  return reasons
}

const TRUST_ORDER: Record<EvidenceLevel, number> = {
  replicated: 4,
  verified: 3,
  reproducible: 2,
  reported: 1,
}

export type RankInput = {
  id: string
  /** Primary metric in its base unit; lower is better. Never null here. */
  value: number
  interval: { low: number; high: number } | null
  evidence: EvidenceLevel
  observedAt: Date
}

export type RankedEntry = {
  id: string
  rank: number
  tiedWithPrevious: boolean
}

function tiedPair(
  a: RankInput,
  b: RankInput,
  profile: ComparisonProfile,
): boolean {
  if (a.value === b.value) return true
  // Source-native results carry the upstream score without KernelIndex
  // uncertainty semantics: unequal values keep the source order.
  if (profile === "source_native") return false
  if (a.interval === null || b.interval === null) return false
  return a.interval.high >= b.interval.low && b.interval.high >= a.interval.low
}

/**
 * Rank one eligible cohort (§11.5). Dense ranks; a tie chain shares a rank.
 * Within a tie chain the presentation order is higher trust, then newer
 * observation, then stable ID — display order only, never a performance claim.
 */
export function rankCohort(
  inputs: RankInput[],
  profile: ComparisonProfile,
): RankedEntry[] {
  const sorted = [...inputs].sort((a, b) => a.value - b.value)

  // Group into tie chains: a run joins the current chain when it ties with
  // every member (transitive overlap would let A~C through an unrelated B).
  const chains: RankInput[][] = []
  for (const input of sorted) {
    const chain = chains.at(-1)
    if (chain?.every((member) => tiedPair(member, input, profile))) {
      chain.push(input)
    } else {
      chains.push([input])
    }
  }

  const ranked: RankedEntry[] = []
  chains.forEach((chain, chainIndex) => {
    chain.sort(
      (a, b) =>
        TRUST_ORDER[b.evidence] - TRUST_ORDER[a.evidence] ||
        b.observedAt.getTime() - a.observedAt.getTime() ||
        a.id.localeCompare(b.id),
    )
    chain.forEach((input, memberIndex) => {
      ranked.push({
        id: input.id,
        rank: chainIndex + 1,
        tiedWithPrevious: chain.length > 1 && memberIndex > 0,
      })
    })
  })
  return ranked
}
