"use client"

import { useActionState } from "react"
import { type WatchState, watchAction } from "./watch-action"

/** Session-free watch toggle for a comparison cohort (§13.11). */
export function WatchButton({ comparisonKey }: { comparisonKey: string }) {
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
      {state.message && (
        <span className="text-[12px] text-faint">{state.message}</span>
      )}
    </form>
  )
}
