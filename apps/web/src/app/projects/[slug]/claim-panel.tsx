"use client"

import { usePathname } from "next/navigation"
import { useActionState } from "react"
import { type ClaimState, claimAction } from "./claim-action"

/**
 * "Is this you?" (§15.3), session-free like the watch button: one native
 * disclosure holding the one-click path for GitHub-hosted projects (the
 * action verifies the login live) and the reviewed evidence path for
 * everything else. Signed-out visitors get a sign-in link that returns here.
 */
export function ClaimPanel({
  slug,
  github,
}: {
  slug: string
  /** True when the project declares a GitHub host; enables the one-click
   * owner path. Org repositories still fall through to evidence. */
  github: boolean
}) {
  const pathname = usePathname()
  const [state, action, pending] = useActionState(claimAction, {
    message: "",
  } as ClaimState)
  if (state.accepted)
    return <p className="text-small text-subtle">{state.message}</p>
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none text-small text-subtle transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
        <span className="key px-2.5 py-1">
          Is this you? Claim this project ›
        </span>
      </summary>
      <div className="mt-3 max-w-[640px] space-y-3 text-small">
        {github && (
          <form action={action} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="projectSlug" value={slug} />
            <input type="hidden" name="mode" value="github" />
            <button
              type="submit"
              disabled={pending}
              className="key-primary h-8 cursor-pointer px-4 text-small"
            >
              Claim as the repository owner
            </button>
            <span className="text-faint">
              Verifies your GitHub login against the repository owner, live.
            </span>
          </form>
        )}
        <form action={action} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="projectSlug" value={slug} />
          <input
            name="evidenceUrl"
            placeholder="evidence URL (a public page linking this handle to the project)"
            required
            type="url"
            className="well w-[420px] max-w-full px-2.5 py-1.5 font-mono text-small outline-none"
          />
          <button
            type="submit"
            disabled={pending}
            className="key h-8 cursor-pointer px-3 text-small hover:text-fg"
          >
            Submit evidence
          </button>
        </form>
        {state.signIn ? (
          <a
            href={`/signin?next=${encodeURIComponent(pathname)}`}
            className="inline-block"
          >
            Sign in with GitHub to claim →
          </a>
        ) : (
          state.message && (
            <p className="font-mono text-small text-faint">{state.message}</p>
          )
        )}
        <p className="text-faint">
          A claim grants attribution and metadata maintenance, never the right
          to edit evidence. Evidence claims are reviewed by a maintainer.
        </p>
      </div>
    </details>
  )
}
