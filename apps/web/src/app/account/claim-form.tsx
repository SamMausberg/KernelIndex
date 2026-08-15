"use client"

import { useActionState } from "react"
import { type ClaimState, claimAction } from "./claim-action"

export function ClaimForm() {
  const [state, action, pending] = useActionState(claimAction, {
    message: "",
  } as ClaimState)
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input
        name="projectSlug"
        placeholder="project slug"
        required
        className="well w-[240px] px-2.5 py-1.5 font-mono text-[12px] outline-none"
      />
      <input
        name="evidenceUrl"
        placeholder="evidence URL (repo permission, challenge file, DNS …)"
        required
        type="url"
        className="well w-[360px] px-2.5 py-1.5 font-mono text-[12px] outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="key cursor-pointer px-3 py-1 text-[12.5px] hover:text-fg"
      >
        Claim
      </button>
      {state.message && (
        <span className="font-mono text-[12px] text-faint">
          {state.message}
        </span>
      )}
    </form>
  )
}
