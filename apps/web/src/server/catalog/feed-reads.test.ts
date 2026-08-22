// The feed (§13.11): day grouping is pure and newest-first; against the
// database, every derived entry carries the keys the following filter needs.
import { describe, expect, it } from "vitest"
import type { FeedEntry } from "../../lib/catalog-models.ts"
import { getFeed, groupByDay } from "./feed-reads.ts"

const claim = (at: string, slug: string): FeedEntry => ({
  kind: "claim",
  at,
  project: { name: slug, slug },
  by: "x",
  match: {
    cohort: null,
    operation: null,
    projects: [slug],
    gpu: null,
    models: [],
  },
})

describe("groupByDay", () => {
  it("groups newest first by UTC date, entries newest first inside a day", () => {
    const days = groupByDay([
      claim("2026-08-01T10:00:00.000Z", "a"),
      claim("2026-08-02T01:00:00.000Z", "b"),
      claim("2026-08-02T23:00:00.000Z", "c"),
    ])
    expect(days.map((day) => day.date)).toEqual(["2026-08-02", "2026-08-01"])
    expect(days[0].entries.map((entry) => entry.at.slice(11, 13))).toEqual([
      "23",
      "01",
    ])
  })
})

describe.skipIf(!process.env.DATABASE_URL)("getFeed (database)", () => {
  it("derives entries with match keys from the catalog", async () => {
    const feed = await getFeed()
    for (const day of feed.days) {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      for (const entry of day.entries) {
        expect(entry.at.slice(0, 10)).toBe(day.date)
        expect(Array.isArray(entry.match.projects)).toBe(true)
        if (entry.kind === "record") {
          expect(entry.match.cohort).toBe(entry.cohortKey)
          expect(entry.previous.value.value).toBeGreaterThan(0)
        }
      }
    }
  })
})
