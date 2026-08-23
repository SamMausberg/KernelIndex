// Hardware and project standing reads (§16.4): the two browse axes beside
// operations. Grouped scalar queries over eligible runs only — no manifests,
// no ranking; records come from the same ledger model the records page
// renders, so the counts can never disagree with it.
import { and, count, desc, eq, gte, max, type SQL, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import type {
  EvidenceLevel,
  HardwareIndexModel,
  HardwarePageModel,
  ProjectIndexEntry,
  ProjectIndexModel,
  ProjectPageModel,
  SourceRef,
} from "../../lib/catalog-models.ts"
import { hardwareSlug } from "../../lib/names.ts"
import type { SoftwareProjectManifest } from "../../schemas/kinds.ts"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"
import { getRecordsPage } from "./home-reads.ts"
import { bestEvidence } from "./present.ts"
import { eligibleRunFilter } from "./record-events.ts"
import {
  implementationColumns,
  projectColumns,
  resultRow,
  runColumns,
  sourceColumns,
} from "./run-rows.ts"

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

/** The sources behind a slice of eligible runs, each with its terms and
 * newest observation; the provenance footer of the GPU and project pages.
 * Implementations are joined so project-scoped conditions resolve. */
async function sourcesWhere(condition: SQL | undefined): Promise<SourceRef[]> {
  const rows = await db()
    .select({
      name: schema.sources.name,
      kind: schema.sources.kind,
      policy: schema.sources.policy,
      observedAt: max(schema.benchmarkRuns.observedAt),
    })
    .from(schema.benchmarkRuns)
    .innerJoin(
      schema.implementations,
      eq(schema.benchmarkRuns.implementationId, schema.implementations.id),
    )
    .innerJoin(
      schema.sources,
      eq(schema.benchmarkRuns.sourceId, schema.sources.id),
    )
    .where(condition)
    .groupBy(schema.sources.id)
  return rows.map((row) => {
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

  const [[stats], families, sources, { records }] = await Promise.all([
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
    sourcesWhere(onModel),
    getRecordsPage(),
  ])
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
      kind: schema.projects.kind,
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
  const [{ records }, transitions] = await Promise.all([
    getRecordsPage(),
    recordTransitions(),
  ])
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
      kind: row.kind as ProjectIndexEntry["kind"],
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
      gained30d: transitions.gained.get(row.slug) ?? 0,
      lost30d: transitions.lost.get(row.slug) ?? 0,
    })),
  }
}

/**
 * Record transitions of the trailing 30 days per project (§16.12 standing):
 * every `new_run` event credits the new holder's project and debits the
 * displaced holder's, when they differ. Retraction re-promotions are not
 * counted as gains.
 */
async function recordTransitions() {
  const winRun = alias(schema.benchmarkRuns, "win_run")
  const winImpl = alias(schema.implementations, "win_impl")
  const winProject = alias(schema.projects, "win_project")
  const lostRun = alias(schema.benchmarkRuns, "lost_run")
  const lostImpl = alias(schema.implementations, "lost_impl")
  const lostProject = alias(schema.projects, "lost_project")
  const rows = await db()
    .select({ winner: winProject.slug, loser: lostProject.slug })
    .from(schema.recordEvents)
    .innerJoin(winRun, eq(schema.recordEvents.runId, winRun.id))
    .innerJoin(winImpl, eq(winRun.implementationId, winImpl.id))
    .innerJoin(winProject, eq(winImpl.projectId, winProject.id))
    .leftJoin(lostRun, eq(schema.recordEvents.previousRunId, lostRun.id))
    .leftJoin(lostImpl, eq(lostRun.implementationId, lostImpl.id))
    .leftJoin(lostProject, eq(lostImpl.projectId, lostProject.id))
    .where(
      and(
        eq(schema.recordEvents.cause, "new_run"),
        gte(schema.recordEvents.at, sql`now() - interval '30 days'`),
      ),
    )
  const gained = new Map<string, number>()
  const lost = new Map<string, number>()
  for (const row of rows) {
    gained.set(row.winner, (gained.get(row.winner) ?? 0) + 1)
    if (row.loser !== null && row.loser !== row.winner)
      lost.set(row.loser, (lost.get(row.loser) ?? 0) + 1)
  }
  return { gained, lost }
}

