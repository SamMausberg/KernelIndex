// Hardware and project standing reads (§16.4): the two browse axes beside
// operations. Grouped scalar queries over eligible runs only — no manifests,
// no ranking; records come from the same ledger model the records page
// renders, so the counts can never disagree with it.
import { and, count, desc, eq, max, sql } from "drizzle-orm"
import type {
  EvidenceLevel,
  HardwareIndexModel,
  HardwarePageModel,
  ProjectIndexModel,
  SourceRef,
} from "../../lib/catalog-models.ts"
import { hardwareSlug } from "../../lib/names.ts"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"
import { getRecordsPage } from "./reads.ts"
import { eligibleRunFilter } from "./record-events.ts"

/** Evidence tier in SQL, mirroring policy/trust.ts evidenceLevel exactly
 * (identity is complete on every published row). */
const evidenceTier = sql<number>`max(case
  when ${schema.benchmarkRuns.independentReplicationCount} >= 2 then 4
  when ${schema.benchmarkRuns.reproducedByKernelindex} then 3
  when ${schema.benchmarkRuns.sourceAvailable}
    and ${schema.benchmarkRuns.hasRawEvidence} then 2
  else 1 end)::int`
const TIERS: (EvidenceLevel | null)[] = [
  null,
  "reported",
  "reproducible",
  "verified",
  "replicated",
]

const illustrativeOnly = sql<boolean>`bool_and(${schema.sources.kind} = 'illustrative')`

/** A GPU's architecture from its runs, never poisoned by an importer's
 * 'unknown' placeholder (which sorts above every sm_/gfx_ value in max). */
const knownArchitecture = sql<
  string | null
>`max(${schema.benchmarkRuns.hardwareArchitecture}) filter (where ${schema.benchmarkRuns.hardwareArchitecture} <> 'unknown')`

export async function getHardwareIndex(): Promise<HardwareIndexModel> {
  const rows = await db()
    .select({
      model: schema.benchmarkRuns.hardwareModel,
      architecture: knownArchitecture,
      runs: count(),
      operations: sql<number>`count(distinct ${schema.workloads.operationId})::int`,
      lastObservedAt: max(schema.benchmarkRuns.observedAt),
      illustrative: illustrativeOnly,
    })
    .from(schema.benchmarkRuns)
    .innerJoin(
      schema.workloads,
      eq(schema.benchmarkRuns.workloadId, schema.workloads.id),
    )
    .innerJoin(
      schema.sources,
      eq(schema.benchmarkRuns.sourceId, schema.sources.id),
    )
    .where(eligibleRunFilter())
    .groupBy(schema.benchmarkRuns.hardwareModel)
    .orderBy(desc(count()))
  const { records } = await getRecordsPage()
  const recordCount = new Map<string, number>()
  for (const holder of records)
    recordCount.set(
      holder.hardware,
      (recordCount.get(holder.hardware) ?? 0) + 1,
    )
  return {
    illustrative: rows.length > 0 && rows.every((row) => row.illustrative),
    gpus: rows.map((row) => ({
      slug: hardwareSlug(row.model),
      model: row.model,
      architecture: row.architecture,
      runs: row.runs,
      operations: row.operations,
      records: recordCount.get(row.model) ?? 0,
      lastObservedAt: row.lastObservedAt?.toISOString() ?? null,
    })),
  }
}

