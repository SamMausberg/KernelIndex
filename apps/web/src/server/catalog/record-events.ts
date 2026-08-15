// Record history (§11.10): whenever derived ranking can change, the record
// transitions per comparison cohort are appended to record_events. Events are
// derived from eligible append-only runs — the running minimum of the primary
// metric in observation order — so re-running the sync after any publication
// is idempotent. Nothing is ever rewritten; a retraction or supersession
// changes eligibility and later syncs append from the corrected sequence.
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm"
import * as schema from "../db/schema.ts"
import { RANKING_POLICY_VERSION } from "../policy/ranking.ts"
import type { DbHandle } from "./publication.ts"

/**
 * A run is visible in ranked surfaces only while no published run supersedes
 * it (§10.7). The corrected run carries `supersedes_id`; the superseded
 * original drops out.
 */
export const notSupersededFilter = sql`not exists (
  select 1 from ${schema.benchmarkRuns} as superseding
  where superseding.supersedes_id = ${schema.benchmarkRuns.id}
    and superseding.published_at is not null
)`

/** Shared SQL eligibility for ranked surfaces (§11.4 steps 1–2, 7–8). */
export function eligibleRunFilter() {
  return and(
    eq(schema.benchmarkRuns.status, "passed"),
    isNotNull(schema.benchmarkRuns.publishedAt),
    isNull(schema.benchmarkRuns.retractedAt),
    notSupersededFilter,
  )
}

/**
 * Append missing record events for the given cohorts (all cohorts when
 * omitted). Returns the number of appended events.
 */
export async function syncRecordEvents(
  database: DbHandle,
  comparisonKeys?: string[],
): Promise<number> {
  if (comparisonKeys !== undefined && comparisonKeys.length === 0) return 0
  const runs = await database
    .select({
      id: schema.benchmarkRuns.id,
      comparisonKey: schema.benchmarkRuns.comparisonKey,
      primaryValue: schema.benchmarkRuns.primaryValue,
      observedAt: schema.benchmarkRuns.observedAt,
    })
    .from(schema.benchmarkRuns)
    .where(
      and(
        eligibleRunFilter(),
        isNotNull(schema.benchmarkRuns.primaryValue),
        comparisonKeys
          ? inArray(schema.benchmarkRuns.comparisonKey, comparisonKeys)
          : undefined,
      ),
    )
    .orderBy(asc(schema.benchmarkRuns.observedAt), asc(schema.benchmarkRuns.id))

  const byCohort = new Map<string, typeof runs>()
  for (const run of runs) {
    const bucket = byCohort.get(run.comparisonKey)
    if (bucket) bucket.push(run)
    else byCohort.set(run.comparisonKey, [run])
  }

  const events: (typeof schema.recordEvents.$inferInsert)[] = []
  for (const [comparisonKey, cohortRuns] of byCohort) {
    let best: (typeof runs)[number] | null = null
    for (const run of cohortRuns) {
      const value = run.primaryValue as number
      if (best !== null && value >= (best.primaryValue as number)) continue
      events.push({
        comparisonKey,
        runId: run.id,
        previousRunId: best?.id ?? null,
        policyVersion: RANKING_POLICY_VERSION,
        cause: "new_run",
        at: run.observedAt,
      })
      best = run
    }
  }
  if (events.length === 0) return 0
  const inserted = await database
    .insert(schema.recordEvents)
    .values(events)
    .onConflictDoNothing()
    .returning({ id: schema.recordEvents.id })
  return inserted.length
}
