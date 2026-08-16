// Watches (§13.11): toggle semantics and the derived-on-read feed against
// the watermark. Throwaway user; cascade delete cleans up.
import { desc, eq } from "drizzle-orm"
import { afterAll, describe, expect, it } from "vitest"
import { db } from "./db/client.ts"
import * as schema from "./db/schema.ts"
import { markSeen, toggleWatch, watchFeed } from "./watches.ts"

const url = process.env.DATABASE_URL
const USER = `watch-test-${process.pid}`

describe.skipIf(!url)("watches (database)", () => {
  afterAll(async () => {
    await db().delete(schema.users).where(eq(schema.users.id, USER))
  })

  it("toggles, feeds unseen record events, and respects the watermark", async () => {
    await db()
      .insert(schema.users)
      .values({ id: USER, name: "watcher", email: `${USER}@test.invalid` })
      .onConflictDoNothing()
    // Watch the cohort of the newest real record event in the catalog.
    const [event] = await db()
      .select({ comparisonKey: schema.recordEvents.comparisonKey })
      .from(schema.recordEvents)
      .orderBy(desc(schema.recordEvents.at))
      .limit(1)
    if (!event) return // empty catalog: nothing to assert against

    expect(await toggleWatch(USER, event.comparisonKey)).toBe(true)
    // The watch starts at now; a backdated watermark exposes the history.
    await db()
      .insert(schema.watchMarks)
      .values({ userId: USER, seenAt: new Date(0) })
      .onConflictDoUpdate({
        target: schema.watchMarks.userId,
        set: { seenAt: new Date(0) },
      })
    const feed = await watchFeed(USER)
    expect(feed.records.length).toBeGreaterThan(0)
    expect(feed.records[0].operation.slug).toBeTruthy()
    expect(feed.watched).toHaveLength(1)

    await markSeen(USER)
    const caughtUp = await watchFeed(USER)
    expect(caughtUp.records).toHaveLength(0)
    expect(caughtUp.watched).toHaveLength(1)

    expect(await toggleWatch(USER, event.comparisonKey)).toBe(false)
    expect((await watchFeed(USER)).watched).toHaveLength(0)
  })
})
