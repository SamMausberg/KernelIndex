"use client"

import { usePathname } from "next/navigation"
import { useActionState } from "react"
import type { FollowKind } from "@/server/follows"
import { type FollowState, followAction } from "./follow-action"

/**
 * Session-free follow toggle (§13.11) for a cohort, operation, project,
 * GPU, or model tag. Signed-out visitors get a real sign-in link that
 * returns to this page; a follow answers with the feed it now appears in.
 */
export function FollowButton({
  kind,
  followKey,
  label,
  href,
  noun,
}: {
  kind: FollowKind
  /** What the feed matches on: cohort key, slug, or hardware model. */
  followKey: string
  /** What the account list shows. */
  label: string
  /** The page the follow came from. */
  href: string
  /** The button word: "cohort", "operation", "project", "GPU", "model". */
  noun: string
}) {
  const pathname = usePathname()
  const [state, action, pending] = useActionState(followAction, {
    message: "",
  } as FollowState)
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="key" value={followKey} />
      <input type="hidden" name="label" value={label} />
      <input type="hidden" name="href" value={href} />
      <button
        type="submit"
        disabled={pending}
        className={`key cursor-pointer px-2.5 py-1 text-small hover:text-fg ${
          state.following ? "key-on" : "text-subtle"
        }`}
      >
        {state.following ? `Following ${noun}` : `Follow ${noun}`}
      </button>
      {state.signIn ? (
        <a
          href={`/signin?next=${encodeURIComponent(pathname)}`}
          className="text-small"
        >
          Sign in to follow →
        </a>
      ) : state.following ? (
        <a href="/feed?following=1" className="text-small">
          your feed →
        </a>
      ) : (
        state.message && (
          <span className="text-small text-faint">{state.message}</span>
        )
      )}
    </form>
  )
}
