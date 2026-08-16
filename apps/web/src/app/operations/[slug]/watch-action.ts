"use server"

// Watch toggle (§13.11): the cached operation page renders the button
// session-free; authorization happens here, at the action.
import { headers } from "next/headers"
import { sessionUser } from "@/server/policy/authorization"
import { toggleWatch } from "@/server/watches"

export type WatchState = { message: string; signIn?: boolean }

export async function watchAction(
  _previous: WatchState,
  formData: FormData,
): Promise<WatchState> {
  const user = await sessionUser(await headers())
  if (user === null) return { message: "", signIn: true }
  const comparisonKey = String(formData.get("comparisonKey") ?? "")
  if (!comparisonKey.startsWith("sha256:")) return { message: "no cohort" }
  const watching = await toggleWatch(user.id, comparisonKey)
  return {
    message: watching ? "watching — changes appear on /account" : "unwatched",
  }
}
