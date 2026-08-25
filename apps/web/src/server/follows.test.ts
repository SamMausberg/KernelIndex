// Follows (§13.11): the pure match over feed entries, and toggle/feed/
// watermark semantics against the database. Throwaway user; cascade delete
// cleans up.
import { eq } from "drizzle-orm"
import { afterAll, describe, expect, it } from "vitest"
import type { FeedEntry, FeedModel } from "../lib/catalog-models.ts"
import { db } from "./db/client.ts"
import * as schema from "./db/schema.ts"
import {
  followingFeed,
  listFollows,
  markSeen,
  matchesFollows,
  toggleFollow,
} from "./follows.ts"

const entry: FeedEntry = {
  kind: "claim",
  at: "2026-08-20T00:00:00.000Z",
  project: { name: "Liger", slug: "liger-kernel" },
  by: "someone",
  match: {
    cohort: "sha256:abc",
    operation: "rmsnorm",
    projects: ["liger-kernel"],
    gpu: "NVIDIA H100",
    models: ["llama-3"],
  },
}
const feed: FeedModel = {
  illustrative: true,
  days: [{ date: "2026-08-20", entries: [entry] }],
}

describe("matchesFollows", () => {
  it("matches on any followed key and nothing else", () => {
    const ref = { label: "", href: "" }
    expect(
      matchesFollows(entry, [{ ...ref, kind: "cohort", key: "sha256:abc" }]),
    ).toBe(true)
    expect(
      matchesFollows(entry, [{ ...ref, kind: "model", key: "llama-3" }]),
    ).toBe(true)
    expect(
      matchesFollows(entry, [{ ...ref, kind: "gpu", key: "NVIDIA B200" }]),
    ).toBe(false)
    expect(matchesFollows(entry, [])).toBe(false)
  })
})

const url = process.env.DATABASE_URL
const USER = `follow-test-${process.pid}`

describe.skipIf(!url)("follows (database)", () => {
  afterAll(async () => {
    await db().delete(schema.users).where(eq(schema.users.id, USER))
  })

  it("toggles, narrows the feed, and explicitly advances the watermark", async () => {
    await db()
      .insert(schema.users)
      .values({ id: USER, name: "follower", email: `${USER}@test.invalid` })
      .onConflictDoNothing()
    const follow = {
      kind: "project" as const,
      key: "liger-kernel",
      label: "Liger",
      href: "/projects/liger-kernel",
    }
    expect(await toggleFollow(USER, follow)).toBe(true)
    expect(await listFollows(USER)).toEqual([follow])

    const first = await followingFeed(USER, feed)
    expect(first.seenAt).toBeNull()
    expect(first.feed.days[0]?.entries).toHaveLength(1)
    expect((await followingFeed(USER, feed)).seenAt).toBeNull()
    await markSeen(USER, new Date(first.seenThrough))
    const second = await followingFeed(USER, feed)
    expect(second.seenAt).not.toBeNull()
    expect((second.seenAt as string) > entry.at).toBe(true)

    expect(await toggleFollow(USER, follow)).toBe(false)
    expect((await followingFeed(USER, feed)).feed.days).toHaveLength(0)
  })
})
