// Structured workload matching (§12.5): compare a typed SearchIntent against
// one observed run and enumerate every difference. Zero mismatches means the
// run answers the request exactly; anything else is compatible evidence and
// must never be promoted (§22.4 gate). Policy facets (trust, license,
// source, installable) are deliberately not compared here — they filter
// within a group (§11.4 step 10) instead of reclassifying evidence.
import type { Mismatch } from "../../lib/catalog-models.ts"
import { removeToken, type SearchIntent } from "../../lib/search-query.ts"
import type { AnyWorkloadManifest } from "./present.ts"

export type MatchTarget = {
  hardwareModel: string
  hardwareArchitecture: string | null
  cudaMajor: number | null
  framework: string | null
  language: string | null
  workload: AnyWorkloadManifest
  workloadDtypes: string[]
  workloadLayouts: string[]
}

const miss = (
  field: string,
  requested: string | number,
  observed: string | number | null,
): Mismatch => ({
  field,
  requested: String(requested),
  observed: observed === null ? "unknown" : String(observed),
})

function shapeOf(workload: AnyWorkloadManifest): number[] | null {
  if (workload.kind === "WorkloadSuite") return null
  const first = Object.values(workload.spec.tensors)[0]
  return first?.shape ?? null
}

/** Does any tensor in the case carry exactly this shape? */
export function caseHasShape(
  workload: AnyWorkloadManifest,
  shape: number[],
): boolean {
  if (workload.kind === "WorkloadSuite") return false
  return Object.values(workload.spec.tensors).some(
    (tensor) =>
      tensor.shape.length === shape.length &&
      tensor.shape.every((dim, index) => dim === shape[index]),
  )
}

export function intentMismatches(
  intent: SearchIntent,
  target: MatchTarget,
): Mismatch[] {
  const mismatches: Mismatch[] = []
  const { workload } = target
  const suite = workload.kind === "WorkloadSuite"

  if (intent.gpu !== null) {
    const wanted = intent.gpu.toLowerCase()
    if (!target.hardwareModel.toLowerCase().includes(wanted)) {
      mismatches.push(miss("hardware.gpu", intent.gpu, target.hardwareModel))
    }
  }
  if (
    intent.architecture !== null &&
    intent.architecture !== target.hardwareArchitecture
  ) {
    mismatches.push(
      miss(
        "hardware.architecture",
        intent.architecture,
        target.hardwareArchitecture,
      ),
    )
  }
  if (intent.cudaMajor !== null && intent.cudaMajor !== target.cudaMajor) {
    mismatches.push(
      miss("environment.cudaToolkit", intent.cudaMajor, target.cudaMajor),
    )
  }
  for (const dtype of intent.dtypes) {
    if (!target.workloadDtypes.includes(dtype)) {
      mismatches.push(
        miss("workload.dtype", dtype, target.workloadDtypes.join("/") || null),
      )
    }
  }
  if (
    intent.layout !== null &&
    !target.workloadLayouts.includes(intent.layout)
  ) {
    mismatches.push(
      miss(
        "workload.layout",
        intent.layout,
        target.workloadLayouts.join("/") || null,
      ),
    )
  }
  if (intent.framework !== null && intent.framework !== target.framework) {
    mismatches.push(miss("framework", intent.framework, target.framework))
  }
  if (intent.language !== null && intent.language !== target.language) {
    mismatches.push(miss("language", intent.language, target.language))
  }

  // Axis bindings and shapes bind an exact case. A suite aggregate can cover
  // the request without measuring it alone: that scope difference is itself a
  // mismatch (§9.5 shape-pattern rule), enumerated once.
  if (intent.shape !== null) {
    if (suite) {
      mismatches.push(
        miss(
          "workload.scope",
          `exact case [${intent.shape.join(", ")}]`,
          "suite aggregate",
        ),
      )
    } else if (!caseHasShape(workload, intent.shape)) {
      const observed = shapeOf(workload)
      mismatches.push(
        miss(
          "workload.shape",
          `[${intent.shape.join(", ")}]`,
          observed ? `[${observed.join(", ")}]` : null,
        ),
      )
    }
  }
  for (const [axis, value] of Object.entries(intent.axes)) {
    if (suite) {
      const covered = workload.spec.cases.some(
        (entry) => entry.axes[axis] === value,
      )
      mismatches.push(
        miss(
          `axes.${axis}`,
          value,
          covered ? "covered inside suite aggregate" : "not in suite",
        ),
      )
    } else {
      const observed = workload.spec.axes[axis]
      if (observed !== value) {
        mismatches.push(miss(`axes.${axis}`, value, observed ?? null))
      }
    }
  }
  return mismatches
}

