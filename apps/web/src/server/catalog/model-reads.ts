// Model surface reads (§16.21): kernel-side `model:` workload provenance
// joined to per-GPU best-known evidence. Kernel tags and serving model
// revisions stay separate surfaces (§8.16) and meet only on an exact slug.
// "Best" resolves inside one comparison cohort on one GPU (§11.1);
// deployability is a filter with reasons, never a rank input (§11.8).
import { and, arrayContains, asc, eq, inArray, max, sql } from "drizzle-orm"
import type {
  ModelBestKnown,
  ModelGap,
  ModelIndexModel,
  ModelPageModel,
} from "../../lib/catalog-models.ts"
import { humanizeOperationName, relatedModelTags } from "../../lib/names.ts"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"
import { deployability } from "../policy/deployability.ts"
import { RANKING_POLICY_VERSION, rankCohort } from "../policy/ranking.ts"
import { listModelCoverage } from "./api-reads.ts"
import { eligibleRunFilter } from "./record-events.ts"
import {
  implementationColumns,
  projectColumns,
  rankInputOf,
  resultRow,
  runColumns,
  sourceColumns,
  sourceRefs,
} from "./run-rows.ts"
import { eligibleServingRuns } from "./serving-reads.ts"

type KernelIndexRow = {
  model: string
  operations: number
  families: number
  runs: number
  gpus: number
  last: string | Date | null
}

/** The /models index: per-tag kernel coverage plus the serving revision
 * list — two arrays, never one ranking or a merged count. */
export async function getModelIndex(): Promise<ModelIndexModel> {
  const [kernel, coverage] = await Promise.all([
    db().execute(sql`
      select substr(t.tag, 7) as model,
        count(distinct operations.id)::int as operations,
        count(distinct operations.family)::int as families,
        count(benchmark_runs.id)::int as runs,
        count(distinct benchmark_runs.hardware_model)::int as gpus,
        max(benchmark_runs.observed_at) as last
      from operations
      cross join unnest(operations.tags) as t(tag)
      left join workloads on workloads.operation_id = operations.id
      left join benchmark_runs on benchmark_runs.workload_id = workloads.id
        and ${eligibleRunFilter()}
      where t.tag like 'model:%'
      group by t.tag
      order by count(benchmark_runs.id) desc, substr(t.tag, 7) asc
    `) as Promise<KernelIndexRow[]>,
    listModelCoverage(),
  ])
  return {
    illustrative: false,
    kernel: [...kernel].map((row) => ({
      model: row.model,
      operations: Number(row.operations),
      families: Number(row.families),
      runs: Number(row.runs),
      gpus: Number(row.gpus),
      lastObservedAt: row.last ? new Date(row.last).toISOString() : null,
    })),
    serving: coverage.serving,
  }
}

async function joinedRunsForModel(operationIds: string[]) {
  return db()
    .select({
      run: runColumns,
      implementation: implementationColumns,
      project: projectColumns,
      workload: {
        id: schema.workloads.id,
        dtypes: schema.workloads.dtypes,
        shapeSummary: schema.workloads.shapeSummary,
      },
      source: sourceColumns,
      operation: {
        id: schema.operations.id,
        slug: schema.operations.slug,
        name: schema.operations.name,
      },
    })
    .from(schema.benchmarkRuns)
    .innerJoin(
      schema.implementations,
      eq(schema.benchmarkRuns.implementationId, schema.implementations.id),
    )
    .innerJoin(
      schema.projects,
      eq(schema.implementations.projectId, schema.projects.id),
    )
    .innerJoin(
      schema.workloads,
      eq(schema.benchmarkRuns.workloadId, schema.workloads.id),
    )
    .innerJoin(
      schema.operations,
      eq(schema.workloads.operationId, schema.operations.id),
    )
    .innerJoin(
      schema.sources,
      eq(schema.benchmarkRuns.sourceId, schema.sources.id),
    )
    .where(
      and(
        inArray(schema.workloads.operationId, operationIds),
        eligibleRunFilter(),
      ),
    )
    .orderBy(schema.benchmarkRuns.primaryValue)
}

type ModelRun = Awaited<ReturnType<typeof joinedRunsForModel>>[number]

/** Resolve one operation's rows on one GPU: the cohort with the most
 * rankable evidence, ranked under ranking-v1 — the answer card's fastest
 * and fastest-deployable slots as data. Null when nothing is rankable. */
export function bestKnown(
  rows: ModelRun[],
  operation: { name: string; slug: string },
  family: string,
): ModelBestKnown | null {
  const byCohort = new Map<string, ModelRun[]>()
  for (const row of rows) {
    const bucket = byCohort.get(row.run.comparisonKey)
    if (bucket) bucket.push(row)
    else byCohort.set(row.run.comparisonKey, [row])
  }
  const rankableOf = (list: ModelRun[]) =>
    list.filter((row) => row.run.primaryValue !== null)
  const cohort = [...byCohort.values()].sort(
    (a, b) =>
      rankableOf(b).length - rankableOf(a).length || b.length - a.length,
  )[0]
  const rankable = cohort ? rankableOf(cohort) : []
  if (rankable.length === 0) return null

  const sourceNative = cohort.some((row) => row.run.sourceNative)
  const profile = sourceNative
    ? ("source_native" as const)
    : ("strict_exact" as const)
  const byId = new Map(rankable.map((row) => [row.run.id, row]))
  const ranked = rankCohort(rankable.map(rankInputOf), profile)
  const rowOf = (entry: (typeof ranked)[number]) =>
    resultRow(byId.get(entry.id) as ModelRun, operation, {
      rank: entry.rank,
      tiedWithPrevious: entry.tiedWithPrevious,
      cohortSize: ranked.length,
    })
  const deployableEntry = ranked.find((entry) => {
    const { implementation } = byId.get(entry.id) as ModelRun
    return deployability({
      sourceAvailable: implementation.sourceAvailable,
      installable: implementation.installable,
      licenseConcluded: implementation.licenseExpression,
    }).eligible
  })
  return {
    operation: rowOf(ranked[0]).operation,
    family,
    fastest: rowOf(ranked[0]),
    deployable: deployableEntry ? rowOf(deployableEntry) : null,
    workloadId: cohort[0].workload.id,
    cohort: {
      comparisonKey: cohort[0].run.comparisonKey,
      profile,
      description: sourceNative
        ? `Measured by the source's own harness. Ranked by its metric under ${RANKING_POLICY_VERSION}.`
        : `Same workload, protocol, and environment throughout. Ranked by latency under ${RANKING_POLICY_VERSION}; runs too close to call share a rank.`,
      facts: [],
    },
    alternatives: ranked.length - 1,
  }
}

