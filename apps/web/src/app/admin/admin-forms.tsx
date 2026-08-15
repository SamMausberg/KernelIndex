"use client"

import { useActionState } from "react"
import {
  type AdminActionState,
  claimReviewAction,
  retractAction,
  reviewAction,
} from "./actions"

const INITIAL: AdminActionState = { message: "" }

export function RetractForm() {
  const [state, action, pending] = useActionState(retractAction, INITIAL)
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input
        name="runId"
        placeholder="run id"
        required
        className="well w-[320px] px-2.5 py-1.5 font-mono text-[12px] outline-none"
      />
      <input
        name="reason"
        placeholder="reason (recorded in the audit trail)"
        required
        className="well w-[360px] px-2.5 py-1.5 font-mono text-[12px] outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="key cursor-pointer px-3 py-1 text-[12.5px] text-warning hover:text-fg"
      >
        Retract
      </button>
      {state.message && (
        <span className="font-mono text-[12px] text-faint">
          {state.message}
        </span>
      )}
    </form>
  )
}

export function ReviewForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(reviewAction, INITIAL)
  return (
    <form action={action} className="flex flex-wrap items-center gap-2.5">
      <input type="hidden" name="id" value={id} />
      <input
        name="note"
        placeholder="review note"
        className="well w-[280px] px-2.5 py-1 font-mono text-[12px] outline-none"
      />
      <button
        type="submit"
        name="decision"
        value="accepted"
        disabled={pending}
        className="key cursor-pointer px-2.5 py-0.5 text-[12px] text-success hover:text-fg"
      >
        Accept · publish
      </button>
      <button
        type="submit"
        name="decision"
        value="rejected"
        disabled={pending}
        className="key cursor-pointer px-2.5 py-0.5 text-[12px] text-warning hover:text-fg"
      >
        Reject
      </button>
      {state.message && (
        <span className="font-mono text-[12px] text-faint">
          {state.message}
        </span>
      )}
    </form>
  )
}

export function ClaimReviewForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(claimReviewAction, INITIAL)
  return (
    <form action={action} className="flex flex-wrap items-center gap-2.5">
      <input type="hidden" name="id" value={id} />
      <input
        name="note"
        placeholder="review note"
        className="well w-[240px] px-2.5 py-1 font-mono text-[12px] outline-none"
      />
      <button
        type="submit"
        name="decision"
        value="accepted"
        disabled={pending}
        className="key cursor-pointer px-2.5 py-0.5 text-[12px] text-success hover:text-fg"
      >
        Accept
      </button>
      <button
        type="submit"
        name="decision"
        value="rejected"
        disabled={pending}
        className="key cursor-pointer px-2.5 py-0.5 text-[12px] text-warning hover:text-fg"
      >
        Reject
      </button>
      {state.message && (
        <span className="font-mono text-[12px] text-faint">
          {state.message}
        </span>
      )}
    </form>
  )
}
