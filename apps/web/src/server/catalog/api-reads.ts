// Corpus enumeration reads (§13.2 at 20k records): flat, filterable listings
// behind /api/v1 runs/operations/hardware/models. Database-backed only — the
// fixtures backend has no corpus to page — and always scoped to published,
// unretracted evidence. Keyset pagination, never OFFSET.
import {
  and,
  arrayContains,
  asc,
  count,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  max,
  sql,
} from "drizzle-orm"
import type {
  HardwareCoverageEntry,
  ModelCoverageModel,
  OperationListEntry,
  RunListInput,
  RunListModel,
  RunStatus,
} from "../../lib/catalog-models.ts"
import { hardwareSlug, humanizeOperationName } from "../../lib/names.ts"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"
import { runEvidence } from "./present.ts"
import { eligibleRunFilter } from "./record-events.ts"
import { eligibleServingRuns } from "./serving-reads.ts"
import { getHardwareIndex } from "./surfaces.ts"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export const RUNS_PAGE_LIMIT = 200

/**
 * Published runs, newest observation first, keyset-paged on (observedAt, id).
 * The default surface is the pages' eligibility filter; an explicit status
 * widens to any published, unretracted run of that status — failed runs are
 * evidence too (§8.11). The route decodes the cursor (see catalog-routes.ts);
 * this read encodes the next one from the last row it returns.
 */
