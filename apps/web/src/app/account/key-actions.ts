"use server"

// API-key management actions (§13.6): create returns the secret exactly
// once; revoke is immediate. Authorization is the session — keys belong to
// their creator only.
import { headers } from "next/headers"
import { createApiKey, revokeApiKey } from "@/server/api-keys"
import { sessionUser } from "@/server/policy/authorization"

export type KeyState = { message: string; token?: string }

export async function createKeyAction(
  _previous: KeyState,
  formData: FormData,
): Promise<KeyState> {
  const user = await sessionUser(await headers())
  if (user === null) return { message: "sign in first" }
  const name = String(formData.get("name") ?? "").trim()
  if (name.length === 0 || name.length > 80)
    return { message: "name a key (at most 80 characters)" }
  const { token, prefix } = await createApiKey(user.id, name)
  return {
    message: `created ${prefix}… — copy the key now; it is never shown again`,
    token,
  }
}

export async function revokeKeyAction(
  _previous: KeyState,
  formData: FormData,
): Promise<KeyState> {
  const user = await sessionUser(await headers())
  if (user === null) return { message: "sign in first" }
  const revoked = await revokeApiKey(user.id, String(formData.get("id") ?? ""))
  return { message: revoked ? "revoked" : "no such active key" }
}
