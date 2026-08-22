// Attestations (§16.10): validation, the per-user daily cap, published
// reads and counts, and the one-way hide. Throwaway user; rows cleaned up.
import { desc, eq } from "drizzle-orm"
import { afterAll, describe, expect, it } from "vitest"
import {
  attestationCounts,
  attestationsFor,
  fileAttestation,
  hideAttestation,
} from "./attestations.ts"
import { db } from "./db/client.ts"
import * as schema from "./db/schema.ts"

const url = process.env.DATABASE_URL
const USER = `attest-test-${process.pid}`

describe.skipIf(!url)("attestations (database)", () => {
  afterAll(async () => {
    await db()
      .delete(schema.attestations)
      .where(eq(schema.attestations.userId, USER))
    await db().delete(schema.users).where(eq(schema.users.id, USER))
  })

  it("validates, files, counts, caps, and hides", async () => {
    await db()
      .insert(schema.users)
      .values({ id: USER, name: "attester", email: `${USER}@test.invalid` })
      .onConflictDoNothing()
    const [run] = await db()
      .select({ id: schema.benchmarkRuns.id })
      .from(schema.benchmarkRuns)
      .orderBy(desc(schema.benchmarkRuns.publishedAt))
      .limit(1)
    if (!run) return // empty catalog: nothing to attest to
    const valid = {
      runId: run.id,
      type: "reproduced",
      body: "same number on my H100",
      evidenceUrl: "",
      observedNs: 8140,
      environmentSummary: "H100 SXM",
      user: { id: USER, name: "attester" },
    }
    expect(await fileAttestation({ ...valid, type: "vibes" })).toMatch(/type/)
    expect(await fileAttestation({ ...valid, body: " " })).toMatch(/observed/)
    expect(
      await fileAttestation({ ...valid, evidenceUrl: "http://x" }),
    ).toMatch(/HTTPS/)
    expect(await fileAttestation({ ...valid, observedNs: -1 })).toMatch(
      /positive/,
    )
    expect(
      await fileAttestation({ ...valid, runId: crypto.randomUUID() }),
    ).toMatch(/no such run/)

    expect(await fileAttestation(valid)).toBeNull()
    const rows = await attestationsFor(run.id)
    const mine = rows.filter((row) => row.author === "attester")
    expect(mine).toHaveLength(1)
    expect(mine[0].observedNs).toBe(8140)
    expect((await attestationCounts([run.id])).get(run.id)).toBeGreaterThan(0)

    for (let filed = 1; filed < 20; filed++)
      expect(await fileAttestation(valid)).toBeNull()
    expect(await fileAttestation(valid)).toMatch(/limit/)

    expect(await hideAttestation(mine[0].id, "test", "tester")).toBe(true)
    expect(await hideAttestation(mine[0].id, "test", "tester")).toBe(false)
    expect(
      (await attestationsFor(run.id)).some((row) => row.id === mine[0].id),
    ).toBe(false)
  })
})
