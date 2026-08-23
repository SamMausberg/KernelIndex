// Homepage and records-ledger reads (§16.5, §16.12). The memoized ledger is
// the shared backbone: the homepage, /records/data, the GPU/project
// surfaces, and badges all read the same in-process copy.
import { asc, eq, sql } from "drizzle-orm"
import type {
  HomePageModel,
  RecordEvent,
  RecordHolder,
  RecordsPageModel,
  ResultRow,
} from "../../lib/catalog-models.ts"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"
import { eligibleRunFilter } from "./record-events.ts"
import {
  implementationColumns,
  pageIllustrative,
  projectColumns,
  resultRow,
  runColumns,
  sourceColumns,
} from "./run-rows.ts"
import { eligibleServingRuns } from "./serving-reads.ts"

/** §16.5: the homepage feed leads with signal, not importer publish order —
 * the newest genuine record breaks (a run displacing a previous record),
 * then the newest first-of-cohort records, sole-entrant baselines excluded.
 * Reuses the memoized ledger read; only the stat counts hit new queries. */
export async function getHomePage(): Promise<HomePageModel> {
  const [page, [stats], [servingStats]] = await Promise.all([
    getRecordsPage(),
    db()
      .select({
        operations: sql<number>`count(distinct ${schema.workloads.operationId})::int`,
        runs: sql<number>`count(*)::int`,
        gpus: sql<number>`count(distinct ${schema.benchmarkRuns.hardwareModel})::int`,
        // Evidence distribution mirroring policy/trust.ts evidenceLevel;
        // verified folds in replicated — both mean "rerun independently".
        verified: sql<number>`count(*) filter (where ${schema.benchmarkRuns.independentReplicationCount} >= 2 or ${schema.benchmarkRuns.reproducedByKernelindex})::int`,
        reproducible: sql<number>`count(*) filter (where not (${schema.benchmarkRuns.independentReplicationCount} >= 2 or ${schema.benchmarkRuns.reproducedByKernelindex}) and ${schema.benchmarkRuns.sourceAvailable} and ${schema.benchmarkRuns.hasRawEvidence})::int`,
      })
      .from(schema.benchmarkRuns)
      .innerJoin(
        schema.workloads,
        eq(schema.benchmarkRuns.workloadId, schema.workloads.id),
      )
      .where(eligibleRunFilter()),
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.servingRuns)
      .where(eligibleServingRuns()),
  ])
  // Homepage lists default to source-backed records (2026-08-16 decision);
  // the ledger's source toggle reaches the rest.
  const holders = page.records.filter(
    (holder) => holder.current.sourceAvailable,
  )
  const latest = [
    ...holders.filter((holder) => holder.history.length >= 2),
    ...holders.filter(
      (holder) => holder.history.length === 1 && !holder.current.baseline,
    ),
  ]
    .slice(0, 8)
    // The homepage renders only the current event; drop the deep histories.
    .map((holder) => ({ ...holder, history: holder.history.slice(0, 1) }))
  return {
    illustrative: page.illustrative,
    latest,
    stats: {
      operations: stats.operations,
      runs: stats.runs,
      gpus: stats.gpus,
      servingRuns: servingStats?.n ?? 0,
      evidence: {
        verified: stats.verified,
        reproducible: stats.reproducible,
        reported: stats.runs - stats.verified - stats.reproducible,
      },
    },
  }
}

/**
 * §16.12: the records ledger reads the append-only record_events table
 * (§11.10). Events whose run has since lost eligibility (retraction,
 * supersession) drop out of the visible sequence; until the correction write
 * path ships, no retraction-cause events exist to display in their place.
 *
 * The full ledger outgrows the framework data cache's entry limit, so it
 * memoizes in-process instead — shared by every caller of this module
 * (records page and /records/data, the GPU/project surfaces, badges), which
 * previously each re-ran the unbounded query.
 */
const RECORDS_MEMO_MS = 60_000
let recordsMemo: { at: number; value: Promise<RecordsPageModel> } | null = null
export function getRecordsPage(): Promise<RecordsPageModel> {
  if (recordsMemo && Date.now() - recordsMemo.at < RECORDS_MEMO_MS) {
    return recordsMemo.value
  }
  const value = readRecordsPage()
  recordsMemo = { at: Date.now(), value }
  value.catch(() => {
    recordsMemo = null
  })
  return value
}

async function readRecordsPage(): Promise<RecordsPageModel> {
  const rows = await db()
    .select({
      event: {
        comparisonKey: schema.recordEvents.comparisonKey,
        at: schema.recordEvents.at,
      },
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
    .innerJoin(
      schema.sources,
      eq(schema.benchmarkRuns.sourceId, schema.sources.id),
    )
    .where(eligibleRunFilter())
    .orderBy(asc(schema.recordEvents.at), asc(schema.recordEvents.createdAt))

  const byCohort = new Map<string, typeof rows>()
  for (const row of rows) {
    const bucket = byCohort.get(row.event.comparisonKey)
    if (bucket) bucket.push(row)
    else byCohort.set(row.event.comparisonKey, [row])
  }

  const records: RecordHolder[] = []
  const holderRows: (typeof rows)[number][] = []
  for (const [cohortKey, cohortRows] of byCohort) {
    const events: RecordEvent[] = []
    let previous: (typeof rows)[number] | null = null
    let previousPrimary: ResultRow["primary"] = null
    let holderRow: ResultRow | null = null
    for (const row of cohortRows) {
      const operation = {
        name: row.operation.name,
        slug: row.operation.slug,
      }
      const current = resultRow(row, operation)
      events.unshift({
        at: row.event.at.toISOString(),
        runId: row.run.id,
        implementation: current.implementation,
        value: current.primary as RecordEvent["value"],
        previousValue: previousPrimary,
        improvementPct:
          previousPrimary && current.primary
            ? ((previousPrimary.value - current.primary.value) /
                previousPrimary.value) *
              100
            : null,
      })
      previous = row
      previousPrimary = current.primary
      holderRow = current
    }
    if (previous === null || holderRow === null) continue
    holderRows.push(previous)
    records.push({
      cohortKey,
      operation: holderRow.operation,
      workloadId: previous.workload.id,
      workloadSummary: holderRow.workloadSummary,
      hardware: previous.run.hardwareModel,
      environmentSummary: previous.run.environmentSummary ?? "",
      current: holderRow,
      since: events[0].at,
      // Eligible ⇒ published; observedAt only satisfies the nullable type.
      indexedAt: (
        previous.run.publishedAt ?? previous.run.observedAt
      ).toISOString(),
      history: events,
    })
  }

  // Newest indexed first (§16.5): a fresh import leads even when the source
  // stamped it with old observation dates. ISO-8601 strings order
  // lexicographically; plain comparison beats collation.
  records.sort((a, b) =>
    a.indexedAt < b.indexedAt ? 1 : a.indexedAt > b.indexedAt ? -1 : 0,
  )
  return {
    illustrative: pageIllustrative(holderRows),
    hardwareOptions: [...new Set(records.map((holder) => holder.hardware))],
    records,
  }
}
