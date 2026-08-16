"use server"

import { headers } from "next/headers"
import { sessionUser } from "@/server/policy/authorization"
import { markSeen, toggleWatch } from "@/server/watches"

export async function markSeenAction() {
  const user = await sessionUser(await headers())
  if (user !== null) await markSeen(user.id)
}

export async function unwatchAction(formData: FormData) {
  const user = await sessionUser(await headers())
  if (user !== null)
    await toggleWatch(user.id, String(formData.get("comparisonKey") ?? ""))
}
