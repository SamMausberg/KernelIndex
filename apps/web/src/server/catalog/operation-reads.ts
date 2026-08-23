// Operation surfaces (§16.5, §16.8): the compact corpus index behind search
// suggestions and browse, and the operation dossier page with its workload
// picker, cohort table, sweep, and implementation summaries.
import { count, eq, inArray, max } from "drizzle-orm"
import type {
  OperationIndexEntry,
  OperationPageModel,
} from "../../lib/catalog-models.ts"
import {
  humanizeOperationName,
  implementationDisplayName,
} from "../../lib/names.ts"
import { parseQuery } from "../../lib/search-query.ts"
import type { OperationSpecManifest } from "../../schemas/kinds.ts"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"
import { estimateHeadroom } from "../policy/headroom.ts"
import { defaultWorkloadId, fillCohortFacts, groupRuns } from "./cohorts.ts"
import {
  type AnyWorkloadManifest,
  operationAxisSpecs,
  operationTensorBindings,
  runEvidence,
  toleranceSummary,
  workloadLabel,
} from "./present.ts"
import { eligibleRunFilter } from "./record-events.ts"
import { equivalenceGroups, equivalentOperationIds } from "./relations.ts"
import {
  implementationRows,
  implementationSummaries,
  joinedRunsForOperation,
  type OperationJoinedRun,
  pageIllustrative,
  sourceRefs,
} from "./run-rows.ts"
import { computeSweep } from "./sweep.ts"

/**
 * The compact corpus index behind search suggestions and browse: every
 * operation with its humanized name, family, eligible run count, and newest
 * observation date. Two grouped queries; the result ships inline with the
 * page (§16.5).
 */
export async function getOperationIndex(): Promise<OperationIndexEntry[]> {
  const database = db()
  const [operations, aliasRows, runStats] = await Promise.all([
    database
      .select({
        name: schema.operations.name,
        slug: schema.operations.slug,
        family: schema.operations.family,
        id: schema.operations.id,
      })
      .from(schema.operations),
    database
      .select({
        operationId: schema.operationAliases.operationId,
        alias: schema.operationAliases.alias,
      })
      .from(schema.operationAliases),
    database
      .select({
        operationId: schema.workloads.operationId,
        n: count(),
        lastObservedAt: max(schema.benchmarkRuns.observedAt),
      })
      .from(schema.benchmarkRuns)
      .innerJoin(
        schema.workloads,
        eq(schema.benchmarkRuns.workloadId, schema.workloads.id),
      )
      .where(eligibleRunFilter())
      .groupBy(schema.workloads.operationId),
  ])
  const statsById = new Map(runStats.map((row) => [row.operationId, row]))
  const aliasesById = new Map<string, string[]>()
  for (const row of aliasRows) {
    const bucket = aliasesById.get(row.operationId)
    if (bucket) bucket.push(row.alias)
    else aliasesById.set(row.operationId, [row.alias])
  }
  // Reviewed-equivalent definitions collapse to one browse/chooser row: the
  // member with the most evidence carries the union counts, and the other
  // definitions' names stay findable as aliases. Presentation only — the
  // operation pages and cohorts of every member remain intact (§8.4).
  const byId = new Map(operations.map((operation) => [operation.id, operation]))
  const skip = new Set<string>()
  for (const ids of new Set((await equivalenceGroups()).values())) {
    const members = ids.flatMap((id) => byId.get(id) ?? [])
    if (members.length < 2) continue
    const [canonical, ...rest] = [...members].sort(
      (a, b) =>
        (statsById.get(b.id)?.n ?? 0) - (statsById.get(a.id)?.n ?? 0) ||
        a.slug.localeCompare(b.slug),
    )
    const canonicalStats = statsById.get(canonical.id) ?? {
      operationId: canonical.id,
      n: 0,
      lastObservedAt: null,
    }
    const canonicalAliases = aliasesById.get(canonical.id) ?? []
    aliasesById.set(canonical.id, canonicalAliases)
    for (const member of rest) {
      skip.add(member.id)
      const stats = statsById.get(member.id)
      canonicalStats.n += stats?.n ?? 0
      if (
        stats?.lastObservedAt &&
        (canonicalStats.lastObservedAt === null ||
          stats.lastObservedAt > canonicalStats.lastObservedAt)
      )
        canonicalStats.lastObservedAt = stats.lastObservedAt
      canonicalAliases.push(
        member.name,
        member.slug,
        ...(aliasesById.get(member.id) ?? []),
      )
    }
    statsById.set(canonical.id, canonicalStats)
  }
  return operations
    .filter((operation) => !skip.has(operation.id))
    .map((operation) => {
      const stats = statsById.get(operation.id)
      return {
        name: humanizeOperationName(operation.name),
        slug: operation.slug,
        family: operation.family,
        aliases: aliasesById.get(operation.id) ?? [],
        runs: stats?.n ?? 0,
        lastObservedAt: stats?.lastObservedAt?.toISOString() ?? null,
      }
    })
}

