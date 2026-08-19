"use client"

import { useActionState } from "react"
import { type DeleteState, deleteAccountAction } from "./delete-action"

/** Type-to-confirm deletion. The consequences are stated where the action
 * is, not in a modal: evidence and audit history stay, identity does not. */
export function DeleteAccountForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(deleteAccountAction, {
    message: "",
  } as DeleteState)
  return (
    <form action={action} className="max-w-[560px]">
      <p className="text-small leading-relaxed text-subtle">
        Deletion is immediate: identity, sessions, keys, and watches are
        removed. Published evidence stays, with your account detached. Type{" "}
        <span className="font-mono text-small text-fg">{email}</span> to
        confirm.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          name="confirm"
          placeholder="account email"
          required
          autoComplete="off"
          className="well w-[280px] px-2.5 py-1.5 font-mono text-small outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="key cursor-pointer px-3 py-1 text-small text-warning hover:text-fg"
        >
          Delete account
        </button>
        {state.message && (
          <span className="font-mono text-small text-faint">
            {state.message}
          </span>
        )}
      </div>
    </form>
  )
}
