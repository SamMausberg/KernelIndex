// The correction write path (§10.7): canonical rows are append-only after
// publication. A retraction marks evidence invalid without deleting it,
// records reason and actor, appends the record transition it causes, and
// leaves the URL resolving. Supersession links a corrected run to the run
// it replaces; ranked surfaces drop the original via the anti-join.
import { and, asc, eq, isNotNull } from "drizzle-orm"
import * as schema from "../db/schema.ts"
import { RANKING_POLICY_VERSION } from "../policy/ranking.ts"
import type { DbHandle } from "./publication.ts"
import { eligibleRunFilter } from "./record-events.ts"

export type CorrectionActor = { id: string; name: string }

async function audit(
  database: DbHandle,
  actor: CorrectionActor,
  action: string,
  targetId: string,
  reason: string,
  priorState: unknown,
) {
  await database.insert(schema.auditEvents).values({
    actor: `${actor.name} (${actor.id})`,
    action,
    targetKind: "run",
    targetId,
    reason,
    priorState,
  })
}

/** §10.7 steps 3–5: mark retracted, audit, append the caused transition. */
export async function retractRun(
  database: DbHandle,
  input: { runId: string; reason: string; actor: CorrectionActor },
): Promise<{ retracted: true; newLeaderRunId: string | null }> {
  return database.transaction(async (tx) => {
    const [run] = await tx
      .select({
        id: schema.benchmarkRuns.id,
        comparisonKey: schema.benchmarkRuns.comparisonKey,
        publishedAt: schema.benchmarkRuns.publishedAt,
        retractedAt: schema.benchmarkRuns.retractedAt,
      })
      .from(schema.benchmarkRuns)
      .where(eq(schema.benchmarkRuns.id, input.runId))
    if (!run || run.publishedAt === null)
      throw new Error(`run ${input.runId} is not a published run`)
    if (run.retractedAt !== null)
      throw new Error(`run ${input.runId} is already retracted`)

    await tx
      .update(schema.benchmarkRuns)
      .set({
        retractedAt: new Date(),
        retractionReason: { reason: input.reason, actor: input.actor.name },
      })
      .where(eq(schema.benchmarkRuns.id, run.id))
    await audit(tx, input.actor, "retract_run", run.id, input.reason, {
      comparisonKey: run.comparisonKey,
    })

    // The transition this retraction causes: the cohort's new leader (if the
    // retracted run was leading, someone inherits the record now).
    const [leader] = await tx
      .select({ id: schema.benchmarkRuns.id })
      .from(schema.benchmarkRuns)
      .where(
        and(
          eq(schema.benchmarkRuns.comparisonKey, run.comparisonKey),
          eligibleRunFilter(),
          isNotNull(schema.benchmarkRuns.primaryValue),
        ),
      )
      .orderBy(asc(schema.benchmarkRuns.primaryValue))
      .limit(1)
    if (leader && leader.id !== run.id) {
      await tx
        .insert(schema.recordEvents)
        .values({
          comparisonKey: run.comparisonKey,
          runId: leader.id,
          previousRunId: run.id,
          policyVersion: RANKING_POLICY_VERSION,
          cause: "retraction",
          at: new Date(),
        })
        .onConflictDoNothing()
    }
    return { retracted: true, newLeaderRunId: leader?.id ?? null }
  })
}

/** §10.7 step 2: link a published corrected run to the run it replaces. */
export async function markSuperseded(
  database: DbHandle,
  input: {
    originalRunId: string
    supersedingRunId: string
    reason: string
    actor: CorrectionActor
  },
): Promise<{ superseded: true }> {
  return database.transaction(async (tx) => {
    const [superseding] = await tx
      .select({
        id: schema.benchmarkRuns.id,
        supersedesId: schema.benchmarkRuns.supersedesId,
        publishedAt: schema.benchmarkRuns.publishedAt,
      })
      .from(schema.benchmarkRuns)
      .where(eq(schema.benchmarkRuns.id, input.supersedingRunId))
    if (!superseding || superseding.publishedAt === null)
      throw new Error(`run ${input.supersedingRunId} is not published`)
    if (superseding.supersedesId !== null)
      throw new Error(`run ${input.supersedingRunId} already supersedes a run`)
    const [original] = await tx
      .select({ id: schema.benchmarkRuns.id })
      .from(schema.benchmarkRuns)
      .where(eq(schema.benchmarkRuns.id, input.originalRunId))
    if (!original) throw new Error(`run ${input.originalRunId} not found`)

    await tx
      .update(schema.benchmarkRuns)
      .set({ supersedesId: original.id })
      .where(eq(schema.benchmarkRuns.id, superseding.id))
    await audit(tx, input.actor, "supersede_run", original.id, input.reason, {
      supersededBy: superseding.id,
    })
    return { superseded: true }
  })
}
