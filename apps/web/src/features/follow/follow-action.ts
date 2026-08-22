"use server"

// Follow toggle (§13.11): cached pages render the button session-free;
// authorization happens here, at the action. The label and page travel
// with the follow so the account list needs no joins.
import { headers } from "next/headers"
import { isFollowKind, toggleFollow } from "@/server/follows"
import { sessionUser } from "@/server/policy/authorization"

export type FollowState = {
  message: string
  signIn?: boolean
  following?: boolean
}

export async function followAction(
  _previous: FollowState,
  formData: FormData,
): Promise<FollowState> {
  const user = await sessionUser(await headers())
  if (user === null) return { message: "", signIn: true }
  const kind = String(formData.get("kind") ?? "")
  const key = String(formData.get("key") ?? "").slice(0, 500)
  const label = String(formData.get("label") ?? "").slice(0, 200)
  const href = String(formData.get("href") ?? "").slice(0, 500)
  if (!isFollowKind(kind) || key === "" || !href.startsWith("/"))
    return { message: "nothing to follow" }
  const following = await toggleFollow(user.id, { kind, key, label, href })
  return {
    message: following ? "following" : "unfollowed",
    following,
  }
}
