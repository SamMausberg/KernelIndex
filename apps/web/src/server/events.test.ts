// §20.5 events: the aggregation the /admin panel reads, and recordEvent's
// contract (never throws; a no-op outside the postgres backend).
import { sql } from "drizzle-orm"
import { afterAll, describe, expect, it } from "vitest"
import { db } from "./db/client.ts"
import * as schema from "./db/schema.ts"
import { eventSummary, recordEvent } from "./events.ts"

const url = process.env.DATABASE_URL
const MARKER = `events-test-${process.pid}`
const marked = sql`facets->>'marker' = ${MARKER}`

describe.skipIf(!url)("product events (database)", () => {
  afterAll(async () => {
    await db().delete(schema.productEvents).where(marked)
  })

  it("recordEvent resolves regardless of backend", async () => {
    await expect(
      recordEvent("search_submitted", { marker: MARKER }),
    ).resolves.toBeUndefined()
  })

  it("eventSummary aggregates the search facets", async () => {
    const before = await eventSummary(1)
    await db()
      .insert(schema.productEvents)
      .values([
        {
          event: "search_submitted",
          facets: { marker: MARKER, exactReturned: true, zeroResult: false },
        },
        {
          event: "search_submitted",
          facets: { marker: MARKER, parseError: true },
        },
        { event: "evidence_opened", facets: { marker: MARKER, kind: "run" } },
      ])
    const after = await eventSummary(1)
    expect(after.searches.total).toBe(before.searches.total + 2)
    expect(after.searches.parseErrors).toBe(before.searches.parseErrors + 1)
    expect(after.searches.exact).toBe(before.searches.exact + 1)
    const opened = (summary: typeof after) =>
      summary.counts.find((row) => row.event === "evidence_opened")?.total ?? 0
    expect(opened(after)).toBe(opened(before) + 1)
  })
})
