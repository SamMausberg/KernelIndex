// The feed (§13.11): what the index learned over the trailing 30 days,
// derived on read — record breaks from record_events, publication batches
// from benchmark_runs, corrections and accepted claims from the audit trail.
// No stored feed, no fan-out. Every entry carries the keys the following
// filter matches on; the public view renders them all.
import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  max,
  sql,
} from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import type { FeedEntry, FeedModel } from "@/lib/catalog-models"
import { dtypeLabel } from "@/lib/format"
import { humanizeOperationName, implementationDisplayName } from "@/lib/names"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"
import {
  implementationColumns,
  primaryOf,
  projectColumns,
  runColumns,
} from "./reads.ts"
import { eligibleRunFilter } from "./record-events.ts"

const WINDOW = sql`now() - interval '30 days'`
const ENTRY_CAP = 300

const modelTags = (tags: string[]) =>
  tags.filter((tag) => tag.startsWith("model:")).map((tag) => tag.slice(6))

/** Record breaks: a run displacing a previous record, dated by the time
 * the index published it (a fresh import of old observations still leads,
 * like the Atom feed). */
async function recordBreaks(): Promise<FeedEntry[]> {
  const prev = alias(schema.benchmarkRuns, "prev")
  const prevImpl = alias(schema.implementations, "prev_impl")
  const prevProject = alias(schema.projects, "prev_project")
  const rows = await db()
    .select({
      run: runColumns,
      implementation: implementationColumns,
      project: projectColumns,
      workload: {
        id: schema.workloads.id,
        dtypes: schema.workloads.dtypes,
        shapeSummary: schema.workloads.shapeSummary,
      },
      operation: {
        name: schema.operations.name,
        slug: schema.operations.slug,
        tags: schema.operations.tags,
      },
      previous: {
        primaryMetric: prev.primaryMetric,
        primaryValue: prev.primaryValue,
        primaryUnit: prev.primaryUnit,
        primaryStatistic: prev.primaryStatistic,
        sampleCount: prev.sampleCount,
        uncertaintyLow: prev.uncertaintyLow,
        uncertaintyHigh: prev.uncertaintyHigh,
        title: prevImpl.title,
        slug: prevImpl.slug,
        project: prevProject.slug,
      },
    })
    .from(schema.recordEvents)
    .innerJoin(
      schema.benchmarkRuns,
      eq(schema.recordEvents.runId, schema.benchmarkRuns.id),
    )
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
    .innerJoin(prev, eq(schema.recordEvents.previousRunId, prev.id))
    .innerJoin(prevImpl, eq(prev.implementationId, prevImpl.id))
    .innerJoin(prevProject, eq(prevImpl.projectId, prevProject.id))
    .where(
      and(
        eq(schema.recordEvents.cause, "new_run"),
        eligibleRunFilter(),
        gt(schema.benchmarkRuns.publishedAt, WINDOW),
      ),
    )
    .orderBy(
      desc(schema.benchmarkRuns.publishedAt),
      desc(schema.recordEvents.at),
    )
    .limit(ENTRY_CAP)
  return rows.flatMap((row) => {
    const value = primaryOf(row.run)
    const previous = primaryOf(row.previous)
    if (value === null || previous === null || row.run.publishedAt === null)
      return []
    const operation = {
      name: humanizeOperationName(row.operation.name),
      slug: row.operation.slug,
    }
    return [
      {
        kind: "record" as const,
        at: row.run.publishedAt.toISOString(),
        runId: row.run.id,
        operation,
        workloadId: row.workload.id,
        workloadSummary: [
          dtypeLabel(row.workload.dtypes),
          row.workload.shapeSummary,
        ]
          .filter(Boolean)
          .join(" · "),
        hardware: row.run.hardwareModel,
        implementation: {
          name: implementationDisplayName(
            row.implementation.title ?? undefined,
            operation,
            row.implementation.slug,
          ),
          slug: row.implementation.slug,
        },
        project: { name: row.project.name, slug: row.project.slug },
        value,
        previous: {
          implementation: {
            name: implementationDisplayName(
              row.previous.title ?? undefined,
              operation,
              row.previous.slug,
            ),
            slug: row.previous.slug,
          },
          value: previous,
        },
        improvementPct:
          previous.value > 0
            ? ((previous.value - value.value) / previous.value) * 100
            : null,
        cohortKey: row.run.comparisonKey,
        match: {
          cohort: row.run.comparisonKey,
          operation: row.operation.slug,
          projects: [...new Set([row.project.slug, row.previous.project])],
          gpu: row.run.hardwareModel,
          models: modelTags(row.operation.tags),
        },
      },
    ]
  })
}

/** Publication batches: one entry per source and UTC day, with what the
 * batch brought (first records included, so import day never reads as a
 * wall of "first record" lines). */
