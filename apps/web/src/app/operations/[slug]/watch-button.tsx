"use client"

import { usePathname } from "next/navigation"
import { useActionState } from "react"
import { type WatchState, watchAction } from "./watch-action"

/** Session-free watch toggle for a comparison cohort (§13.11). Signed-out
 * visitors get a real sign-in link that returns to this page. */
export function WatchButton({ comparisonKey }: { comparisonKey: string }) {
  const pathname = usePathname()
  const [state, action, pending] = useActionState(watchAction, {
    message: "",
  } as WatchState)
  return (
    <form action={action} className="mt-3 flex items-center gap-3">
      <input type="hidden" name="comparisonKey" value={comparisonKey} />
      <button
        type="submit"
        disabled={pending}
        className="key cursor-pointer px-2.5 py-[3px] text-[12px] text-subtle hover:text-fg"
      >
        Watch cohort
      </button>
      {state.signIn ? (
        <a
          href={`/signin?next=${encodeURIComponent(pathname)}`}
          className="text-[12px]"
        >
          Sign in to watch records →
        </a>
      ) : (
        state.message && (
          <span className="text-[12px] text-faint">{state.message}</span>
        )
      )}
    </form>
  )
}
