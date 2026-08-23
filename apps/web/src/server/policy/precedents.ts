// precedents-v1 (§12.8): transferability scoring for precedent search. Pure
// and deterministic over already-gathered facts so both backends and the
// tests share one policy. Each dimension states its reason in words; the
// weighted sum is a study priority, never a performance claim.
import type { EvidenceLevel } from "../../lib/catalog-models.ts"
import type { PrecedentDimensions } from "../../lib/models/precedents.ts"
import { MEMORY_PATTERN_TRAITS } from "../enrich/techniques.ts"

export const PRECEDENT_POLICY_VERSION = "precedents-v1"

const WEIGHTS: PrecedentDimensions = {
  computation: 0.35,
  hardware: 0.25,
  workload: 0.15,
  quality: 0.15,
  techniques: 0.1,
}

/** How the candidate's operation relates to the requested computation. */
export type ComputationRelation =
  | { kind: "same" }
  | { kind: "equivalent" }
  | { kind: "related"; rationale: string }
  | { kind: "family"; family: string }
  | { kind: "fuzzy"; score: number }
  | { kind: "none" }

/** Facts about one candidate implementation, backend-agnostic. */
export type PrecedentCandidate = {
  relation: ComputationRelation
  /** Hardware models and architectures the candidate was measured on. */
  hardwareModels: string[]
  architectures: string[]
  dtypes: string[]
  /** Axis bindings of the candidate's measured workloads. */
  axes: Record<string, number>[]
  bestRank: number | null
  bestEvidence: EvidenceLevel | null
  techniques: string[]
}

export type PrecedentRequest = {
  gpu: string | null
  architecture: string | null
  dtypes: string[]
  axes: Record<string, number>
  /** Traits of the leaders on the target operation; empty when unknown. */
  leaderTraits: string[]
}

/** Architecture neighbours: sharing a generation boundary transfers most
 * of the memory-system lessons, little of the instruction-level ones. */
const ADJACENT: Record<string, string[]> = {
  sm_100: ["sm_90", "sm_103", "sm_120"],
  sm_103: ["sm_100"],
  sm_120: ["sm_100"],
  sm_90: ["sm_100", "sm_80"],
  sm_80: ["sm_90", "sm_86", "sm_89"],
  sm_86: ["sm_80", "sm_89"],
  sm_89: ["sm_80", "sm_86"],
  gfx942: ["gfx950"],
  gfx950: ["gfx942"],
}

const label = (gpu: string) => gpu.replace("NVIDIA ", "").replace("AMD ", "")

function computation(relation: ComputationRelation): [number, string | null] {
  switch (relation.kind) {
    case "same":
      return [1, "same computation"]
    case "equivalent":
      return [1, "reviewed-equivalent definition of the same computation"]
    case "related":
      return [0.8, `related operation: ${relation.rationale}`]
    case "family":
      return [0.6, `same family (${relation.family})`]
    case "fuzzy":
      return [0.4, "structurally similar operation"]
    case "none":
      return [0.15, null]
  }
}

function hardware(
  request: PrecedentRequest,
  candidate: PrecedentCandidate,
): [number, string | null] {
  if (request.gpu === null && request.architecture === null) return [0.6, null]
  const wanted = request.gpu?.toLowerCase() ?? null
  const model = candidate.hardwareModels.find(
    (entry) => wanted !== null && entry.toLowerCase().includes(wanted),
  )
  if (model) return [1, `same GPU (${label(model)})`]
  // The read seam fills `architecture` from the corpus when only a GPU was
  // named, so a B200 request still scores sm_100 and sm_90 candidates.
  const architecture = request.architecture
  if (architecture && candidate.architectures.includes(architecture))
    return [0.8, `same architecture (${architecture})`]
  const adjacent = architecture
    ? candidate.architectures.find((entry) =>
        ADJACENT[architecture]?.includes(entry),
      )
    : undefined
  if (adjacent) return [0.5, `adjacent architecture (${adjacent})`]
  return [0.2, null]
}