export async function listRuns(input: RunListInput): Promise<RunListModel> {
  const limit = Math.min(input.limit ?? 50, RUNS_PAGE_LIMIT)
  const runs = schema.benchmarkRuns
  const rows = await db()
    .select({
      id: runs.id,
      digest: runs.runDigest,
      status: runs.status,
      observedAt: runs.observedAt,
      hardwareModel: runs.hardwareModel,
      primaryMetric: runs.primaryMetric,
      primaryStatistic: runs.primaryStatistic,
      primaryValue: runs.primaryValue,
      primaryUnit: runs.primaryUnit,
      sampleCount: runs.sampleCount,
      uncertaintyLow: runs.uncertaintyLow,
      uncertaintyHigh: runs.uncertaintyHigh,
      reproducedByKernelindex: runs.reproducedByKernelindex,
      independentReplicationCount: runs.independentReplicationCount,
      sourceAvailable: runs.sourceAvailable,
      installable: runs.installable,
      hasRawEvidence: runs.hasRawEvidence,
      operation: schema.operations.slug,
      implementation: schema.implementations.slug,
      source: schema.sources.slug,
    })
    .from(runs)
    .innerJoin(
      schema.implementations,
      eq(runs.implementationId, schema.implementations.id),
    )
    .innerJoin(schema.workloads, eq(runs.workloadId, schema.workloads.id))
    .innerJoin(
      schema.operations,
      eq(schema.workloads.operationId, schema.operations.id),
    )
    .innerJoin(schema.sources, eq(runs.sourceId, schema.sources.id))
    .where(
      and(
        input.status
          ? and(
              eq(runs.status, input.status),
              isNotNull(runs.publishedAt),
              isNull(runs.retractedAt),
            )
          : eligibleRunFilter(),
        input.operation
          ? UUID_PATTERN.test(input.operation)
            ? eq(schema.operations.id, input.operation)
            : eq(schema.operations.slug, input.operation)
          : undefined,
        input.hardware ? eq(runs.hardwareModel, input.hardware) : undefined,
        input.source ? eq(schema.sources.slug, input.source) : undefined,
        input.since ? gte(runs.observedAt, new Date(input.since)) : undefined,
        input.cursor
          ? sql`(${runs.observedAt}, ${runs.id}) < (${input.cursor.observedAt}::timestamptz, ${input.cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(runs.observedAt), desc(runs.id))
    .limit(limit + 1)
  const page = rows.slice(0, limit)
  const last = page.at(-1)
  return {
    runs: page.map((row) => ({
      id: row.id,
      digest: row.digest,
      operation: row.operation,
      implementation: row.implementation,
      hardware: row.hardwareModel,
      status: row.status as RunStatus,
      primary:
        row.primaryValue !== null
          ? {
              metric: row.primaryMetric,
              unit: row.primaryUnit ?? "",
              statistic: row.primaryStatistic ?? "value",
              value: row.primaryValue,
              sampleCount: row.sampleCount,
              uncertainty:
                row.uncertaintyLow !== null && row.uncertaintyHigh !== null
                  ? { low: row.uncertaintyLow, high: row.uncertaintyHigh }
                  : null,
            }
          : null,
      evidence: runEvidence(row),
      sourceAvailable: row.sourceAvailable,
      source: row.source,
      observedAt: row.observedAt.toISOString(),
    })),
    nextCursor:
      rows.length > limit && last !== undefined
        ? Buffer.from(`${last.observedAt.toISOString()} ${last.id}`).toString(
            "base64url",
          )
        : null,
    generatedAt: new Date().toISOString(),
  }
}

/** Every operation with taxonomy tags, workload count, and eligible run
 * count; optional family and tag filters. Most-measured first. */
export async function listOperations(
  input: { family?: string; tag?: string } = {},
): Promise<OperationListEntry[]> {
  const eligibleRuns = sql<number>`count(${schema.benchmarkRuns.id})::int`
  const rows = await db()
    .select({
      slug: schema.operations.slug,
      name: schema.operations.name,
      family: schema.operations.family,
      tags: schema.operations.tags,
      workloads: sql<number>`count(distinct ${schema.workloads.id})::int`,
      runs: eligibleRuns,
    })
    .from(schema.operations)
    .leftJoin(
      schema.workloads,
      eq(schema.workloads.operationId, schema.operations.id),
    )
    .leftJoin(
      schema.benchmarkRuns,
      and(
        eq(schema.benchmarkRuns.workloadId, schema.workloads.id),
        eligibleRunFilter(),
      ),
    )
    .where(
      and(
        input.family ? eq(schema.operations.family, input.family) : undefined,
        input.tag
          ? arrayContains(schema.operations.tags, [input.tag])
          : undefined,
      ),
    )
    .groupBy(schema.operations.id)
    .orderBy(desc(eligibleRuns), asc(schema.operations.slug))
  return rows.map((row) => ({
    ...row,
    name: humanizeOperationName(row.name),
  }))
}

/** Per-GPU coverage: the /gpus index read carries the kernel side; vendor,
 * family breadth, and serving run counts join in. Serving-only accelerators
 * appear as rows too — counts, never a shared ranking. */
export async function listHardwareCoverage(): Promise<HardwareCoverageEntry[]> {
  const [index, kernel, serving] = await Promise.all([
    getHardwareIndex(),
    db()
      .select({
        model: schema.benchmarkRuns.hardwareModel,
        vendor: max(schema.benchmarkRuns.hardwareVendor),
        families: sql<number>`count(distinct ${schema.operations.family})::int`,
      })
      .from(schema.benchmarkRuns)
      .innerJoin(
        schema.workloads,
        eq(schema.benchmarkRuns.workloadId, schema.workloads.id),
      )
      .innerJoin(
        schema.operations,
        eq(schema.workloads.operationId, schema.operations.id),
      )
      .where(eligibleRunFilter())
      .groupBy(schema.benchmarkRuns.hardwareModel),
    db()
      .select({
        model: schema.servingRuns.acceleratorModel,
        vendor: max(schema.servingRuns.acceleratorVendor),
        runs: count(),
      })
      .from(schema.servingRuns)
      .where(eligibleServingRuns())
      .groupBy(schema.servingRuns.acceleratorModel),
  ])
  const kernelByModel = new Map(kernel.map((row) => [row.model, row]))
  const servingByModel = new Map(serving.map((row) => [row.model, row]))
  return [
    ...index.gpus.map((gpu) => ({
      slug: gpu.slug,
      model: gpu.model,
      vendor: kernelByModel.get(gpu.model)?.vendor ?? null,
      architecture: gpu.architecture,
      kernelRuns: gpu.runs,
      servingRuns: servingByModel.get(gpu.model)?.runs ?? 0,
      operations: gpu.operations,
      families: kernelByModel.get(gpu.model)?.families ?? 0,
      lastObservedAt: gpu.lastObservedAt,
    })),
    ...serving
      .filter((row) => !kernelByModel.has(row.model))
      .map((row) => ({
        slug: hardwareSlug(row.model),
        model: row.model,
        vendor: row.vendor,
        architecture: null,
        kernelRuns: 0,
        servingRuns: row.runs,
        operations: 0,
        families: 0,
        lastObservedAt: null,
      })),
  ]
}

type TagRow = { tag: string; operations: number }

/** Model coverage: serving model revisions grouped by slug with eligible run
 * counts, and kernel `model:` provenance tags with operation counts. */
export async function listModelCoverage(): Promise<ModelCoverageModel> {
  const servingRunCount = sql<number>`count(${schema.servingRuns.id})::int`
  const [serving, tags] = await Promise.all([
    db()
      .select({
        slug: schema.modelRevisions.slug,
        name: max(schema.modelRevisions.name),
        parameterCount: max(schema.modelRevisions.parameterCount),
        runs: servingRunCount,
      })
      .from(schema.modelRevisions)
      .leftJoin(
        schema.servingRuns,
        and(
          eq(schema.servingRuns.modelRevisionId, schema.modelRevisions.id),
          eligibleServingRuns(),
        ),
      )
      .groupBy(schema.modelRevisions.slug)
      .orderBy(desc(servingRunCount), asc(schema.modelRevisions.slug)),
    db().execute(sql`
      select tag, count(*)::int operations
      from operations, unnest(tags) tag
      where tag like 'model:%'
      group by tag order by operations desc, tag`) as Promise<TagRow[]>,
  ])
  return {
    serving: serving.map((row) => ({
      slug: row.slug,
      name: row.name ?? row.slug,
      parameterCount: row.parameterCount,
      runs: row.runs,
    })),
    kernel: tags.map((row) => ({
      model: row.tag.slice("model:".length),
      operations: Number(row.operations),
    })),
  }
}
