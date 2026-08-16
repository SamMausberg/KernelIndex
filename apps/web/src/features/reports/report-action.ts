"use server"

// §15.6 intake: anonymous is allowed, so the session is context, not a
// gate. All validation and the abuse cap live in the server module.
import { headers } from "next/headers"
import { sessionUser } from "@/server/policy/authorization"
import { fileReport } from "@/server/reports"

export type ReportState = { message: string; filed?: boolean }

export async function reportAction(
  _previous: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const user = await sessionUser(await headers())
  const error = await fileReport({
    targetKind: String(formData.get("targetKind") ?? ""),
    targetId: String(formData.get("targetId") ?? ""),
    reason: String(formData.get("reason") ?? ""),
    detail: String(formData.get("detail") ?? ""),
    evidenceUrl: String(formData.get("evidenceUrl") ?? ""),
    contact: String(formData.get("contact") ?? ""),
    userId: user?.id ?? null,
  })
  if (error !== null) return { message: error }
  return { message: "Filed. A maintainer reviews every report.", filed: true }
}
