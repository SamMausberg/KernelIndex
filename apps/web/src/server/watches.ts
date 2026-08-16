// In-product notifications (§13.11, Week 8 scope): watch a comparison
// cohort, then read "what changed" on /account. The feed derives on read
// from record_events and the user's own submission transitions against one
// seen-watermark — no notifications table, no email, no fan-out jobs.
import { and, desc, eq, gt, sql } from "drizzle-orm"
import { db } from "./db/client.ts"
import * as schema from "./db/schema.ts"

/** Returns true when the cohort is now watched, false when unwatched. */
export async function toggleWatch(
  userId: string,
  comparisonKey: string,
): Promise<boolean> {
  const removed = await db()
    .delete(schema.watches)
    .where(
      and(
        eq(schema.watches.userId, userId),
        eq(schema.watches.comparisonKey, comparisonKey),
      ),
    )
    .returning({ key: schema.watches.comparisonKey })
  if (removed.length > 0) return false
  await db().insert(schema.watches).values({ userId, comparisonKey })
  return true
}

export async function isWatching(
  userId: string,
  comparisonKey: string,
): Promise<boolean> {
  const [row] = await db()
    .select({ key: schema.watches.comparisonKey })
    .from(schema.watches)
    .where(
      and(
        eq(schema.watches.userId, userId),
        eq(schema.watches.comparisonKey, comparisonKey),
      ),
    )
  return row !== undefined
}

export async function markSeen(userId: string): Promise<void> {
  await db()
    .insert(schema.watchMarks)
    .values({ userId, seenAt: new Date() })
    .onConflictDoUpdate({
      target: schema.watchMarks.userId,
      set: { seenAt: new Date() },
    })
}

export type WatchFeed = {
  records: {
    at: string
    cause: string
    runId: string
    operation: { name: string; slug: string }
    implementation: string
    value: number | null
    unit: string | null
  }[]
  submissions: { id: string; state: string; at: string }[]
  watched: { comparisonKey: string; operation: string; slug: string }[]
}

/** Everything newer than the user's watermark (or the watch itself). */
export async function watchFeed(userId: string): Promise<WatchFeed> {
  const newerThan = sql`coalesce(
    (select seen_at from watch_marks where user_id = ${userId}),
    ${schema.watches.createdAt})`

  const [records, changed, watched] = await Promise.all([
    db()
      .select({
        at: schema.recordEvents.at,
        cause: schema.recordEvents.cause,
        runId: schema.recordEvents.runId,
        operation: {
          name: schema.operations.name,
          slug: schema.operations.slug,
        },
        implementation: schema.implementations.title,
        value: schema.benchmarkRuns.primaryValue,
        unit: schema.benchmarkRuns.primaryUnit,
      })
      .from(schema.watches)
      .innerJoin(
        schema.recordEvents,
        eq(schema.recordEvents.comparisonKey, schema.watches.comparisonKey),
      )
      .innerJoin(
        schema.benchmarkRuns,
        eq(schema.recordEvents.runId, schema.benchmarkRuns.id),
      )
      .innerJoin(
        schema.implementations,
        eq(schema.benchmarkRuns.implementationId, schema.implementations.id),
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
          eq(schema.watches.userId, userId),
          gt(schema.recordEvents.at, newerThan),
        ),
      )
      .orderBy(desc(schema.recordEvents.at))
      .limit(50),
    db()
      .select({
        id: schema.submissions.id,
        state: schema.submissions.state,
        at: schema.submissions.updatedAt,
      })
      .from(schema.submissions)
      .where(
        and(
          eq(schema.submissions.userId, userId),
          sql`${schema.submissions.state} <> 'draft'`,
          gt(
            schema.submissions.updatedAt,
            sql`coalesce((select seen_at from watch_marks where user_id = ${userId}), ${schema.submissions.createdAt})`,
          ),
        ),
      )
      .orderBy(desc(schema.submissions.updatedAt))
      .limit(20),
    db()
      .select({
        comparisonKey: schema.watches.comparisonKey,
        operation: sql<string>`coalesce(min(${schema.operations.name}), 'unknown cohort')`,
        slug: sql<string>`coalesce(min(${schema.operations.slug}), '')`,
      })
      .from(schema.watches)
      .leftJoin(
        schema.benchmarkRuns,
        eq(schema.benchmarkRuns.comparisonKey, schema.watches.comparisonKey),
      )
      .leftJoin(
        schema.workloads,
        eq(schema.benchmarkRuns.workloadId, schema.workloads.id),
      )
      .leftJoin(
        schema.operations,
        eq(schema.workloads.operationId, schema.operations.id),
      )
      .where(eq(schema.watches.userId, userId))
      .groupBy(schema.watches.comparisonKey),
  ])

  return {
    records: records.map((row) => ({
      ...row,
      at: row.at.toISOString(),
      implementation: row.implementation ?? "unknown implementation",
    })),
    submissions: changed.map((row) => ({ ...row, at: row.at.toISOString() })),
    watched,
  }
}
