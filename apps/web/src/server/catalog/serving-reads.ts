// Serving reads (§8.16, §16.13) over the dedicated serving tables. Separate
// from kernel reads by design: cohorts come from serving-v1 policy, ranking
// exists only under an explicit objective, and no universal score is ever
// computed. Loaded via reads.ts so both backends satisfy one seam.
import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm"
import type {
  ServingCohortGroup,
  ServingConfigurationSummary,
  ServingConstraintView,
  ServingResolveInput,
  ServingResolveModel,
  ServingResultRow,
  ServingRunPageModel,
  ServingRunSummary,
} from "../../lib/serving-models.ts"
import type {
  ServingConfigurationManifest,
  ServingRunManifest,
  ServingWorkloadManifest,
} from "../../schemas/kinds.ts"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"
import {
  type Constraint,
  feasibility,
  paretoFrontier,
  rankByObjective,
  SERVING_POLICY_VERSION,
  type ServingCandidate,
} from "../policy/serving.ts"

const eligibleServingRuns = () =>
  and(
    isNotNull(schema.servingRuns.publishedAt),
    eq(schema.servingRuns.status, "valid"),
    isNull(schema.servingRuns.retractedAt),
  )

const joined = {
  run: schema.servingRuns,
  model: schema.modelRevisions,
  configuration: schema.servingConfigurations,
  stack: schema.servingStackRevisions,
  workload: schema.servingWorkloads,
  source: schema.sources,
}

function joinedRuns(database: ReturnType<typeof db>) {
  return database
    .select(joined)
    .from(schema.servingRuns)
    .innerJoin(
      schema.modelRevisions,
      eq(schema.servingRuns.modelRevisionId, schema.modelRevisions.id),
    )
    .innerJoin(
      schema.servingConfigurations,
      eq(schema.servingRuns.configurationId, schema.servingConfigurations.id),
    )
    .innerJoin(
      schema.servingStackRevisions,
      eq(
        schema.servingConfigurations.stackRevisionId,
        schema.servingStackRevisions.id,
      ),
    )
    .innerJoin(
      schema.servingWorkloads,
      eq(schema.servingRuns.workloadId, schema.servingWorkloads.id),
    )
    .innerJoin(
      schema.sources,
      eq(schema.servingRuns.sourceId, schema.sources.id),
    )
}

type JoinedServingRun = {
  run: typeof schema.servingRuns.$inferSelect
  model: typeof schema.modelRevisions.$inferSelect
  configuration: typeof schema.servingConfigurations.$inferSelect
  stack: typeof schema.servingStackRevisions.$inferSelect
  workload: typeof schema.servingWorkloads.$inferSelect
  source: typeof schema.sources.$inferSelect
}

type MeasurementRow = typeof schema.servingMeasurements.$inferSelect

const sourceUrl = (policy: unknown): string | null =>
  policy !== null && typeof policy === "object" && "url" in (policy as object)
    ? String((policy as { url: unknown }).url)
    : null

function cohortDescription(row: JoinedServingRun): string {
  const { run, model, workload } = row
  const nodes = run.nodeCount > 1 ? ` × ${run.nodeCount} nodes` : ""
  return [
    model.name,
    workload.name,
    run.scenario,
    `${run.acceleratorCount}× ${run.acceleratorModel}${nodes}`,
    run.qualityPolicy,
  ].join(" · ")
}

function resultRow(
  row: JoinedServingRun,
  measurements: MeasurementRow[],
  constraints: ServingConstraintView[],
): ServingResultRow {
  const stored = row.run.manifest as ServingRunManifest
  return {
    runId: row.run.id,
    rank: null,
    onFrontier: false,
    model: { name: row.model.name, slug: row.model.slug },
    stack: [row.stack.name, row.stack.version].filter(Boolean).join(" "),
    configuration: row.configuration.summary,
    dtype: row.configuration.dtype,
    qualityPolicy: row.run.qualityPolicy,
    scenario: row.run.scenario,
    hardware: {
      model: row.run.acceleratorModel,
      perNode: row.run.acceleratorCount,
      nodes: row.run.nodeCount,
      total: row.run.totalAccelerators,
    },
    harness: `${stored.spec.harness.name} ${stored.spec.harness.version}`,
    measurements: measurements.map((m) => ({
      metric: m.metric,
      statistic: m.statistic,
      value: Number(m.value),
      unit: m.unit,
    })),
    constraints,
    caveats: stored.spec.caveats ?? [],
    observedAt: row.run.observedAt.toISOString(),
    source: {
      name: row.source.name,
      externalId: stored.spec.sourceNative?.externalId ?? null,
      url: sourceUrl(row.source.policy),
    },
  }
}

