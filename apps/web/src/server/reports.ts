// Public correction/report intake (§15.6): anyone can flag a published
// object with a structured reason; review happens on /admin, and an
// accepted report flows through the existing correction path (retraction
// or supersession) — a report never edits evidence directly.
import { and, count, eq, gte, sql } from "drizzle-orm"
import { db } from "./db/client.ts"
import * as schema from "./db/schema.ts"

export const REPORT_REASONS = [
  "incorrect_result",
  "wrong_attribution",
  "license_issue",
  "comparability",
  "other",
] as const

export const REPORT_TARGET_KINDS = ["run", "serving_run"] as const

/* Anonymous intake cannot be keyed by identity (no IP is stored, §20.5),
   so the abuse cap is per target and per UTC day. */
const DAILY_TARGET_CAP = 20
const DETAIL_LIMIT = 4000
const CONTACT_LIMIT = 200

export type ReportInput = {
  targetKind: string
  targetId: string
  reason: string
  detail: string
  evidenceUrl: string
  contact: string
  userId: string | null
}

/** Validates and files a report. Returns an error message, or null on
 * success — the caller renders it next to the form. */
export async function fileReport(input: ReportInput): Promise<string | null> {
  if (!REPORT_TARGET_KINDS.some((kind) => kind === input.targetKind))
    return "unknown target kind"
  if (!REPORT_REASONS.some((reason) => reason === input.reason))
    return "pick a reason"
  const detail = input.detail.trim()
  if (detail.length === 0) return "describe the problem"
  if (detail.length > DETAIL_LIMIT)
    return `detail is limited to ${DETAIL_LIMIT} characters`
  const evidenceUrl = input.evidenceUrl.trim()
  if (evidenceUrl !== "" && !/^https?:\/\/\S+$/.test(evidenceUrl))
    return "evidence must be an http(s) URL"
  const [recent] = await db()
    .select({ filed: count() })
    .from(schema.reports)
    .where(
      and(
        eq(schema.reports.targetKind, input.targetKind),
        eq(schema.reports.targetId, input.targetId),
        gte(schema.reports.createdAt, sql`now() - interval '1 day'`),
      ),
    )
  if ((recent?.filed ?? 0) >= DAILY_TARGET_CAP)
    return "this object reached its daily report limit; try again tomorrow"
  await db()
    .insert(schema.reports)
    .values({
      targetKind: input.targetKind,
      targetId: input.targetId,
      reason: input.reason,
      detail,
      evidenceUrl: evidenceUrl === "" ? null : evidenceUrl,
      contact: input.contact.trim().slice(0, CONTACT_LIMIT) || null,
      userId: input.userId,
    })
  return null
}

/** Moderation transition with its audit event. Only open reports move. */
export async function resolveReport(
  id: string,
  state: "resolved" | "dismissed",
  note: string,
  actor: string,
): Promise<boolean> {
  const moved = await db()
    .update(schema.reports)
    .set({ state, resolutionNote: note || null, resolvedAt: sql`now()` })
    .where(and(eq(schema.reports.id, id), eq(schema.reports.state, "open")))
    .returning({ id: schema.reports.id })
  if (moved.length === 0) return false
  await db()
    .insert(schema.auditEvents)
    .values({
      actor,
      action: `report_${state}`,
      targetKind: "report",
      targetId: id,
      reason: note,
    })
  return true
}
