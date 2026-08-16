// Correction write path (§10.7): retraction preserves the row, records the
// actor, appends the caused record transition, and removes the run from
// eligibility — all inside a rolled-back transaction against the dev DB.
import { readFileSync } from "node:fs"
import path from "node:path"
import { and, eq, inArray } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"
import type { GmImportData } from "../import/gpumode/discover.ts"
import { parseSubmissionRows } from "../import/gpumode/parse.ts"
import { CURATED_PROBLEMS } from "../import/gpumode/problems.ts"
import { reconcileKernelbot } from "../import/gpumode/reconcile.ts"
import type { GmCandidate, GmSubmissionRow } from "../import/gpumode/types.ts"
import { retractRun } from "./corrections.ts"
import { publishBundle } from "./publication.ts"
import { eligibleRunFilter } from "./record-events.ts"

const fixtures = path.resolve(
  import.meta.dirname,
  "../import/gpumode/__fixtures__",
)
const fp8 = CURATED_PROBLEMS.find((p) => p.leaderboard === "amd-fp8-mm")
if (!fp8) throw new Error("fp8 curation missing")

const candidateOf = (row: GmSubmissionRow): GmCandidate => ({
  submissionId: row.submission_id,
  userId: String(row.user_id),
  submissionTime: row.submission_time,
  fileName: row.file_name ?? null,
  score: row.run_score as number,
  code: null,
  runner: "MI300",
  raw: row,
})

const url = process.env.DATABASE_URL

describe.skipIf(!url)("corrections (database)", () => {
  class Rollback extends Error {}

  it("retracts a run, audits it, and appends the caused transition", async () => {
    const rows = parseSubmissionRows(
      readFileSync(path.join(fixtures, "api/fp8-mm-top.json"), "utf8"),
      "fx",
    ).values
    // The transition only exists when another eligible run remains in the
    // retracted run's cohort, so the test must publish that rival itself
    // (each fixture row lands in its own workload cohort on a fresh
    // database). A clone with a distinct submission and user shares row
    // zero's workload and therefore its cohort.
    const rival: GmSubmissionRow = {
      ...rows[0],
      submission_id: (rows[0].submission_id as number) + 1_000_000,
      user_id: 999_999_999,
      run_score: (rows[0].run_score as number) * 1.01,
    }
    const data: GmImportData = {
      boards: [
        {
          problem: fp8,
          cohorts: new Map([
            ["MI300", [rows[0], rival, ...rows.slice(1)].map(candidateOf)],
          ]),
          histories: new Map(),
        },
      ],
      snapshots: [],
      issues: [],
      driftWarnings: [],
    }
    await db()
      .transaction(async (tx) => {
        const { bundle } = await reconcileKernelbot(tx, data, {
          topPerBoard: 6,
          authors: 0,
          maxPerAuthor: 0,
        })
        const published = await publishBundle(tx, bundle, { publish: true })
        // Retract a run from a cohort with at least two published test runs.
        const cohorts = await tx
          .select({
            id: schema.benchmarkRuns.id,
            comparisonKey: schema.benchmarkRuns.comparisonKey,
          })
          .from(schema.benchmarkRuns)
          .where(inArray(schema.benchmarkRuns.id, published.runIds))
        const shared = cohorts.find(
          (run) =>
            cohorts.filter((other) => other.comparisonKey === run.comparisonKey)
              .length >= 2,
        )
        if (!shared) throw new Error("expected a shared cohort in the bundle")
        const runId = shared.id
        const before = { comparisonKey: shared.comparisonKey }

        const result = await retractRun(tx, {
          runId,
          reason: "test retraction",
          actor: { id: "u1", name: "tester" },
        })
        expect(result.retracted).toBe(true)

        const [after] = await tx
          .select({
            retractedAt: schema.benchmarkRuns.retractedAt,
            retractionReason: schema.benchmarkRuns.retractionReason,
          })
          .from(schema.benchmarkRuns)
          .where(eq(schema.benchmarkRuns.id, runId))
        expect(after.retractedAt).not.toBeNull()
        expect(after.retractionReason).toMatchObject({
          reason: "test retraction",
          actor: "tester",
        })

        // No longer eligible on ranked surfaces.
        const stillEligible = await tx
          .select({ id: schema.benchmarkRuns.id })
          .from(schema.benchmarkRuns)
          .where(and(eq(schema.benchmarkRuns.id, runId), eligibleRunFilter()))
        expect(stillEligible).toHaveLength(0)

        // Audit trail records the actor and reason.
        const audit = await tx
          .select()
          .from(schema.auditEvents)
          .where(eq(schema.auditEvents.targetId, runId))
        expect(audit[0]).toMatchObject({
          action: "retract_run",
          reason: "test retraction",
        })

        // The caused transition appended with its own cause.
        const events = await tx
          .select()
          .from(schema.recordEvents)
          .where(
            and(
              eq(schema.recordEvents.comparisonKey, before.comparisonKey),
              eq(schema.recordEvents.cause, "retraction"),
              eq(schema.recordEvents.previousRunId, runId),
            ),
          )
        expect(events.length).toBeGreaterThanOrEqual(1)
        throw new Rollback("rollback")
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error
      })
  })

  it("refuses double retraction", async () => {
    await db()
      .transaction(async (tx) => {
        await expect(
          retractRun(tx, {
            runId: "00000000-0000-7000-8000-000000000000",
            reason: "x",
            actor: { id: "u1", name: "tester" },
          }),
        ).rejects.toThrow("not a published run")
        throw new Rollback("rollback")
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error
      })
  })
})
