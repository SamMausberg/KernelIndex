// Structured workload matching (§12.5): compare a typed SearchIntent against
// one observed run and enumerate every difference. Zero mismatches means the
// run answers the request exactly; anything else is compatible evidence and
// must never be promoted (§22.4 gate). Policy facets (trust, license,
// source, installable) are deliberately not compared here — they filter
// within a group (§11.4 step 10) instead of reclassifying evidence.
import type { Mismatch } from "../../lib/catalog-models.ts"
import type { SearchIntent } from "../../lib/search-query.ts"
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
