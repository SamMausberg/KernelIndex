"use client"

import { useState } from "react"
import { authClient } from "@/lib/auth-client"

const PROVIDERS = {
  github: { label: "GitHub", host: "github.com" },
  google: { label: "Google", host: "accounts.google.com" },
} as const

/** POSTs to Better Auth's social endpoint and follows its redirect. `next`
 * is a server-validated same-site path (§18 open-redirect guard). */
export function SignInButton({
  provider,
  next,
  primary = false,
}: {
  provider: keyof typeof PROVIDERS
  next: string
  primary?: boolean
}) {
  const [state, setState] = useState<"idle" | "pending" | "error">("idle")
  const { label, host } = PROVIDERS[provider]
  return (
    <div>
      <button
        type="button"
        disabled={state === "pending"}
        onClick={async () => {
          setState("pending")
          const { error } = await authClient.signIn.social({
            provider,
            callbackURL: next,
          })
          if (error) setState("error")
        }}
        className={`${primary ? "key-primary" : "key text-subtle hover:text-fg"} flex h-10 w-full cursor-pointer items-center justify-center text-body disabled:cursor-default disabled:text-subtle`}
      >
        {state === "pending"
          ? `Redirecting to ${label}…`
          : `Continue with ${label}`}
      </button>
      {state === "error" && (
        <p className="mt-2.5 text-center text-small text-warning">
          {label} sign-in failed. Try again, or allow cookies for {host}.
        </p>
      )}
    </div>
  )
}