export async function getOperationPage(
  slug: string,
  workload?: string,
  cohort?: string,
): Promise<OperationPageModel | null> {
  const database = db()
  const [operation] = await database
    .select()
    .from(schema.operations)
    .where(eq(schema.operations.slug, slug))
  if (!operation) return null
  const manifest = operation.manifest as OperationSpecManifest
  const equivalentIds = await equivalentOperationIds(operation.id)

  const [workloadRows, aliases, joined, implRows, equivalentRows] =
    await Promise.all([
      database
        .select()
        .from(schema.workloads)
        .where(inArray(schema.workloads.operationId, equivalentIds)),
      database
        .select({ alias: schema.operationAliases.alias })
        .from(schema.operationAliases)
        .where(eq(schema.operationAliases.operationId, operation.id)),
      joinedRunsForOperation(equivalentIds),
      implementationRows(equivalentIds),
      database
        .select({
          id: schema.operations.id,
          name: schema.operations.name,
          slug: schema.operations.slug,
        })
        .from(schema.operations)
        .where(inArray(schema.operations.id, equivalentIds)),
    ])
  const requestedWorkload = workloadRows.find(
    (w) => w.id === workload || w.workloadDigest === workload,
  )
  const selectedWorkloadId =
    requestedWorkload?.id ??
    defaultWorkloadId(
      joined,
      workloadRows.map((w) => w.id),
    )
  const manifestById = new Map(
    workloadRows.map((row) => [row.id, row.manifest as AnyWorkloadManifest]),
  )
  const groups = selectedWorkloadId
    ? groupRuns(
        joined,
        { name: operation.name, slug: operation.slug },
        manifest,
        manifestById,
        selectedWorkloadId,
        parseQuery(""),
        cohort,
      )
    : {
        exact: [],
        reported: [],
        compatible: [],
        cohort: null,
        cohortOptions: [],
        headRunId: null,
      }
  // Independent round trips: cohort facts and source refs together.
  const [, operationSources] = await Promise.all([
    fillCohortFacts(groups),
    sourceRefs(joined),
  ])

  const implementations = implementationSummaries(implRows, joined, operation)
  const evidence = joined.map((j) => runEvidence(j.run))

  // Sweep inputs (§16.8): everything that must be held constant for two
  // runs to share the chart, folded into one key; the axes come from the
  // WorkloadCase manifests already loaded above.
  const sweepConstant = (j: OperationJoinedRun) =>
    [
      j.run.protocolKey,
      j.run.environmentKey,
      j.run.hardwareModel,
      j.run.primaryMetric,
      j.run.primaryStatistic ?? "value",
      j.run.primaryUnit ?? "",
      j.workload.dtypes.join("/"),
    ].join("|")
  const anchor =
    groups.cohort !== null
      ? (joined.find(
          (j) => j.run.comparisonKey === groups.cohort?.comparisonKey,
        ) ?? null)
      : null
  const sweep = computeSweep({
    anchorWorkloadId: selectedWorkloadId,
    anchorConstantKey: anchor ? sweepConstant(anchor) : null,
    environmentLabel: anchor
      ? [anchor.run.hardwareModel, anchor.run.environmentSummary]
          .filter(Boolean)
          .join(" · ")
      : "",
    metricLabel: anchor
      ? `${anchor.run.primaryMetric} · ${anchor.run.primaryStatistic ?? "value"}`
      : "",
    unit: anchor?.run.primaryUnit ?? "",
    lowerIsBetter: (anchor?.run.primaryUnit ?? "ns") === "ns",
    runs: joined
      .filter((j) => j.run.primaryValue !== null)
      .map((j) => ({
        workloadId: j.workload.id,
        implementation: {
          name: implementationDisplayName(
            j.implementation.title ?? undefined,
            operation,
            j.implementation.slug,
          ),
          slug: j.implementation.slug,
        },
        value: j.run.primaryValue as number,
        constantKey: sweepConstant(j),
      })),
    workloadAxes: new Map(
      workloadRows.flatMap((row) => {
        const workloadManifest = row.manifest as AnyWorkloadManifest
        return workloadManifest.kind === "WorkloadCase"
          ? [[row.id, { ...workloadManifest.spec.axes }] as const]
          : []
      }),
    ),
  })

  return {
    illustrative: pageIllustrative(joined),
    operation: {
      id: operation.id,
      slug: operation.slug,
      name: humanizeOperationName(operation.name),
      family: operation.family,
      aliases: aliases.map((row) => row.alias),
      equivalents: equivalentRows
        .filter((row) => row.id !== operation.id)
        .map((row) => ({
          name: humanizeOperationName(row.name),
          slug: row.slug,
        })),
      models: operation.tags
        .filter((tag) => tag.startsWith("model:"))
        .map((tag) => tag.slice(6)),
      semanticDigest: operation.semanticDigest,
      summary:
        manifest.metadata.description ??
        manifest.spec.semantics.expression ??
        "",
      supersededById: null,
    },
    semantics: {
      inputs: operationTensorBindings(manifest.spec.inputs),
      outputs: operationTensorBindings(manifest.spec.outputs),
      axes: operationAxisSpecs(manifest),
      expression: manifest.spec.semantics.expression ?? null,
      determinism: manifest.spec.semantics.determinism,
      constraints:
        manifest.spec.semantics.mutation === "none"
          ? ["No mutation or aliasing"]
          : [],
    },
    workloads: workloadRows.map((row) => {
      const workloadManifest = row.manifest as AnyWorkloadManifest
      return {
        id: row.id,
        digest: row.workloadDigest,
        label: workloadLabel(workloadManifest, row.dtypes),
        axes:
          workloadManifest.kind === "WorkloadCase"
            ? { ...workloadManifest.spec.axes }
            : {},
        dtypes: row.dtypes,
        toleranceSummary: toleranceSummary(workloadManifest),
      }
    }),
    selectedWorkloadId,
    cohortOptions: groups.cohortOptions,
    cohort: groups.cohort,
    records: groups.exact,
    sweep,
    headroom:
      anchor && selectedWorkloadId
        ? estimateHeadroom({
            family: operation.family,
            hardwareModel: anchor.run.hardwareModel,
            workload: manifestById.get(
              selectedWorkloadId,
            ) as AnyWorkloadManifest,
            best: groups.exact[0]?.primary ?? null,
          })
        : null,
    implementations,
    coverage: {
      verified: evidence.filter(
        (level) => level === "verified" || level === "replicated",
      ).length,
      reproducible: evidence.filter((level) => level === "reproducible").length,
      reported: evidence.filter((level) => level === "reported").length,
      lastObservedAt:
        joined.length > 0
          ? new Date(
              Math.max(...joined.map((j) => j.run.observedAt.getTime())),
            ).toISOString()
          : null,
    },
    sources: operationSources,
  }
}
