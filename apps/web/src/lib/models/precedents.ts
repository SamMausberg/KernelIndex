// Precedent search read models (§12.8): implementations ranked by how
// transferable their optimization ideas are to a requested, possibly unseen,
// kernel problem. Not a compatibility answer and never a benchmark ranking
// across cohorts: the score says "study this", not "deploy this".
import type { EvidenceLevel, LicenseInfo, PrimaryMetric } from "./rows.ts"

export type PrecedentInput = {
  /** Free-text or `op:<slug>` query, the search grammar. */
  query?: string
  operation?: { family?: string; name?: string; axes?: Record<string, number> }
  environment?: { hardwareProduct?: string; dtype?: string }
  /** 1–25, default 10. */
  limit?: number
  /** Unsourced implementations cannot be studied; off by default. */
  includeUnsourced?: boolean
}

/** One scoring dimension's contribution, each explained in words. */
export type PrecedentDimensions = {
  computation: number
  hardware: number
  workload: number
  quality: number
  techniques: number
}

export type Precedent = {
  implementation: { name: string; slug: string }
  project: { name: string; slug: string }
  operation: { name: string; slug: string }
  /** 0–1 transferability under the precedent policy. */
  score: number
  /** Ordered, specific: "same computation", "same GPU", "adjacent shape". */
  reasons: string[]
  dimensions: PrecedentDimensions
  /** The implementation's best eligible run on the most relevant hardware. */
  bestRun: {
    runId: string
    hardware: string
    primary: PrimaryMetric | null
    rank: number | null
    cohortSize: number | null
    evidence: EvidenceLevel
  } | null
  language: string | null
  framework: string | null
  license: LicenseInfo
  sourceAvailable: boolean
  techniques: string[]
}

export type PrecedentsModel = {
  illustrative: boolean
  /** Plain-language reading of the request. */
  interpretation: string
  /** The operation the request resolved to; null for an unseen problem. */
  target: { name: string; slug: string; family: string } | null
  policyVersion: string
  precedents: Precedent[]
  /** Candidates considered before the cut. */
  considered: number
}
