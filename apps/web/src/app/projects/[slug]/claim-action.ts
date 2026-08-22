"use server"

// Project claim intake (§15.3). Two paths share one action: a GitHub-hosted
// project is claimed in one click by the login that owns its repository
// path, verified live against GitHub with the session's OAuth token; every
// other project (and every org repository) goes through reviewed evidence.
// Claiming grants attribution and project metadata maintenance — never
// deletion of third-party evidence or rewriting of benchmark history.
import { and, eq } from "drizzle-orm"
import { revalidateTag } from "next/cache"
import { headers } from "next/headers"
import { z } from "zod"
import type { SoftwareProjectManifest } from "@/schemas/kinds"
import { auth } from "@/server/auth"
import { db } from "@/server/db/client"
import * as schema from "@/server/db/schema"
import {
  canAutoApproveClaim,
  type SessionUser,
  sessionUser,
} from "@/server/policy/authorization"

export type ClaimState = {
  message: string
  /** Signed out: the panel renders a sign-in link that returns here. */
  signIn?: boolean
  accepted?: boolean
}

export const claimEvidenceUrl = z
  .httpUrl()
  .max(2000)
  .refine((value) => {
    const url = new URL(value)
    return (
      url.protocol === "https:" && url.username === "" && url.password === ""
    )
  }, "use a public HTTPS URL without embedded credentials")

/** The session's GitHub login, read live with the stored OAuth token; null
 * when no GitHub account is linked or GitHub declines. */
async function githubLogin(
  userId: string,
  requestHeaders: Headers,
): Promise<string | null> {
  try {
    const token = await auth().api.getAccessToken({
      body: { providerId: "github", userId },
      headers: requestHeaders,
    })
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "KernelIndex",
      },
    })
    if (!response.ok) return null
    const profile = (await response.json()) as { login?: string }
    return profile.login ?? null
  } catch {
    return null
  }
}

async function audit(
  user: SessionUser,
  action: string,
  claimId: string,
  reason: string,
) {
  await db()
    .insert(schema.auditEvents)
    .values({
      actor: `${user.name} (${user.id})`,
      action,
      targetKind: "project_claim",
      targetId: claimId,
      reason,
    })
}

export async function claimAction(
  _previous: ClaimState,
  formData: FormData,
): Promise<ClaimState> {
  const requestHeaders = await headers()
  const user = await sessionUser(requestHeaders)
  if (user === null) return { message: "", signIn: true }
  const slug = String(formData.get("projectSlug") ?? "")
  const [project] = await db()
    .select({ id: schema.projects.id, manifest: schema.projects.manifest })
    .from(schema.projects)
    .where(eq(schema.projects.slug, slug))
  if (!project) return { message: `no project '${slug}'` }
  const existing = await db()
    .select({ state: schema.projectClaims.state })
    .from(schema.projectClaims)
    .where(
      and(
        eq(schema.projectClaims.projectId, project.id),
        eq(schema.projectClaims.userId, user.id),
      ),
    )
  if (existing.some((claim) => claim.state === "accepted"))
    return { message: "already yours", accepted: true }
  if (existing.some((claim) => claim.state === "pending"))
    return { message: "your claim is pending review" }

  if (formData.get("mode") === "github") {
    const host = (project.manifest as SoftwareProjectManifest).spec.host ?? null
    const login = await githubLogin(user.id, requestHeaders)
    if (login === null)
      return { message: "no GitHub account is linked to this session" }
    if (!canAutoApproveClaim(login, host))
      return {
        message: `@${login} does not own ${host?.id ?? "this project"}; submit evidence instead`,
      }
    const [row] = await db()
      .insert(schema.projectClaims)
      .values({
        projectId: project.id,
        userId: user.id,
        evidenceUrl: `https://github.com/${login}`,
        state: "accepted",
      })
      .returning({ id: schema.projectClaims.id })
    await audit(user, "claim_auto_accepted", row.id, `${slug} as @${login}`)
    revalidateTag("catalog", "max")
    return { message: `claimed as @${login}`, accepted: true }
  }

  const evidenceUrl = claimEvidenceUrl.safeParse(formData.get("evidenceUrl"))
  if (!evidenceUrl.success) {
    return { message: "evidence must be a public HTTPS URL" }
  }
  const [row] = await db()
    .insert(schema.projectClaims)
    .values({
      projectId: project.id,
      userId: user.id,
      evidenceUrl: evidenceUrl.data,
    })
    .returning({ id: schema.projectClaims.id })
  await audit(user, "claim_submitted", row.id, slug)
  revalidateTag("catalog", "max")
  return { message: "claim submitted for review" }
}