function candidateOf(
  row: JoinedServingRun,
  measurements: MeasurementRow[],
): ServingCandidate {
  const workload = row.workload.manifest as ServingWorkloadManifest
  return {
    runId: row.run.id,
    measurements: measurements.map((m) => ({
      metric: m.metric,
      statistic: m.statistic,
      value: Number(m.value),
      unit: m.unit,
    })),
    declaredSlo: (workload.spec.slo ?? []).map((bound) => ({
      metric: bound.metric,
      statistic: bound.statistic,
      operator: bound.operator,
      value: bound.value,
    })),
  }
}

export async function resolveServing(
  input: ServingResolveInput,
): Promise<ServingResolveModel> {
  const database = db()
  const filters = [eligibleServingRuns()]
  if (input.model) filters.push(eq(schema.modelRevisions.slug, input.model))
  if (input.workload)
    filters.push(eq(schema.servingWorkloads.slug, input.workload))
  if (input.hardware?.model)
    filters.push(
      ilike(schema.servingRuns.acceleratorModel, `%${input.hardware.model}%`),
    )
  if (input.hardware?.countMaximum !== undefined)
    filters.push(
      lte(schema.servingRuns.totalAccelerators, input.hardware.countMaximum),
    )

  const [rows, facetModels, facetWorkloads, facetHardware, [total]] =
    await Promise.all([
      joinedRuns(database)
        .where(and(...filters))
        .orderBy(desc(schema.servingRuns.observedAt))
        .limit(400),
      database
        .select({
          slug: schema.modelRevisions.slug,
          name: schema.modelRevisions.name,
          runs: sql<number>`count(*)::int`,
        })
        .from(schema.servingRuns)
        .innerJoin(
          schema.modelRevisions,
          eq(schema.servingRuns.modelRevisionId, schema.modelRevisions.id),
        )
        .where(eligibleServingRuns())
        .groupBy(schema.modelRevisions.slug, schema.modelRevisions.name)
        .orderBy(desc(sql`count(*)`)),
      database
        .select({
          slug: schema.servingWorkloads.slug,
          name: schema.servingWorkloads.name,
          runs: sql<number>`count(*)::int`,
        })
        .from(schema.servingRuns)
        .innerJoin(
          schema.servingWorkloads,
          eq(schema.servingRuns.workloadId, schema.servingWorkloads.id),
        )
        .where(eligibleServingRuns())
        .groupBy(schema.servingWorkloads.slug, schema.servingWorkloads.name)
        .orderBy(desc(sql`count(*)`)),
      database
        .selectDistinct({ model: schema.servingRuns.acceleratorModel })
        .from(schema.servingRuns)
        .where(eligibleServingRuns())
        .orderBy(schema.servingRuns.acceleratorModel),
      database
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.servingRuns)
        .where(eligibleServingRuns()),
    ])

  const measurementRows =
    rows.length > 0
      ? await database
          .select()
          .from(schema.servingMeasurements)
          .where(
            inArray(
              schema.servingMeasurements.runId,
              rows.map((row) => row.run.id),
            ),
          )
      : []
  const measurementsByRun = new Map<string, MeasurementRow[]>()
  for (const m of measurementRows) {
    measurementsByRun.set(m.runId, [
      ...(measurementsByRun.get(m.runId) ?? []),
      m,
    ])
  }

  const byCohort = new Map<string, JoinedServingRun[]>()
  for (const row of rows) {
    byCohort.set(row.run.cohortKey, [
      ...(byCohort.get(row.run.cohortKey) ?? []),
      row,
    ])
  }

  const groups: ServingCohortGroup[] = []
  for (const [cohortKey, cohortRows] of byCohort) {
    groups.push(
      buildCohortGroup(cohortKey, cohortRows, measurementsByRun, input),
    )
  }
  // Larger cohorts first; a deterministic order for equal sizes.
  groups.sort(
    (a, b) =>
      b.rows.length - a.rows.length || a.cohortKey.localeCompare(b.cohortKey),
  )

  return {
    illustrative: false,
    input,
    facets: {
      models: facetModels,
      workloads: facetWorkloads,
      hardware: facetHardware.map((row) => row.model),
      metrics: ["output_token_throughput_tps", "ttft_ms", "tpot_ms"],
    },
    groups,
    totalRuns: total?.n ?? 0,
    policyVersion: SERVING_POLICY_VERSION,
    generatedAt: new Date().toISOString(),
  }
}

