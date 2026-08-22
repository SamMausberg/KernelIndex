// Community attestations (§15.6, §16.10): a signed-in reader attaches a
// typed statement to a run — reproduced, could not reproduce, an
// environment note, a regression — with optional evidence and a measured
// value. Published on write under a per-user daily cap; a maintainer can
// hide one. Attestations never change the evidence level (§8.14): only an
// approved runner identity does.
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm"
import type { Attestation } from "../lib/catalog-models.ts"
import { db } from "./db/client.ts"
import * as schema from "./db/schema.ts"

export const ATTESTATION_TYPES = [
  "reproduced",
  "could_not_reproduce",
  "environment_note",
  "regression_observed",
] as const
export type AttestationType = (typeof ATTESTATION_TYPES)[number]

const BODY_LIMIT = 2000
const ENVIRONMENT_LIMIT = 200
const DAILY_USER_CAP = 20

export type AttestationInput = {
  runId: string
  type: string
  body: string
  evidenceUrl: string
  /** Measured value in nanoseconds, already normalized by the form. */
  observedNs: number | null
  environmentSummary: string
  user: { id: string; name: string }
}

/** Validates and files an attestation. Returns an error message, or null
 * on success — the caller renders it next to the form. */
export async function fileAttestation(
  input: AttestationInput,
): Promise<string | null> {
  if (!ATTESTATION_TYPES.some((type) => type === input.type))
    return "pick a type"
  const body = input.body.trim()
  if (body.length === 0) return "say what you observed"
  if (body.length > BODY_LIMIT)
    return `the note is limited to ${BODY_LIMIT} characters`
  const evidenceUrl = input.evidenceUrl.trim()
  if (evidenceUrl !== "" && !/^https:\/\/\S+$/.test(evidenceUrl))
    return "evidence must be a public HTTPS URL"
  if (
    input.observedNs !== null &&
    (!Number.isFinite(input.observedNs) || input.observedNs <= 0)
  )
    return "the measured value must be a positive duration"
  const [run] = await db()
    .select({ id: schema.benchmarkRuns.id })
    .from(schema.benchmarkRuns)
    .where(eq(schema.benchmarkRuns.id, input.runId))
  if (!run) return "no such run"
  const [recent] = await db()
    .select({ filed: count() })
    .from(schema.attestations)
    .where(
      and(
        eq(schema.attestations.userId, input.user.id),
        gte(schema.attestations.createdAt, sql`now() - interval '1 day'`),
      ),
    )
  if ((recent?.filed ?? 0) >= DAILY_USER_CAP)
    return "you reached today's attestation limit; try again tomorrow"
  await db()
    .insert(schema.attestations)
    .values({
      runId: input.runId,
      type: input.type,
      body,
      evidenceUrl: evidenceUrl === "" ? null : evidenceUrl,
      observedNs: input.observedNs,
      environmentSummary:
        input.environmentSummary.trim().slice(0, ENVIRONMENT_LIMIT) || null,
      userId: input.user.id,
      author: input.user.name,
    })
  return null
}

/** Published attestations on one run, newest first (the run page's
 * Replications section and the run dossier API). */
export async function attestationsFor(runId: string): Promise<Attestation[]> {
  const rows = await db()
    .select()
    .from(schema.attestations)
    .where(
      and(
        eq(schema.attestations.runId, runId),
        eq(schema.attestations.state, "published"),
      ),
    )
    .orderBy(desc(schema.attestations.createdAt))
  return rows.map((row) => ({
    id: row.id,
    type: row.type as AttestationType,
    body: row.body,
    evidenceUrl: row.evidenceUrl,
    observedNs: row.observedNs,
    environmentSummary: row.environmentSummary,
    author: row.author,
    at: row.createdAt.toISOString(),
  }))
}

/** Published attestation counts per run id (implementation pages). */
export async function attestationCounts(
  runIds: string[],
): Promise<Map<string, number>> {
  if (runIds.length === 0) return new Map()
  const rows = await db()
    .select({ runId: schema.attestations.runId, n: count() })
    .from(schema.attestations)
    .where(
      and(
        inArray(schema.attestations.runId, runIds),
        eq(schema.attestations.state, "published"),
      ),
    )
    .groupBy(schema.attestations.runId)
  return new Map(rows.map((row) => [row.runId, row.n]))
}

/** Moderation: hide a published attestation, with its audit event. */
export async function hideAttestation(
  id: string,
  note: string,
  actor: string,
): Promise<boolean> {
  const moved = await db()
    .update(schema.attestations)
    .set({ state: "hidden" })
    .where(
      and(
        eq(schema.attestations.id, id),
        eq(schema.attestations.state, "published"),
      ),
    )
    .returning({ id: schema.attestations.id })
  if (moved.length === 0) return false
  await db()
    .insert(schema.auditEvents)
    .values({
      actor,
      action: "attestation_hidden",
      targetKind: "attestation",
      targetId: id,
      reason: note || null,
    })
  return true
}
