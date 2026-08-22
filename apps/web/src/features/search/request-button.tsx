"use client"

import { useActionState } from "react"
import { Link } from "@/components/quiet-link"
import { type RequestState, requestWorkloadAction } from "./request-workload"

/** The no-answer states record demand (§2.3): one key button, coarse
 * facets only, no account needed. */
export function RequestWorkload({
  operation,
  query,
}: {
  operation: string
  query: string
}) {
  const [state, action, pending] = useActionState(requestWorkloadAction, {
    message: "",
  } as RequestState)
  if (state.recorded)
    return (
      <p className="text-small text-subtle">
        {state.message}{" "}
        <Link href="/challenges" className="text-small">
          Challenges →
        </Link>
      </p>
    )
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="operation" value={operation} />
      <input type="hidden" name="q" value={query} />
      <button
        type="submit"
        disabled={pending}
        className="key cursor-pointer px-2.5 py-1 text-small text-subtle hover:text-fg"
      >
        Ask for this workload
      </button>
      <span className="text-small text-faint">
        records the facets, never the text
      </span>
    </form>
  )
}