/** The model dossier: this model's operations resolved on one GPU. Null
 * only when the slug matches no kernel tag, no related tag, and no serving
 * revision — near-misses render as the related-tag chooser instead. */
export async function getModelPage(
  slug: string,
  gpu?: string,
): Promise<ModelPageModel | null> {
  const database = db()
  const [operations, tagRows, servingRows] = await Promise.all([
    database
      .select({
        id: schema.operations.id,
        slug: schema.operations.slug,
        name: schema.operations.name,
        family: schema.operations.family,
      })
      .from(schema.operations)
      .where(arrayContains(schema.operations.tags, [`model:${slug}`]))
      .orderBy(asc(schema.operations.slug)),
    database.execute(sql`
      select distinct substr(t.tag, 7) as model
      from operations cross join unnest(operations.tags) as t(tag)
      where t.tag like 'model:%'
    `) as Promise<{ model: string }[]>,
    database
      .select({
        slug: schema.modelRevisions.slug,
        name: max(schema.modelRevisions.name),
        runs: sql<number>`count(${schema.servingRuns.id})::int`,
      })
      .from(schema.modelRevisions)
      .leftJoin(
        schema.servingRuns,
        and(
          eq(schema.servingRuns.modelRevisionId, schema.modelRevisions.id),
          eligibleServingRuns(),
        ),
      )
      .where(eq(schema.modelRevisions.slug, slug))
      .groupBy(schema.modelRevisions.slug),
  ])
  const relatedTags = relatedModelTags(
    slug,
    [...tagRows].map((row) => row.model),
  )
  const serving = servingRows[0]
    ? {
        slug: servingRows[0].slug,
        name: servingRows[0].name ?? servingRows[0].slug,
        runs: Number(servingRows[0].runs),
      }
    : null
  const base = {
    illustrative: false,
    model: { slug, relatedTags },
    stats: { operations: 0, families: 0, runs: 0 },
    gpus: [],
    selectedGpu: null,
    groups: [],
    gaps: [],
    serving,
    sources: [],
  }
  if (operations.length === 0) {
    if (relatedTags.length === 0 && serving === null) return null
    return { ...base, resolved: false }
  }

  const joined = await joinedRunsForModel(operations.map((op) => op.id))
  const sources = await sourceRefs(joined)
  const byOperation = new Map<string, ModelRun[]>()
  const runsByGpu = new Map<string, number>()
  for (const row of joined) {
    const bucket = byOperation.get(row.operation.id)
    if (bucket) bucket.push(row)
    else byOperation.set(row.operation.id, [row])
    runsByGpu.set(
      row.run.hardwareModel,
      (runsByGpu.get(row.run.hardwareModel) ?? 0) + 1,
    )
  }
  const gpus = [...runsByGpu.entries()]
    .map(([model, runs]) => ({ model, runs }))
    .sort((a, b) => b.runs - a.runs || a.model.localeCompare(b.model))
  const selectedGpu =
    (gpu !== undefined && runsByGpu.has(gpu) ? gpu : undefined) ??
    gpus[0]?.model ??
    null

  const byFamily = new Map<
    string,
    { entries: ModelBestKnown[]; covered: number }
  >()
  const gaps: ModelGap[] = []
  for (const operation of operations) {
    const rows = byOperation.get(operation.id) ?? []
    const onGpu =
      selectedGpu === null
        ? []
        : rows.filter((row) => row.run.hardwareModel === selectedGpu)
    const entry =
      onGpu.length > 0 ? bestKnown(onGpu, operation, operation.family) : null
    if (entry) {
      const group = byFamily.get(operation.family) ?? {
        entries: [],
        covered: 0,
      }
      group.entries.push(entry)
      group.covered += onGpu.length
      byFamily.set(operation.family, group)
    } else {
      gaps.push({
        operation: {
          name: humanizeOperationName(operation.name),
          slug: operation.slug,
        },
        family: operation.family,
        measuredOn: [
          ...new Set(rows.map((row) => row.run.hardwareModel)),
        ].sort(),
      })
    }
  }

  return {
    ...base,
    resolved: true,
    stats: {
      operations: operations.length,
      families: new Set(operations.map((op) => op.family)).size,
      runs: joined.length,
    },
    gpus,
    selectedGpu,
    groups: [...byFamily.entries()]
      .sort((a, b) => b[1].covered - a[1].covered || a[0].localeCompare(b[0]))
      .map(([family, group]) => ({ family, entries: group.entries })),
    gaps: gaps.sort(
      (a, b) =>
        a.family.localeCompare(b.family) ||
        a.operation.slug.localeCompare(b.operation.slug),
    ),
    sources,
  }
}
