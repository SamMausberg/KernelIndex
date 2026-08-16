// Minimal first-party product events (§20.5): the few counters that answer
// §20.4's "does the resolver resolve?" — nothing else. No cookies, no user
// or session identity, no IP, no raw query text; facets are coarse flags.
// Recording is fire-and-forget and must never affect a request.
import { count, gte, sql } from "drizzle-orm"
import { db } from "./db/client.ts"
import * as schema from "./db/schema.ts"
import { env } from "./env.ts"

/** Server-recorded at render time (the pages are per-request dynamic). */
const SERVER_EVENTS = ["search_submitted", "serving_resolved"] as const
/** Client-beaconed: these pages are ISR/CDN-cached, so the server never
    sees the view; /e accepts exactly this list. */
export const BEACON_EVENTS = [
  "evidence_opened",
  "install_copied",
  "citation_copied",
] as const

type ProductEvent =
  | (typeof SERVER_EVENTS)[number]
  | (typeof BEACON_EVENTS)[number]

export type EventFacets = Record<string, string | number | boolean>

/** Inserts one event row; swallows every failure. Fixture-backed
 * deployments (previews, e2e) have no event store and no-op. */
export async function recordEvent(
  event: ProductEvent,
  facets?: EventFacets,
): Promise<void> {
  if (env.CATALOG_BACKEND !== "postgres") return
  try {
    await db()
      .insert(schema.productEvents)
      .values({ event, facets: facets ?? null })
  } catch {
    // Telemetry loss is acceptable; a failed page is not.
  }
}

export type EventSummary = {
  days: number
  counts: { event: string; total: number }[]
  /** §20.4 north star over recorded searches: parseable requests that
      returned at least one exact, evidence-backed row. */
  searches: { total: number; parseErrors: number; zero: number; exact: number }
}

/** Aggregates for the /admin metrics panel. */
export async function eventSummary(days: number): Promise<EventSummary> {
  const since = gte(
    schema.productEvents.at,
    sql`now() - make_interval(days => ${days})`,
  )
  const [counts, [searches]] = await Promise.all([
    db()
      .select({ event: schema.productEvents.event, total: count() })
      .from(schema.productEvents)
      .where(since)
      .groupBy(schema.productEvents.event)
      .orderBy(schema.productEvents.event),
    db()
      .select({
        total: count(),
        parseErrors: count(
          sql`case when facets->>'parseError' = 'true' then 1 end`,
        ),
        zero: count(sql`case when facets->>'zeroResult' = 'true' then 1 end`),
        exact: count(
          sql`case when facets->>'exactReturned' = 'true' then 1 end`,
        ),
      })
      .from(schema.productEvents)
      .where(sql`${since} and event = 'search_submitted'`),
  ])
  return {
    days,
    counts,
    searches: searches ?? { total: 0, parseErrors: 0, zero: 0, exact: 0 },
  }
}
