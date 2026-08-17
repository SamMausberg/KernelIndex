// Workload-sweep derivation (§16.8): from one operation's eligible runs,
// find the workload family that varies along exactly one numeric axis while
// everything else — other axes, dtypes, hardware, environment, protocol,
// metric — is held constant, and trace each implementation's best value
// across it. A visualization of scaling, never a ranking across cohorts
// (§11.1): ranks exist only inside the selected cohort's table.
import type { OperationSweep, SweepSeries } from "../../lib/catalog-models.ts"

export type SweepRun = {
  workloadId: string
  implementation: { name: string; slug: string }
  value: number
  /** Everything that must be held constant for points to share a chart:
   * protocol, environment, hardware, metric, statistic, unit, dtypes. */
  constantKey: string
}

const MAX_SERIES = 5

/** Stable signature of a workload's axes with one axis removed. */
function axesSignature(
  axes: Record<string, number | string>,
  omit: string,
): string {
  return Object.keys(axes)
    .filter((key) => key !== omit)
    .sort()
    .map((key) => `${key}=${axes[key]}`)
    .join("·")
}

export function computeSweep(input: {
  anchorWorkloadId: string | null
  anchorConstantKey: string | null
  environmentLabel: string
  metricLabel: string
  unit: string
  lowerIsBetter: boolean
  runs: SweepRun[]
  workloadAxes: ReadonlyMap<string, Record<string, number | string>>
}): OperationSweep | null {
  const { anchorWorkloadId, anchorConstantKey, workloadAxes } = input
  if (anchorWorkloadId === null || anchorConstantKey === null) return null
  const anchorAxes = workloadAxes.get(anchorWorkloadId)
  if (!anchorAxes) return null
  const candidates = input.runs.filter(
    (run) => run.constantKey === anchorConstantKey,
  )
  const measured = new Set(candidates.map((run) => run.workloadId))

  // The sweep axis: the numeric axis whose family (same signature of the
  // remaining axes) spans the most measured distinct values, at least three.
  let best: { axis: string; workloads: Map<string, number> } | null = null
  for (const [axis, value] of Object.entries(anchorAxes)) {
    if (typeof value !== "number") continue
    const signature = axesSignature(anchorAxes, axis)
    const workloads = new Map<string, number>()
    for (const [id, axes] of workloadAxes) {
      const x = axes[axis]
      if (typeof x !== "number" || !measured.has(id)) continue
      if (axesSignature(axes, axis) !== signature) continue
      workloads.set(id, x)
    }
    const distinct = new Set(workloads.values()).size
    if (
      distinct >= 3 &&
      distinct > (best ? new Set(best.workloads.values()).size : 0)
    )
      best = { axis, workloads }
  }
  if (!best) return null

  // Best eligible value per implementation per workload in the family.
  const byImplementation = new Map<
    string,
    {
      implementation: SweepRun["implementation"]
      byWorkload: Map<string, number>
    }
  >()
  for (const run of candidates) {
    const x = best.workloads.get(run.workloadId)
    if (x === undefined) continue
    const entry = byImplementation.get(run.implementation.slug) ?? {
      implementation: run.implementation,
      byWorkload: new Map<string, number>(),
    }
    const current = entry.byWorkload.get(run.workloadId)
    if (
      current === undefined ||
      (input.lowerIsBetter ? run.value < current : run.value > current)
    )
      entry.byWorkload.set(run.workloadId, run.value)
    byImplementation.set(run.implementation.slug, entry)
  }

  const series: SweepSeries[] = [...byImplementation.values()]
    .map((entry) => ({
      implementation: entry.implementation,
      points: [...entry.byWorkload]
        .map(([workloadId, value]) => ({
          workloadId,
          value,
          x: best.workloads.get(workloadId) as number,
        }))
        .sort((a, b) => a.x - b.x),
    }))
    // A single point is not a trace; it already lives in the cohort table.
    .filter((entry) => entry.points.length >= 2)
    // Order (and so color assignment) by the rightmost point: comparing at
    // each trace's smallest workload would favor whoever measured smallest.
    .sort((a, b) => {
      const aLast = a.points[a.points.length - 1].value
      const bLast = b.points[b.points.length - 1].value
      return input.lowerIsBetter ? aLast - bLast : bLast - aLast
    })
  if (series.length === 0 || !series.some((s) => s.points.length >= 3))
    return null

  return {
    axis: best.axis,
    unit: input.unit,
    metricLabel: input.metricLabel,
    environmentLabel: input.environmentLabel,
    series: series.slice(0, MAX_SERIES),
    overflow: Math.max(0, series.length - MAX_SERIES),
  }
}
