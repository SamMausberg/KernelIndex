"use client"

import { authClient } from "@/lib/auth-client"

/** Better Auth's /sign-out is POST-only; anchors cannot drive it. */
export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={async () => {
        await authClient.signOut()
        window.location.assign("/")
      }}
      className="cursor-pointer text-body text-subtle transition-colors hover:text-fg"
    >
      Sign out
    </button>
  )
}