function workload(
  request: PrecedentRequest,
  candidate: PrecedentCandidate,
): [number, string[]] {
  const wantsDtype = request.dtypes.length > 0
  const wantsAxes = Object.keys(request.axes).length > 0
  if (!wantsDtype && !wantsAxes) return [0.5, []]
  const reasons: string[] = []
  let score = 0
  let parts = 0
  if (wantsDtype) {
    parts += 1
    if (request.dtypes.every((dtype) => candidate.dtypes.includes(dtype))) {
      score += 1
      reasons.push(`same dtype (${request.dtypes.join("/")})`)
    }
  }
  if (wantsAxes) {
    parts += 1
    // Closest measured case by mean log2 distance over the shared axes.
    let best: { distance: number; axis: string; theirs: number } | null = null
    for (const axes of candidate.axes) {
      const shared = Object.entries(request.axes).filter(
        ([axis, value]) => value > 0 && (axes[axis] ?? 0) > 0,
      )
      if (shared.length === 0) continue
      const distances = shared.map(([axis, value]) => ({
        axis,
        theirs: axes[axis],
        d: Math.abs(Math.log2(value / axes[axis])),
      }))
      const mean = distances.reduce((sum, e) => sum + e.d, 0) / distances.length
      const far = distances.sort((a, b) => b.d - a.d)[0]
      if (best === null || mean < best.distance)
        best = { distance: mean, axis: far.axis, theirs: far.theirs }
    }
    if (best !== null) {
      const closeness = Math.max(0, 1 - best.distance / 4)
      score += closeness
      if (best.distance === 0) reasons.push("same shape")
      else if (closeness > 0.5)
        reasons.push(
          `adjacent shape (${best.axis} ${request.axes[best.axis]} vs ${best.theirs})`,
        )
    }
  }
  return [score / parts, reasons]
}

function quality(candidate: PrecedentCandidate): [number, string | null] {
  let score =
    candidate.bestRank === 1
      ? 1
      : candidate.bestRank !== null && candidate.bestRank <= 3
        ? 0.8
        : candidate.bestRank !== null
          ? 0.5
          : 0.3
  const strong =
    candidate.bestEvidence === "verified" ||
    candidate.bestEvidence === "replicated"
  if (strong) score = Math.min(1, score + 0.1)
  const reason =
    candidate.bestRank === 1
      ? "holds a cohort record"
      : candidate.bestRank !== null && candidate.bestRank <= 3
        ? `ranks #${candidate.bestRank} in its cohort`
        : null
  return [score, reason]
}

function techniques(
  request: PrecedentRequest,
  candidate: PrecedentCandidate,
): [number, string | null] {
  if (candidate.techniques.length === 0) return [0, null]
  if (request.leaderTraits.length > 0) {
    const shared = candidate.techniques.filter((trait) =>
      request.leaderTraits.includes(trait),
    )
    if (shared.length === 0) return [0.1, null]
    return [
      shared.length / request.leaderTraits.length,
      `shares ${shared.slice(0, 3).join(", ")} with the target's leaders`,
    ]
  }
  const memory = candidate.techniques.filter((trait) =>
    MEMORY_PATTERN_TRAITS.has(trait),
  )
  if (memory.length === 0) return [0.2, null]
  return [
    Math.min(1, memory.length / 3),
    `memory pattern: ${memory.slice(0, 3).join(", ")}`,
  ]
}

export function scorePrecedent(
  request: PrecedentRequest,
  candidate: PrecedentCandidate,
): { score: number; reasons: string[]; dimensions: PrecedentDimensions } {
  const parts = {
    computation: computation(candidate.relation),
    hardware: hardware(request, candidate),
    workload: workload(request, candidate),
    quality: quality(candidate),
    techniques: techniques(request, candidate),
  }
  const dimensions = Object.fromEntries(
    Object.entries(parts).map(([key, [value]]) => [key, round(value)]),
  ) as PrecedentDimensions
  const score = round(
    (Object.keys(WEIGHTS) as (keyof PrecedentDimensions)[]).reduce(
      (sum, key) => sum + WEIGHTS[key] * parts[key][0],
      0,
    ),
  )
  const reasons = Object.values(parts).flatMap(([, reason]) => reason ?? [])
  return { score, reasons, dimensions }
}

const round = (value: number) => Math.round(value * 100) / 100
