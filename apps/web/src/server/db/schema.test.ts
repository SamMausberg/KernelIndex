// Integration tests for the §10.5 constraints, run against a real migrated
// PostgreSQL when DATABASE_URL is set (local compose database or the CI
// service container). Every test rolls back; nothing persists.
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import * as schema from "./schema.ts"

const url = process.env.DATABASE_URL
const digest = (fill: string) => `sha256:${fill.repeat(64).slice(0, 64)}`

class Rollback extends Error {}

type Tx = Parameters<
  Parameters<PostgresJsDatabase<typeof schema>["transaction"]>[0]
>[0]

/** Seed the minimal foreign-key chain a benchmark run needs. */
async function seedChain(tx: Tx) {
  const [source] = await tx
    .insert(schema.sources)
    .values({ slug: "test-source", kind: "test", name: "Test source" })
    .returning()
  const [operation] = await tx
    .insert(schema.operations)
    .values({
      slug: "test-op",
      family: "test",
      name: "Test op",
      schemaVersion: "v1alpha1",
      semanticDigest: digest("a"),
      manifest: {},
    })
    .returning()
  const [project] = await tx
    .insert(schema.projects)
    .values({
      slug: "test-project",
      name: "Test",
      normalizedName: "test",
      manifest: {},
    })
    .returning()
  const [workload] = await tx
    .insert(schema.workloads)
    .values({
      operationId: operation.id,
      workloadDigest: digest("b"),
      schemaVersion: "v1alpha1",
      manifest: {},
      shapeSummary: "[8]",
      dtypes: ["bf16"],
      layoutKeys: ["row_major"],
    })
    .returning()
  const [implementation] = await tx
    .insert(schema.implementations)
    .values({
      projectId: project.id,
      operationId: operation.id,
      slug: "test-impl",
      implementationDigest: digest("c"),
      language: "triton",
      targetArchitectures: ["sm_100"],
      sourceAvailable: true,
      installable: true,
      manifest: {},
    })
    .returning()
  return { source, operation, project, workload, implementation }
}

function runValues(
  chain: Awaited<ReturnType<typeof seedChain>>,
  overrides = {},
) {
  return {
    runDigest: digest("d"),
    implementationId: chain.implementation.id,
    workloadId: chain.workload.id,
    sourceId: chain.source.id,
    status: "passed",
    observedAt: new Date("2026-08-01T12:00:00Z"),
    hardwareVendor: "nvidia",
    hardwareModel: "NVIDIA B200 SXM",
    hardwareArchitecture: "sm_100",
    protocolKey: digest("e"),
    environmentKey: digest("f"),
    correctnessKey: digest("0"),
    comparisonKey: digest("1"),
    primaryMetric: "latency",
    primaryValue: 8120,
    primaryUnit: "ns",
    reported: true,
    sourceAvailable: true,
    installable: true,
    manifest: {},
    ...overrides,
  }
}

describe.skipIf(!url)("catalog schema constraints", () => {
  let client: postgres.Sql
  let db: PostgresJsDatabase<typeof schema>

  beforeAll(() => {
    client = postgres(url as string, { max: 1 })
    db = drizzle(client, { schema })
  })
  afterAll(async () => {
    await client.end()
  })

  async function inRollback(fn: (tx: Tx) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        await fn(tx)
        throw new Rollback("rollback")
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error
      })
  }

  /** Drizzle wraps driver errors; the constraint name lives in the cause chain. */
  async function expectConstraint(
    pattern: RegExp,
    fn: (tx: Tx) => Promise<void>,
  ) {
    let messages = ""
    try {
      await inRollback(fn)
    } catch (error) {
      let current: unknown = error
      while (current instanceof Error) {
        messages += `\n${current.message}`
        current = current.cause
      }
    }
    expect(messages).toMatch(pattern)
  }

  it("rejects malformed digests", async () => {
    await expectConstraint(/digest_format/, async (tx) => {
      await tx.insert(schema.operations).values({
        slug: "bad-digest-op",
        family: "test",
        name: "Bad",
        schemaVersion: "v1alpha1",
        semanticDigest: "sha256:not-hex",
        manifest: {},
      })
    })
  })

  it("rejects NaN and negative primary values", async () => {
    await expectConstraint(/primary_value_valid/, async (tx) => {
      const chain = await seedChain(tx)
      await tx
        .insert(schema.benchmarkRuns)
        .values(runValues(chain, { primaryValue: -1 }))
    })
  })

  it("accepts a complete run and enforces unique run digests", async () => {
    await expectConstraint(/benchmark_runs_digest_unique/, async (tx) => {
      const chain = await seedChain(tx)
      await tx.insert(schema.benchmarkRuns).values(runValues(chain))
      await tx.insert(schema.benchmarkRuns).values(runValues(chain))
    })
  })

  it("enforces unique source identity (source, entity kind, external id)", async () => {
    await expectConstraint(/source_links_identity_unique/, async (tx) => {
      const chain = await seedChain(tx)
      const link = {
        sourceId: chain.source.id,
        entityKind: "operation",
        entityId: chain.operation.id,
        externalId: "ext-1",
      }
      await tx.insert(schema.sourceLinks).values(link)
      await tx.insert(schema.sourceLinks).values(link)
    })
  })

  it("rolls back cleanly (fixture rows never persist)", async () => {
    await inRollback(async (tx) => {
      await seedChain(tx)
    })
    const rows = await db.select().from(schema.sources)
    expect(rows.filter((row) => row.slug === "test-source")).toHaveLength(0)
  })
})
