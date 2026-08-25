// Report intake (§15.6): validation, the per-target daily cap, and the
// open-only moderation transition. Throwaway target ids; rows cleaned up.
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { exampleBundle } from "./catalog/example-bundle.ts"
import { publishBundle } from "./catalog/publication.ts"
import { db } from "./db/client.ts"
import * as schema from "./db/schema.ts"
import { fileReport, resolveReport } from "./reports.ts"

const url = process.env.DATABASE_URL
let TARGET = crypto.randomUUID()

const valid = {
  targetKind: "run",
  targetId: TARGET,
  reason: "incorrect_result",
  detail: "measured value disagrees with the linked source",
  evidenceUrl: "",
  contact: "",
  userId: null,
}

describe.skipIf(!url)("reports (database)", () => {
  beforeAll(async () => {
    const publication = await publishBundle(db(), exampleBundle(), {
      publish: true,
    })
    TARGET = publication.runIds[0] as string
    valid.targetId = TARGET
  })

  afterAll(async () => {
    await db().delete(schema.reports).where(eq(schema.reports.targetId, TARGET))
  })

  it("rejects malformed input without writing", async () => {
    expect(await fileReport({ ...valid, targetKind: "user" })).toMatch(/kind/)
    expect(await fileReport({ ...valid, reason: "vibes" })).toMatch(/reason/)
    expect(await fileReport({ ...valid, detail: "  " })).toMatch(/describe/)
    expect(
      await fileReport({ ...valid, targetId: crypto.randomUUID() }),
    ).toMatch(/unknown report target/)
    expect(await fileReport({ ...valid, evidenceUrl: "ftp://x" })).toMatch(
      /http/,
    )
    expect(
      await fileReport({
        ...valid,
        evidenceUrl: `https://x/${"a".repeat(2000)}`,
      }),
    ).toMatch(/limited/)
    expect(
      await db()
        .select()
        .from(schema.reports)
        .where(eq(schema.reports.targetId, TARGET)),
    ).toHaveLength(0)
  })

  it("files, enforces the per-target daily cap, and resolves once", async () => {
    for (let filed = 0; filed < 20; filed++)
      expect(await fileReport(valid)).toBeNull()
    expect(await fileReport(valid)).toMatch(/daily report limit/)

    const [report] = await db()
      .select()
      .from(schema.reports)
      .where(eq(schema.reports.targetId, TARGET))
      .limit(1)
    expect(report?.state).toBe("open")
    expect(
      await resolveReport(report?.id ?? "", "dismissed", "dup", "test"),
    ).toBe(true)
    // Already moved: the transition is open-only.
    expect(
      await resolveReport(report?.id ?? "", "resolved", "again", "test"),
    ).toBe(false)
  })
})