/** Differences between a selected workload and another observed workload. */
export function workloadMismatches(
  requested: AnyWorkloadManifest,
  observed: AnyWorkloadManifest,
): Mismatch[] {
  if (requested.kind === "WorkloadSuite" || observed.kind === "WorkloadSuite") {
    if (requested.kind === observed.kind) return []
    return [
      miss(
        "workload.scope",
        requested.kind === "WorkloadSuite" ? "suite aggregate" : "exact case",
        observed.kind === "WorkloadSuite" ? "suite aggregate" : "exact case",
      ),
    ]
  }
  const mismatches: Mismatch[] = []
  const names = new Set([
    ...Object.keys(requested.spec.axes),
    ...Object.keys(observed.spec.axes),
  ])
  for (const name of names) {
    const want = requested.spec.axes[name]
    const got = observed.spec.axes[name]
    if (want !== got) mismatches.push(miss(`axes.${name}`, want, got ?? null))
  }
  return mismatches
}

// ---------------------------------------------------------------------------
// Bracketing (§12.5): when a request binds a case nobody measured, name the
// measured cases on either side of it along the one axis that differs.

export type BracketCase = {
  id: string
  axes: Record<string, number | string>
  /** First tensor's shape; null for suites. */
  shape: number[] | null
  dtypes: string[]
}

export type Bracket = {
  axis: string
  requested: number
  below: { id: string; value: number } | null
  above: { id: string; value: number } | null
  /** The query token that bound the case, rewritten by `bracketQuery`. */
  token: string
  /** Set when the request bound a shape and no axis names the dimension. */
  shapeIndex: number | null
  shape: number[] | null
}

/**
 * Among cases satisfying the request's dtypes, keep those that differ from
 * the bound axes (or the bound shape) on exactly one axis (or one dimension)
 * and return the nearest below and above the request on it. Null when the
 * request binds no case or when nothing differs on exactly one axis: a
 * claim across two differences is never made.
 */
export function bracketCases(
  intent: SearchIntent,
  cases: BracketCase[],
): Bracket | null {
  const bound = Object.entries(intent.axes)
  const eligible = cases.filter((entry) =>
    intent.dtypes.every((dtype) => entry.dtypes.includes(dtype)),
  )
  const candidates: {
    axis: string
    requested: number
    id: string
    value: number
    shapeIndex: number | null
  }[] = []
  if (bound.length > 0) {
    for (const entry of eligible) {
      const differs = bound.filter(
        ([axis, value]) => entry.axes[axis] !== value,
      )
      if (differs.length !== 1) continue
      const [axis, requested] = differs[0]
      const value = entry.axes[axis]
      if (typeof value === "number")
        candidates.push({
          axis,
          requested,
          id: entry.id,
          value,
          shapeIndex: null,
        })
    }
  } else if (intent.shape !== null) {
    const shape = intent.shape
    for (const entry of eligible) {
      if (entry.shape === null || entry.shape.length !== shape.length) continue
      const differs = entry.shape.flatMap((dim, index) =>
        dim === shape[index] ? [] : [index],
      )
      if (differs.length !== 1) continue
      const index = differs[0]
      // Prefer the axis that names this dimension, so the rewrite resolves
      // through the case's axes; fall back to the dimension itself.
      const named = Object.entries(entry.axes).find(
        ([, value]) => value === entry.shape?.[index],
      )?.[0]
      candidates.push({
        axis: named ?? `dim ${index}`,
        requested: shape[index],
        id: entry.id,
        value: entry.shape[index],
        shapeIndex: named ? null : index,
      })
    }
  }
  if (candidates.length === 0) return null
  // One axis only: the one most cases vary along.
  const byAxis = new Map<string, typeof candidates>()
  for (const candidate of candidates)
    byAxis.set(candidate.axis, [
      ...(byAxis.get(candidate.axis) ?? []),
      candidate,
    ])
  const [axis, along] = [...byAxis.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  )[0]
  const { requested, shapeIndex } = along[0]
  const below = along
    .filter((entry) => entry.value < requested)
    .sort((a, b) => b.value - a.value)[0]
  const above = along
    .filter((entry) => entry.value > requested)
    .sort((a, b) => a.value - b.value)[0]
  if (!below && !above) return null
  const token =
    intent.facets.find((facet) =>
      bound.length > 0
        ? facet.field === "axis" && facet.display.startsWith(`${axis} =`)
        : facet.field === "shape",
    )?.token ?? ""
  return {
    axis,
    requested,
    below: below ? { id: below.id, value: below.value } : null,
    above: above ? { id: above.id, value: above.value } : null,
    token,
    shapeIndex,
    shape: intent.shape,
  }
}

/** The request rewritten to one bracket value, so the link lands on exact
 * resolution of that case: the binding token is replaced, every other
 * facet stays. */
export function bracketQuery(
  query: string,
  bracket: Bracket,
  value: number,
): string {
  const rest = removeToken(query, bracket.token).trim()
  if (bracket.shapeIndex !== null && bracket.shape !== null) {
    const dims = bracket.shape.map((dim, index) =>
      index === bracket.shapeIndex ? value : dim,
    )
    return `${rest} shape:[${dims.join(",")}]`.trim()
  }
  return `${rest} ${bracket.axis}=${value}`.trim()
}