async function importBatches(): Promise<FeedEntry[]> {
  const day = sql<string>`date_trunc('day', ${schema.benchmarkRuns.publishedAt})::text`
  const since = gt(schema.benchmarkRuns.publishedAt, WINDOW)
  const [rows, firsts] = await Promise.all([
    db()
      .select({
        sourceId: schema.sources.id,
        slug: schema.sources.slug,
        name: schema.sources.name,
        day,
        at: max(schema.benchmarkRuns.publishedAt),
        runs: count(),
        operations: sql<number>`count(distinct ${schema.workloads.operationId})::int`,
        hardware: sql<
          string[]
        >`array_agg(distinct ${schema.benchmarkRuns.hardwareModel})`,
      })
      .from(schema.benchmarkRuns)
      .innerJoin(
        schema.sources,
        eq(schema.benchmarkRuns.sourceId, schema.sources.id),
      )
      .innerJoin(
        schema.workloads,
        eq(schema.benchmarkRuns.workloadId, schema.workloads.id),
      )
      .where(since)
      .groupBy(schema.sources.id, day),
    // First records per batch: a separate grouped count, since a correlated
    // subquery cannot see the outer query's grouped day.
    db()
      .select({
        sourceId: schema.benchmarkRuns.sourceId,
        day,
        n: count(),
      })
      .from(schema.recordEvents)
      .innerJoin(
        schema.benchmarkRuns,
        eq(schema.recordEvents.runId, schema.benchmarkRuns.id),
      )
      .where(and(isNull(schema.recordEvents.previousRunId), since))
      .groupBy(schema.benchmarkRuns.sourceId, day),
  ])
  const firstRecords = new Map(
    firsts.map((row) => [`${row.sourceId}|${row.day}`, row.n]),
  )
  return rows.flatMap((row) =>
    row.at === null
      ? []
      : [
          {
            kind: "import" as const,
            at: row.at.toISOString(),
            source: { slug: row.slug, name: row.name },
            runs: row.runs,
            firstRecords: firstRecords.get(`${row.sourceId}|${row.day}`) ?? 0,
            operations: row.operations,
            hardware: row.hardware,
            match: {
              cohort: null,
              operation: null,
              projects: [],
              gpu: null,
              models: [],
            },
          },
        ],
  )
}

/** Corrections (§10.7) from the audit trail: retractions and supersessions
 * with their stated reason. */
async function corrections(): Promise<FeedEntry[]> {
  const rows = await db()
    .select({
      at: schema.auditEvents.at,
      action: schema.auditEvents.action,
      reason: schema.auditEvents.reason,
      runId: schema.benchmarkRuns.id,
      comparisonKey: schema.benchmarkRuns.comparisonKey,
      hardware: schema.benchmarkRuns.hardwareModel,
      implementation: implementationColumns,
      project: projectColumns,
      operation: {
        name: schema.operations.name,
        slug: schema.operations.slug,
        tags: schema.operations.tags,
      },
    })
    .from(schema.auditEvents)
    .innerJoin(
      schema.benchmarkRuns,
      sql`${schema.benchmarkRuns.id}::text = ${schema.auditEvents.targetId}`,
    )
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
    .where(
      and(
        eq(schema.auditEvents.targetKind, "run"),
        inArray(schema.auditEvents.action, ["retract_run", "supersede_run"]),
        gt(schema.auditEvents.at, WINDOW),
      ),
    )
    .orderBy(desc(schema.auditEvents.at))
    .limit(ENTRY_CAP)
  return rows.map((row) => {
    const operation = {
      name: humanizeOperationName(row.operation.name),
      slug: row.operation.slug,
    }
    return {
      kind: "correction" as const,
      at: row.at.toISOString(),
      runId: row.runId,
      action: row.action === "retract_run" ? "retracted" : "superseded",
      reason: row.reason,
      operation,
      implementation: {
        name: implementationDisplayName(
          row.implementation.title ?? undefined,
          operation,
          row.implementation.slug,
        ),
        slug: row.implementation.slug,
      },
      match: {
        cohort: row.comparisonKey,
        operation: row.operation.slug,
        projects: [row.project.slug],
        gpu: row.hardware,
        models: modelTags(row.operation.tags),
      },
    }
  })
}

/** Accepted claims (§15.3): attribution only, stated as such. */
async function claims(): Promise<FeedEntry[]> {
  const rows = await db()
    .select({
      at: schema.auditEvents.at,
      project: { name: schema.projects.name, slug: schema.projects.slug },
      by: schema.users.name,
    })
    .from(schema.auditEvents)
    .innerJoin(
      schema.projectClaims,
      sql`${schema.projectClaims.id}::text = ${schema.auditEvents.targetId}`,
    )
    .innerJoin(
      schema.projects,
      eq(schema.projectClaims.projectId, schema.projects.id),
    )
    .leftJoin(schema.users, eq(schema.projectClaims.userId, schema.users.id))
    .where(
      and(
        eq(schema.auditEvents.targetKind, "project_claim"),
        inArray(schema.auditEvents.action, [
          "claim_auto_accepted",
          "claim_accepted",
        ]),
        gt(schema.auditEvents.at, WINDOW),
      ),
    )
    .orderBy(desc(schema.auditEvents.at))
    .limit(ENTRY_CAP)
  return rows.map((row) => ({
    kind: "claim" as const,
    at: row.at.toISOString(),
    project: row.project,
    by: row.by ?? "a contributor",
    match: {
      cohort: null,
      operation: null,
      projects: [row.project.slug],
      gpu: null,
      models: [],
    },
  }))
}

/** Newest first, capped, grouped by UTC day. */
export function groupByDay(entries: FeedEntry[]): FeedModel["days"] {
  const sorted = [...entries]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, ENTRY_CAP)
  const days: FeedModel["days"] = []
  for (const entry of sorted) {
    const date = entry.at.slice(0, 10)
    const day = days.at(-1)
    if (day?.date === date) day.entries.push(entry)
    else days.push({ date, entries: [entry] })
  }
  return days
}

export async function getFeed(): Promise<FeedModel> {
  const [breaks, batches, corrected, claimed] = await Promise.all([
    recordBreaks(),
    importBatches(),
    corrections(),
    claims(),
  ])
  const entries = [...breaks, ...batches, ...corrected, ...claimed]
  const [{ illustrative }] = await db()
    .select({
      illustrative: sql<boolean>`bool_and(${schema.sources.kind} = 'illustrative')`,
    })
    .from(schema.sources)
  return {
    illustrative: entries.length > 0 && illustrative === true,
    days: groupByDay(entries),
  }
}
