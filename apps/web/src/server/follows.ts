// Follows (§13.11): a signed-in reader follows comparison cohorts,
// operations, projects, GPUs, and model tags; the feed filters itself by
// those keys on read, and one seen-watermark per user marks what is new. No
// notifications table, no email, no fan-out jobs.
import { and, desc, eq } from "drizzle-orm"
import type { FeedEntry, FeedModel } from "../lib/catalog-models.ts"
import { db } from "./db/client.ts"
import * as schema from "./db/schema.ts"

export const FOLLOW_KINDS = [
  "cohort",
  "operation",
  "project",
  "gpu",
  "model",
] as const
export type FollowKind = (typeof FOLLOW_KINDS)[number]
export const isFollowKind = (value: string): value is FollowKind =>
  FOLLOW_KINDS.some((kind) => kind === value)

/** One followed entity as the account page lists it: the key the feed
 * matches on, and the label and page it was followed from. */
export type FollowRef = {
  kind: FollowKind
  key: string
  label: string
  href: string
}

/** Returns true when the entity is now followed, false when unfollowed. */
export async function toggleFollow(
  userId: string,
  follow: FollowRef,
): Promise<boolean> {
  const removed = await db()
    .delete(schema.follows)
    .where(
      and(
        eq(schema.follows.userId, userId),
        eq(schema.follows.kind, follow.kind),
        eq(schema.follows.key, follow.key),
      ),
    )
    .returning({ key: schema.follows.key })
  if (removed.length > 0) return false
  await db()
    .insert(schema.follows)
    .values({ userId, ...follow })
  return true
}

export async function listFollows(userId: string): Promise<FollowRef[]> {
  const rows = await db()
    .select({
      kind: schema.follows.kind,
      key: schema.follows.key,
      label: schema.follows.label,
      href: schema.follows.href,
    })
    .from(schema.follows)
    .where(eq(schema.follows.userId, userId))
    .orderBy(desc(schema.follows.createdAt))
  return rows.filter((row): row is FollowRef => isFollowKind(row.kind))
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

/** Does an entry concern anything in the follow set? Pure: the feed read
 * stamps every entry with its match keys. */
export function matchesFollows(
  entry: FeedEntry,
  follows: FollowRef[],
): boolean {
  const { match } = entry
  return follows.some(
    (follow) =>
      (follow.kind === "cohort" && match.cohort === follow.key) ||
      (follow.kind === "operation" && match.operation === follow.key) ||
      (follow.kind === "project" && match.projects.includes(follow.key)) ||
      (follow.kind === "gpu" && match.gpu === follow.key) ||
      (follow.kind === "model" && match.models.includes(follow.key)),
  )
}

export type FollowingFeed = {
  feed: FeedModel
  /** The watermark before this read; entries newer than it are new. */
  seenAt: string | null
  follows: FollowRef[]
}

/** The public feed narrowed to the user's follows. Reading it is seeing
 * it: the watermark advances after the previous one is captured. */
export async function followingFeed(
  userId: string,
  feed: FeedModel,
): Promise<FollowingFeed> {
  const [follows, [mark]] = await Promise.all([
    listFollows(userId),
    db()
      .select({ seenAt: schema.watchMarks.seenAt })
      .from(schema.watchMarks)
      .where(eq(schema.watchMarks.userId, userId)),
  ])
  const days = feed.days
    .map((day) => ({
      ...day,
      entries: day.entries.filter((entry) => matchesFollows(entry, follows)),
    }))
    .filter((day) => day.entries.length > 0)
  await markSeen(userId)
  return {
    feed: { ...feed, days },
    seenAt: mark?.seenAt.toISOString() ?? null,
    follows,
  }
}
