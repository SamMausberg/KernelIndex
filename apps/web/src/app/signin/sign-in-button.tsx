"use client"

import { useState } from "react"
import { authClient } from "@/lib/auth-client"

/** POSTs to Better Auth's social endpoint and follows its redirect. */
export function SignInButton() {
  const [state, setState] = useState<"idle" | "pending" | "error">("idle")
  return (
    <div>
      <button
        type="button"
        disabled={state === "pending"}
        onClick={async () => {
          setState("pending")
          const { error } = await authClient.signIn.social({
            provider: "github",
            callbackURL: "/account",
          })
          if (error) setState("error")
        }}
        className="key flex h-[40px] w-full max-w-[360px] cursor-pointer items-center justify-center gap-2.5 text-[13.5px] text-fg transition-colors hover:border-edge-hover disabled:cursor-default disabled:text-subtle"
      >
        {state === "pending"
          ? "Redirecting to GitHub…"
          : "Continue with GitHub"}
      </button>
      {state === "error" && (
        <p className="mt-2.5 text-[12.5px] text-warning">
          GitHub sign-in failed. Try again, or check that third-party cookies
          are allowed for github.com.
        </p>
      )}
    </div>
  )
}
