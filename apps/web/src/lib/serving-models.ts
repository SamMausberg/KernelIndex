// Serving read models (§8.16, §16.13). A separate surface from the kernel
// catalog models: results group by serving cohort, rank only by an explicit
// objective, and carry no universal score field by construction.

export type ServingConstraint = {
  metric: string
  statistic?: string
  operator: "<=" | "<"
  value: number
}

export type ServingObjective = {
  direction: "maximize" | "minimize"
  metric: string
  statistic?: string
}

export type ServingResolveInput = {
  /** model_revisions.slug */
  model?: string
  /** serving_workloads.slug */
  workload?: string
  hardware?: { model?: string; countMaximum?: number }
  objective?: ServingObjective
  constraints?: ServingConstraint[]
}

export type ServingMeasurementView = {
  metric: string
  statistic: string
  value: number
  unit: string
}

export type ServingConstraintView = {
  constraint: string
  state: "measured" | "declared" | "unknown"
  satisfied: boolean | null
  detail: string
}

/** One feasible configuration result: every §16.13 fact, values or an
 * explicit "not reported" (null) — nothing silently blank. */
export type ServingResultRow = {
  runId: string
  rank: number | null
  onFrontier: boolean
  model: { name: string; slug: string }
  stack: string
  configuration: string
  dtype: string | null
  qualityPolicy: string
  scenario: string
  hardware: { model: string; perNode: number; nodes: number; total: number }
  harness: string
  measurements: ServingMeasurementView[]
  constraints: ServingConstraintView[]
  caveats: string[]
  observedAt: string
  source: { name: string; externalId: string | null; url: string | null }
}

export type ServingCohortGroup = {
  cohortKey: string
  /** The seven §11.1 identity parts as one readable line. */
  description: string
  /** The same identity structured for surface headers, so pages can lead
   * with what the reader filtered away and demote the rest. */
  identity: {
    model: string
    workload: string
    scenario: string
    topology: string
    quality: string
  }
  rows: ServingResultRow[]
  excluded: { runId: string; configuration: string; reasons: string[] }[]
  /** Metric·statistic axes shared by every row (the Pareto axes). */
  sharedAxes: string[]
}

/** §16.13 default view: one row per model × workload with the best reported
 * throughput configuration; the cohort stream renders only after narrowing. */
export type ServingOverviewRow = {
  model: { slug: string; name: string }
  workload: { slug: string; name: string }
  scenario: string
  runs: number
  configurations: number
  best: {
    runId: string
    throughput: number
    stack: string
    hardware: string
    totalAccelerators: number
  } | null
}

export type ServingOverviewModel = {
  illustrative: boolean
  rows: ServingOverviewRow[]
}

/** Filter-independent facet lists + totals: the resolver form renders from
 * this long-lived read while the resolve result streams in. */
export type ServingFacetsModel = {
  illustrative: boolean
  models: { slug: string; name: string; runs: number }[]
  workloads: { slug: string; name: string; runs: number }[]
  hardware: string[]
  totalRuns: number
}

export type ServingResolveModel = {
  illustrative: boolean
  input: ServingResolveInput
  facets: {
    models: { slug: string; name: string; runs: number }[]
    workloads: { slug: string; name: string; runs: number }[]
    hardware: string[]
    metrics: string[]
  }
  groups: ServingCohortGroup[]
  totalRuns: number
  policyVersion: string
  generatedAt: string
}

export type ServingRunPageModel = {
  illustrative: boolean
  run: {
    id: string
    digest: string
    status: string
    observedAt: string
    publishedAt: string | null
  }
  cohort: {
    key: string
    description: string
    qualityPolicy: string
    scenario: string
  }
  model: { name: string; slug: string; license: string | null }
  stack: { name: string; version: string | null }
  configuration: {
    summary: string
    dtype: string | null
    quantization: string | null
    facts: { key: string; value: string }[]
  }
  workload: { name: string; streaming: boolean; loadGeneration: string }
  topology: {
    acceleratorModel: string
    perNode: number
    nodes: number
    total: number
  }
  harness: string
  measurements: ServingMeasurementView[]
  caveats: string[]
  lifecycle: { retracted: { at: string; reason: string } | null }
  attribution: { line: string; url: string | null }
  manifest: unknown
}

export type ServingRunSummary = {
  id: string
  model: string
  stack: string
  configuration: string
  scenario: string
  hardware: string
  totalAccelerators: number
  observedAt: string
}

export type ServingConfigurationSummary = {
  id: string
  digest: string
  stack: string
  summary: string
  dtype: string | null
  runs: number
}