/** Shared by both backends: feasibility → objective ranks → Pareto flags. */
export function buildCohortGroup(
  cohortKey: string,
  cohortRows: JoinedServingRun[],
  measurementsByRun: Map<string, MeasurementRow[]>,
  input: ServingResolveInput,
): ServingCohortGroup {
  const constraints: Constraint[] = input.constraints ?? []
  const feasible: {
    row: JoinedServingRun
    candidate: ServingCandidate
    views: ServingConstraintView[]
  }[] = []
  const excluded: ServingCohortGroup["excluded"] = []

  for (const row of cohortRows) {
    const candidate = candidateOf(row, measurementsByRun.get(row.run.id) ?? [])
    const result = feasibility(candidate, constraints)
    const views: ServingConstraintView[] = Object.entries(result.outcomes).map(
      ([constraint, outcome]) => ({
        constraint,
        state: outcome.state,
        satisfied: outcome.state === "unknown" ? null : outcome.satisfied,
        detail:
          outcome.state === "measured"
            ? `measured ${outcome.observed}`
            : outcome.state === "declared"
              ? `harness enforces ≤ ${outcome.bound}`
              : "not reported",
      }),
    )
    if (result.feasible) feasible.push({ row, candidate, views })
    else
      excluded.push({
        runId: row.run.id,
        configuration: row.configuration.summary,
        reasons: result.reasons,
      })
  }

  const candidates = feasible.map((entry) => entry.candidate)
  const { frontier } = paretoFrontier(candidates)
  const ranks = input.objective
    ? new Map(
        rankByObjective(candidates, input.objective).map((entry) => [
          entry.runId,
          entry.rank,
        ]),
      )
    : null

  const axisSets = candidates.map(
    (candidate) =>
      new Set(candidate.measurements.map((m) => `${m.metric}·${m.statistic}`)),
  )
  const sharedAxes = [...(axisSets[0] ?? new Set<string>())].filter((axis) =>
    axisSets.every((set) => set.has(axis)),
  )

  const resultRows = feasible.map((entry) => ({
    ...resultRow(
      entry.row,
      measurementsByRun.get(entry.row.run.id) ?? [],
      entry.views,
    ),
    rank: ranks?.get(entry.row.run.id) ?? null,
    onFrontier: frontier.includes(entry.row.run.id),
  }))
  resultRows.sort((a, b) => {
    if (a.rank !== null && b.rank !== null) return a.rank - b.rank
    if (a.rank !== null) return -1
    if (b.rank !== null) return 1
    return Number(b.onFrontier) - Number(a.onFrontier)
  })

  return {
    cohortKey,
    description: cohortDescription(cohortRows[0]),
    rows: resultRows,
    excluded,
    sharedAxes,
  }
}

