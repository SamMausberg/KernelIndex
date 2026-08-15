"use server"

import { eq } from "drizzle-orm"
// Project claim intake (§15.3): evidence recorded, maintainer-reviewed.
// Claiming grants metadata maintenance and attribution — never deletion of
// third-party evidence or rewriting of benchmark history.
import { headers } from "next/headers"
import { db } from "@/server/db/client"
import * as schema from "@/server/db/schema"
import { sessionUser } from "@/server/policy/authorization"

export type ClaimState = { message: string }

export async function claimAction(
  _previous: ClaimState,
  formData: FormData,
): Promise<ClaimState> {
  const user = await sessionUser(await headers())
  if (user === null) return { message: "sign in first" }
  const slug = String(formData.get("projectSlug") ?? "")
  const [project] = await db()
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.slug, slug))
  if (!project) return { message: `no project '${slug}'` }
  const [row] = await db()
    .insert(schema.projectClaims)
    .values({
      projectId: project.id,
      userId: user.id,
      evidenceUrl: String(formData.get("evidenceUrl") ?? ""),
    })
    .returning({ id: schema.projectClaims.id })
  await db()
    .insert(schema.auditEvents)
    .values({
      actor: `${user.name} (${user.id})`,
      action: "claim_submitted",
      targetKind: "project_claim",
      targetId: row.id,
      reason: slug,
    })
  return { message: "claim submitted for review" }
}
