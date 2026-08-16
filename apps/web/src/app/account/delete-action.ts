"use server"

// Self-service account deletion (§9.3 boundary): the identity row goes and
// sessions/keys/watches/roles cascade with it, signing the user out
// everywhere. Accepted evidence, submissions, claims, and audit events
// remain — their user reference detaches (ON DELETE SET NULL), because
// published history is append-only while personal data is not.
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/server/db/client"
import * as schema from "@/server/db/schema"
import { sessionUser } from "@/server/policy/authorization"

export type DeleteState = { message: string }

export async function deleteAccountAction(
  _previous: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  const user = await sessionUser(await headers())
  if (user === null) return { message: "not signed in" }
  if (String(formData.get("confirm") ?? "") !== user.email)
    return { message: "type your account email exactly to confirm" }
  // The audit event outlives the user: actor is the opaque id, never PII.
  await db().insert(schema.auditEvents).values({
    actor: user.id,
    action: "account.deleted",
    targetKind: "user",
    targetId: user.id,
    reason: "self-service deletion",
  })
  await db().delete(schema.users).where(eq(schema.users.id, user.id))
  redirect("/")
}
