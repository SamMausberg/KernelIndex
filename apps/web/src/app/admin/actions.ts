"use server"

import { eq } from "drizzle-orm"
// Maintainer actions (§15.8): every one passes the centralized policy and
// writes an audit event through its use case; nothing touches derived
// rankings directly.
import { revalidateTag } from "next/cache.js"
import { headers } from "next/headers"
import { retractRun } from "@/server/catalog/corrections"
import { reviewSubmission } from "@/server/catalog/submissions"
import { db } from "@/server/db/client"
import * as schema from "@/server/db/schema"
import {
  canCorrectRuns,
  canReviewSubmissions,
  sessionUser,
} from "@/server/policy/authorization"
import { resolveReport } from "@/server/reports"

export type AdminActionState = { message: string }

export async function retractAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const user = await sessionUser(await headers())
  if (user === null || !canCorrectRuns(user)) {
    return { message: "forbidden: site_admin required" }
  }
  try {
    const result = await retractRun(db(), {
      runId: String(formData.get("runId") ?? ""),
      reason: String(formData.get("reason") ?? ""),
      actor: { id: user.id, name: user.name },
    })
    revalidateTag("catalog", "max")
    return {
      message: `retracted · new leader ${result.newLeaderRunId ?? "none"}`,
    }
  } catch (error) {
    return { message: (error as Error).message }
  }
}

export async function reviewAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const user = await sessionUser(await headers())
  if (user === null || !canReviewSubmissions(user)) {
    return { message: "forbidden: site_admin required" }
  }
  try {
    const { state } = await reviewSubmission(user, {
      id: String(formData.get("id") ?? ""),
      decision:
        formData.get("decision") === "accepted" ? "accepted" : "rejected",
      note: String(formData.get("note") ?? ""),
    })
    revalidateTag("catalog", "max")
    return { message: `submission ${state}` }
  } catch (error) {
    return { message: (error as Error).message }
  }
}

export async function reportReviewAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const user = await sessionUser(await headers())
  if (user === null || !canReviewSubmissions(user)) {
    return { message: "forbidden: site_admin required" }
  }
  const state =
    formData.get("decision") === "resolved" ? "resolved" : "dismissed"
  const moved = await resolveReport(
    String(formData.get("id") ?? ""),
    state,
    String(formData.get("note") ?? ""),
    `${user.name} (${user.id})`,
  )
  return { message: moved ? `report ${state}` : "already closed" }
}

export async function claimReviewAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const user = await sessionUser(await headers())
  if (user === null || !canReviewSubmissions(user)) {
    return { message: "forbidden: site_admin required" }
  }
  const id = String(formData.get("id") ?? "")
  const state =
    formData.get("decision") === "accepted" ? "accepted" : "rejected"
  await db()
    .update(schema.projectClaims)
    .set({ state, reviewNote: String(formData.get("note") ?? "") })
    .where(eq(schema.projectClaims.id, id))
  await db()
    .insert(schema.auditEvents)
    .values({
      actor: `${user.name} (${user.id})`,
      action: `claim_${state}`,
      targetKind: "project_claim",
      targetId: id,
      reason: String(formData.get("note") ?? ""),
    })
  return { message: `claim ${state}` }
}
