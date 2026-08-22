"use server"

import { headers } from "next/headers"
import { isFollowKind, toggleFollow } from "@/server/follows"
import { sessionUser } from "@/server/policy/authorization"

/** The account list's ✕: a toggle on an existing follow removes it. */
export async function unfollowAction(formData: FormData) {
  const user = await sessionUser(await headers())
  const kind = String(formData.get("kind") ?? "")
  if (user === null || !isFollowKind(kind)) return
  await toggleFollow(user.id, {
    kind,
    key: String(formData.get("key") ?? ""),
    label: "",
    href: "/",
  })
}