// Eligible runs loaded per project page, fastest first; a library baseline
// measured on thousands of workloads keeps its deeper rows off the page
// (counts come from the grouped stats query, never from this slice).
const PROJECT_RUNS_LIMIT = 2000

export async function getProjectPage(
  slug: string,
): Promise<ProjectPageModel | null> {
  const [project] = await db()
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.slug, slug))
  if (!project) return null
  const manifest = project.manifest as SoftwareProjectManifest
  const onProject = and(
    eligibleRunFilter(),
    eq(schema.implementations.projectId, project.id),
  )
  const [joined, [stats], sources, claims, { records }] = await Promise.all([
    db()
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
          name: schema.operations.name,
          slug: schema.operations.slug,
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
      .where(onProject)
      .orderBy(schema.benchmarkRuns.primaryValue)
      .limit(PROJECT_RUNS_LIMIT),
    db()
      .select({
        implementations: sql<number>`count(distinct ${schema.benchmarkRuns.implementationId})::int`,
        runs: count(),
        hardware: sql<
          string[] | null
        >`array_agg(distinct ${schema.benchmarkRuns.hardwareModel})`,
        licenses: sql<
          string[] | null
        >`array_remove(array_agg(distinct ${schema.implementations.licenseExpression}), null)`,
        lastObservedAt: max(schema.benchmarkRuns.observedAt),
        illustrative: illustrativeOnly,
      })
      .from(schema.benchmarkRuns)
      .innerJoin(
        schema.implementations,
        eq(schema.benchmarkRuns.implementationId, schema.implementations.id),
      )
      .innerJoin(
        schema.sources,
        eq(schema.benchmarkRuns.sourceId, schema.sources.id),
      )
      .where(onProject),
    sourcesWhere(onProject),
    db()
      .select({ state: schema.projectClaims.state, by: schema.users.name })
      .from(schema.projectClaims)
      .leftJoin(schema.users, eq(schema.projectClaims.userId, schema.users.id))
      .where(eq(schema.projectClaims.projectId, project.id)),
    getRecordsPage(),
  ])

  // One row per measured implementation revision, fastest first (the run
  // order); the row's evidence is the revision's strongest run (§11.4).
  const byImplementation = new Map<string, typeof joined>()
  for (const j of joined) {
    const own = byImplementation.get(j.implementation.id)
    if (own) own.push(j)
    else byImplementation.set(j.implementation.id, [j])
  }
  const implementations = [...byImplementation.values()].map((own) => {
    const row = resultRow(own[0], own[0].operation)
    return {
      slug: row.implementation.slug,
      name: row.implementation.name,
      project: row.project,
      operation: row.operation,
      language: row.language,
      framework: row.framework,
      evidence: bestEvidence(own.map((j) => j.run)),
      bestPrimary: row.primary,
      sourceAvailable: row.sourceAvailable,
      installable: row.installable,
      license: row.license,
    }
  })
  const accepted = claims.find((claim) => claim.state === "accepted")
  return {
    illustrative: stats.illustrative === true,
    project: {
      slug: project.slug,
      name: project.name,
      kind: project.kind as ProjectIndexEntry["kind"],
      repositoryUrl: project.canonicalUrl,
      host: manifest.spec.host ?? null,
      licenses: stats.licenses ?? [],
    },
    stats: {
      implementations: stats.implementations,
      runs: stats.runs,
      hardware: stats.hardware ?? [],
      lastObservedAt: stats.lastObservedAt?.toISOString() ?? null,
    },
    records: records.filter((holder) => holder.current.project.slug === slug),
    implementations,
    claim: accepted
      ? { state: "claimed", by: accepted.by }
      : claims.some((claim) => claim.state === "pending")
        ? { state: "pending", by: null }
        : { state: "unclaimed", by: null },
    sources,
  }
}