export async function getServingRunPage(
  id: string,
): Promise<ServingRunPageModel | null> {
  const database = db()
  const byDigest = id.startsWith("sha256:")
  if (
    !byDigest &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
  )
    return null
  const [row] = await joinedRuns(database).where(
    byDigest
      ? eq(schema.servingRuns.runDigest, id)
      : eq(schema.servingRuns.id, id),
  )
  if (!row || row.run.publishedAt === null) return null
  const measurements = await database
    .select()
    .from(schema.servingMeasurements)
    .where(eq(schema.servingMeasurements.runId, row.run.id))
  const stored = row.run.manifest as ServingRunManifest
  const configuration = row.configuration
    .manifest as ServingConfigurationManifest
  const native = stored.spec.sourceNative
  const retraction = row.run.retractionReason as { reason?: string } | null

  return {
    illustrative: false,
    run: {
      id: row.run.id,
      digest: row.run.runDigest,
      status: row.run.status,
      observedAt: row.run.observedAt.toISOString(),
      publishedAt: row.run.publishedAt.toISOString(),
    },
    cohort: {
      key: row.run.cohortKey,
      description: cohortDescription(row),
      qualityPolicy: row.run.qualityPolicy,
      scenario: row.run.scenario,
    },
    model: {
      name: row.model.name,
      slug: row.model.slug,
      license: row.model.license,
    },
    stack: { name: row.stack.name, version: row.stack.version },
    configuration: {
      summary: row.configuration.summary,
      dtype: row.configuration.dtype,
      quantization: row.configuration.quantization,
      facts: Object.entries(configuration.spec.options ?? {}).map(
        ([key, value]) => ({ key, value }),
      ),
    },
    workload: {
      name: row.workload.name,
      streaming: row.workload.streaming,
      loadGeneration: row.workload.loadGeneration,
    },
    topology: {
      acceleratorModel: row.run.acceleratorModel,
      perNode: row.run.acceleratorCount,
      nodes: row.run.nodeCount,
      total: row.run.totalAccelerators,
    },
    harness: `${stored.spec.harness.name} ${stored.spec.harness.version}`,
    measurements: measurements.map((m) => ({
      metric: m.metric,
      statistic: m.statistic,
      value: Number(m.value),
      unit: m.unit,
    })),
    caveats: stored.spec.caveats ?? [],
    lifecycle: {
      retracted: row.run.retractedAt
        ? {
            at: row.run.retractedAt.toISOString(),
            reason: retraction?.reason ?? "retracted",
          }
        : null,
    },
    attribution: {
      line: native
        ? `${row.source.name} · ${native.division}/${native.category} · entry ${native.externalId}`
        : row.source.name,
      url: sourceUrl(row.source.policy),
    },
    manifest: row.run.manifest,
  }
}

export async function listServingRuns(input: {
  cursor?: string
  limit?: number
}): Promise<{ runs: ServingRunSummary[]; nextCursor: string | null }> {
  const database = db()
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  const filters = [eligibleServingRuns()]
  if (input.cursor) {
    const [at, id] = Buffer.from(input.cursor, "base64url")
      .toString()
      .split("|")
    if (at && id)
      filters.push(
        or(
          lt(schema.servingRuns.observedAt, new Date(at)),
          and(
            eq(schema.servingRuns.observedAt, new Date(at)),
            lt(schema.servingRuns.id, id),
          ),
        ),
      )
  }
  const rows = await joinedRuns(database)
    .where(and(...filters))
    .orderBy(desc(schema.servingRuns.observedAt), desc(schema.servingRuns.id))
    .limit(limit + 1)
  const page = rows.slice(0, limit)
  const last = page.at(-1)
  return {
    runs: page.map((row) => ({
      id: row.run.id,
      model: row.model.name,
      stack: [row.stack.name, row.stack.version].filter(Boolean).join(" "),
      configuration: row.configuration.summary,
      scenario: row.run.scenario,
      hardware: row.run.acceleratorModel,
      totalAccelerators: row.run.totalAccelerators,
      observedAt: row.run.observedAt.toISOString(),
    })),
    nextCursor:
      rows.length > limit && last
        ? Buffer.from(
            `${last.run.observedAt.toISOString()}|${last.run.id}`,
          ).toString("base64url")
        : null,
  }
}

export async function listServingConfigurations(): Promise<
  ServingConfigurationSummary[]
> {
  const database = db()
  return database
    .select({
      id: schema.servingConfigurations.id,
      digest: schema.servingConfigurations.configurationDigest,
      stack: schema.servingStackRevisions.name,
      summary: schema.servingConfigurations.summary,
      dtype: schema.servingConfigurations.dtype,
      runs: sql<number>`(
        select count(*)::int from serving_runs r
        where r.configuration_id = ${schema.servingConfigurations.id}
          and r.published_at is not null and r.status = 'valid'
          and r.retracted_at is null)`,
    })
    .from(schema.servingConfigurations)
    .innerJoin(
      schema.servingStackRevisions,
      eq(
        schema.servingConfigurations.stackRevisionId,
        schema.servingStackRevisions.id,
      ),
    )
    .orderBy(schema.servingStackRevisions.name)
    .limit(500)
}
