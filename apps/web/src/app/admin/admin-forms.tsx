"use client"

import { useActionState } from "react"
import {
  type AdminActionState,
  attestationHideAction,
  claimReviewAction,
  reportReviewAction,
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
        className="well w-[320px] px-2.5 py-1.5 font-mono text-small outline-none"
      />
      <input
        name="reason"
        placeholder="reason (recorded in the audit trail)"
        required
        className="well w-[360px] px-2.5 py-1.5 font-mono text-small outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="key cursor-pointer px-3 py-1 text-small text-warning hover:text-fg"
      >
        Retract
      </button>
      {state.message && (
        <span className="font-mono text-small text-faint">{state.message}</span>
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
        className="well w-[280px] px-2.5 py-1 font-mono text-small outline-none"
      />
      <button
        type="submit"
        name="decision"
        value="accepted"
        disabled={pending}
        className="key cursor-pointer px-2.5 py-0.5 text-small text-success hover:text-fg"
      >
        Accept · publish
      </button>
      <button
        type="submit"
        name="decision"
        value="rejected"
        disabled={pending}
        className="key cursor-pointer px-2.5 py-0.5 text-small text-warning hover:text-fg"
      >
        Reject
      </button>
      {state.message && (
        <span className="font-mono text-small text-faint">{state.message}</span>
      )}
    </form>
  )
}

export function ReportReviewForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(reportReviewAction, INITIAL)
  return (
    <form action={action} className="flex flex-wrap items-center gap-2.5">
      <input type="hidden" name="id" value={id} />
      <input
        name="note"
        placeholder="resolution note"
        className="well w-[280px] px-2.5 py-1 font-mono text-small outline-none"
      />
      <button
        type="submit"
        name="decision"
        value="resolved"
        disabled={pending}
        className="key cursor-pointer px-2.5 py-0.5 text-small text-success hover:text-fg"
      >
        Resolve
      </button>
      <button
        type="submit"
        name="decision"
        value="dismissed"
        disabled={pending}
        className="key cursor-pointer px-2.5 py-0.5 text-small text-warning hover:text-fg"
      >
        Dismiss
      </button>
      {state.message && (
        <span className="font-mono text-small text-faint">{state.message}</span>
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
        className="well w-[240px] px-2.5 py-1 font-mono text-small outline-none"
      />
      <button
        type="submit"
        name="decision"
        value="accepted"
        disabled={pending}
        className="key cursor-pointer px-2.5 py-0.5 text-small text-success hover:text-fg"
      >
        Accept
      </button>
      <button
        type="submit"
        name="decision"
        value="rejected"
        disabled={pending}
        className="key cursor-pointer px-2.5 py-0.5 text-small text-warning hover:text-fg"
      >
        Reject
      </button>
      {state.message && (
        <span className="font-mono text-small text-faint">{state.message}</span>
      )}
    </form>
  )
}

export function AttestationHideForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(
    attestationHideAction,
    INITIAL,
  )
  return (
    <form action={action} className="flex flex-wrap items-center gap-2.5">
      <input type="hidden" name="id" value={id} />
      <input
        name="note"
        placeholder="reason"
        className="well w-[280px] px-2.5 py-1 font-mono text-small outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="key cursor-pointer px-2.5 py-0.5 text-small text-warning hover:text-fg"
      >
        Hide
      </button>
      {state.message && (
        <span className="font-mono text-small text-faint">{state.message}</span>
      )}
    </form>
  )
}
