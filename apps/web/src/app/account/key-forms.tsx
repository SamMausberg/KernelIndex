"use client"

import { useActionState } from "react"
import { CopyButton } from "@/components/copy-button"
import { createKeyAction, type KeyState, revokeKeyAction } from "./key-actions"

export function CreateKeyForm() {
  const [state, action, pending] = useActionState(createKeyAction, {
    message: "",
  } as KeyState)
  return (
    <div>
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input
          name="name"
          placeholder="key name (e.g. laptop, ci)"
          required
          maxLength={80}
          className="well w-[240px] px-2.5 py-1.5 font-mono text-small outline-none"
        />
        <label className="flex cursor-pointer items-center gap-1.5 text-small text-subtle">
          <input type="checkbox" name="write" />
          submissions:write
        </label>
        <button
          type="submit"
          disabled={pending}
          className="key cursor-pointer px-3 py-1 text-small hover:text-fg"
        >
          Create key
        </button>
        {state.message && (
          <span className="font-mono text-small text-faint">
            {state.message}
          </span>
        )}
      </form>
      {state.token && (
        <div className="plate mt-3 flex max-w-[560px] items-center gap-2.5 py-2 pr-2 pl-3">
          <code className="min-w-0 flex-1 truncate font-mono text-small text-muted">
            {state.token}
          </code>
          <CopyButton text={state.token} />
        </div>
      )}
    </div>
  )
}

export function RevokeKeyForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(revokeKeyAction, {
    message: "",
  } as KeyState)
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer text-small text-faint transition-colors hover:text-fg"
      >
        {state.message === "revoked" ? "revoked" : "revoke"}
      </button>
    </form>
  )
}