export async function getHardwarePage(
  slug: string,
): Promise<HardwarePageModel | null> {
  const models = await db()
    .selectDistinct({ model: schema.benchmarkRuns.hardwareModel })
    .from(schema.benchmarkRuns)
    .where(eligibleRunFilter())
  const model = models.find((row) => hardwareSlug(row.model) === slug)?.model
  if (model === undefined) return null
  const onModel = and(
    eligibleRunFilter(),
    eq(schema.benchmarkRuns.hardwareModel, model),
  )

  const [[stats], families, sourceRows, { records }] = await Promise.all([
    db()
      .select({
        architecture: knownArchitecture,
        runs: count(),
        operations: sql<number>`count(distinct ${schema.workloads.operationId})::int`,
        implementations: sql<number>`count(distinct ${schema.benchmarkRuns.implementationId})::int`,
        lastObservedAt: max(schema.benchmarkRuns.observedAt),
      })
      .from(schema.benchmarkRuns)
      .innerJoin(
        schema.workloads,
        eq(schema.benchmarkRuns.workloadId, schema.workloads.id),
      )
      .where(onModel),
    db()
      .select({
        family: schema.operations.family,
        operations: sql<number>`count(distinct ${schema.workloads.operationId})::int`,
        runs: count(),
        withSource: sql<number>`count(*) filter (where ${schema.benchmarkRuns.sourceAvailable})::int`,
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
      .where(onModel)
      .groupBy(schema.operations.family)
      .orderBy(desc(count())),
    db()
      .select({
        name: schema.sources.name,
        kind: schema.sources.kind,
        policy: schema.sources.policy,
        observedAt: max(schema.benchmarkRuns.observedAt),
      })
      .from(schema.benchmarkRuns)
      .innerJoin(
        schema.sources,
        eq(schema.benchmarkRuns.sourceId, schema.sources.id),
      )
      .where(onModel)
      .groupBy(schema.sources.id),
    getRecordsPage(),
  ])

  const sources: SourceRef[] = sourceRows.map((row) => {
    const policy =
      row.policy !== null && typeof row.policy === "object"
        ? (row.policy as { url?: string; license?: string })
        : {}
    return {
      name: row.name,
      kind: row.kind,
      url: policy.url ?? null,
      license: policy.license ?? null,
      externalId: null,
      observedAt: row.observedAt?.toISOString() ?? null,
    }
  })
  return {
    illustrative:
      sources.length > 0 &&
      sources.every((source) => source.kind === "illustrative"),
    hardware: { slug, model, architecture: stats.architecture },
    stats: {
      runs: stats.runs,
      operations: stats.operations,
      implementations: stats.implementations,
      lastObservedAt: stats.lastObservedAt?.toISOString() ?? null,
    },
    records: records.filter((holder) => holder.hardware === model),
    families,
    sources,
  }
}

export async function getProjectIndex(): Promise<ProjectIndexModel> {
  const rows = await db()
    .select({
      slug: schema.projects.slug,
      name: schema.projects.name,
      repositoryUrl: max(schema.projects.canonicalUrl),
      implementations: sql<number>`count(distinct ${schema.benchmarkRuns.implementationId})::int`,
      runs: count(),
      tier: evidenceTier,
      licenses: sql<
        string[]
      >`array_remove(array_agg(distinct ${schema.implementations.licenseExpression}), null)`,
      installable: sql<boolean>`bool_or(${schema.implementations.installable})`,
      sourceAvailable: sql<boolean>`bool_or(${schema.implementations.sourceAvailable})`,
      hardware: sql<
        string[]
      >`array_agg(distinct ${schema.benchmarkRuns.hardwareModel})`,
      lastObservedAt: max(schema.benchmarkRuns.observedAt),
      illustrative: illustrativeOnly,
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
      schema.sources,
      eq(schema.benchmarkRuns.sourceId, schema.sources.id),
    )
    .where(eligibleRunFilter())
    .groupBy(schema.projects.id)
    .orderBy(desc(count()))
  const { records } = await getRecordsPage()
  const recordCount = new Map<string, number>()
  for (const holder of records) {
    const slug = holder.current.project.slug
    recordCount.set(slug, (recordCount.get(slug) ?? 0) + 1)
  }
  return {
    illustrative: rows.length > 0 && rows.every((row) => row.illustrative),
    projects: rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      repositoryUrl: row.repositoryUrl,
      implementations: row.implementations,
      runs: row.runs,
      records: recordCount.get(row.slug) ?? 0,
      bestEvidence: TIERS[row.tier] ?? null,
      licenses: row.licenses,
      installable: row.installable,
      sourceAvailable: row.sourceAvailable,
      hardware: row.hardware,
      lastObservedAt: row.lastObservedAt?.toISOString() ?? null,
    })),
  }
}
