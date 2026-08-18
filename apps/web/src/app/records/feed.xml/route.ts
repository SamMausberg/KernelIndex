// Atom feed of record changes (Week 12): subscribe to record-beaten and
// retraction-reassignment events without an account. Reads the same
// record_events ledger as /records; CDN-cached like the JSON routes.
// Fixture-backed deployments serve an empty feed rather than fake history.
import { desc, eq, sql } from "drizzle-orm"
import { env } from "@/server/env"

export type FeedEntry = {
  at: Date
  cause: string
  runId: string
  operation: { name: string; slug: string }
  implementation: string
  value: number | null
  unit: string | null
}

const escapeXml = (text: string) =>
  text.replace(/[<>&'"]/g, (char) => `&#${char.charCodeAt(0)};`)

/** Pure Atom construction, unit-tested apart from the database read. */
export function atomFeed(entries: FeedEntry[], origin: string): string {
  const updated = entries[0]?.at ?? new Date(0)
  const items = entries.map((entry) => {
    const verb =
      entry.cause === "retraction" ? "record reassigned to" : "record taken by"
    const title = `${entry.operation.name}: ${verb} ${entry.implementation}`
    const measured =
      entry.value !== null ? ` at ${entry.value} ${entry.unit ?? ""}` : ""
    return `  <entry>
    <id>tag:kernelindex.com,2026:record/${entry.runId}/${entry.cause}</id>
    <title>${escapeXml(title)}</title>
    <link href="${origin}/runs/${entry.runId}"/>
    <updated>${entry.at.toISOString()}</updated>
    <summary>${escapeXml(`${title}${measured}. Cohort details and evidence on the run page.`)}</summary>
  </entry>`
  })
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>KernelIndex record changes</title>
  <id>tag:kernelindex.com,2026:records</id>
  <author><name>KernelIndex</name></author>
  <link href="${origin}/records"/>
  <link rel="self" href="${origin}/records/feed.xml"/>
  <updated>${updated.toISOString()}</updated>
${items.join("\n")}
</feed>
`
}

async function latestRecordEvents(): Promise<FeedEntry[]> {
  const { db } = await import("@/server/db/client")
  const schema = await import("@/server/db/schema")
  return db()
    .select({
      at: schema.recordEvents.at,
      cause: schema.recordEvents.cause,
      runId: schema.recordEvents.runId,
      operation: { name: schema.operations.name, slug: schema.operations.slug },
      implementation: sql<string>`coalesce(${schema.implementations.title}, ${schema.implementations.slug})`,
      value: schema.benchmarkRuns.primaryValue,
      unit: schema.benchmarkRuns.primaryUnit,
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
      schema.workloads,
      eq(schema.benchmarkRuns.workloadId, schema.workloads.id),
    )
    .innerJoin(
      schema.operations,
      eq(schema.workloads.operationId, schema.operations.id),
    )
    .orderBy(desc(schema.recordEvents.at))
    .limit(50)
}

export async function GET(): Promise<Response> {
  const entries =
    env.CATALOG_BACKEND === "postgres" ? await latestRecordEvents() : []
  return new Response(
    atomFeed(entries, env.SITE_ORIGIN ?? "https://kernelindex.com"),
    {
      headers: {
        "Content-Type": "application/atom+xml; charset=utf-8",
        "Cache-Control":
          "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
      },
    },
  )
}
