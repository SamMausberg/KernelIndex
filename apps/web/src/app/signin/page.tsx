// Sign-in (§13.6): GitHub OAuth through Better Auth is the only identity —
// KernelIndex never sees or stores a password, and roles are KernelIndex
// rows granted server-side, never derived from OAuth. Public reads need no
// account; an account unlocks the contribution surfaces.
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ContextHeader } from "@/components/context-header"
import { safeNextPath } from "@/lib/paths"
import { authConfigured } from "@/server/auth"
import { sessionUser } from "@/server/policy/authorization"
import { SignInButton } from "./sign-in-button"

export const metadata: Metadata = { title: "Sign in" }
export const dynamic = "force-dynamic"

const UNLOCKS = [
  ["Submit evidence", "benchmark manifests through the guided web flow"],
  ["Claim projects", "maintain metadata and attribution for your kernels"],
  ["API keys", "scoped bearer tokens with a raised daily quota"],
  ["Watch cohorts", "a changes feed when a watched record is beaten"],
] as const

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  // Contextual CTAs ("sign in to watch") carry ?next= so the flow returns
  // to where it started instead of always landing on /account.
  const next = safeNextPath((await searchParams).next)
  const user = authConfigured ? await sessionUser(await headers()) : null
  if (user !== null) redirect(next)

  return (
    <>
      <div className="scan-line" />
      <ContextHeader
        title="Sign in"
        context="public reads never need an account"
      />
      <main className="shell-narrow animate-fade-in pt-10 pb-24">
        <div className="max-w-[560px]">
          {authConfigured ? (
            <div className="plate px-6 py-6">
              <SignInButton next={next} />
              <p className="mt-4 max-w-[52ch] text-[12.5px] leading-relaxed text-subtle">
                GitHub is the only identity KernelIndex uses: benchmark
                provenance ties to code identity, and no password is ever
                created or stored here. Sessions are HTTP-only cookies; sign out
                at any time from your account.
              </p>
            </div>
          ) : (
            <div className="plate px-6 py-6">
              <p className="max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
                Sign-in is not configured on this deployment (no GitHub OAuth
                credentials). Evidence can still be contributed through the{" "}
                <a href="https://github.com/SamMausberg/KernelIndex/tree/main/registry/submissions">
                  registry PR path
                </a>
                , which runs the identical validation and review.
              </p>
            </div>
          )}

          <div className="mt-10 border-t border-border pt-6">
            <div className="font-mono text-[10px] tracking-[0.08em] text-faint uppercase">
              What an account unlocks
            </div>
            <dl className="mt-3 space-y-2.5">
              {UNLOCKS.map(([term, detail]) => (
                <div key={term} className="flex gap-3 text-[13px]">
                  <dt className="w-[130px] shrink-0 text-fg">{term}</dt>
                  <dd className="text-subtle">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>

          <p className="mt-8 text-[12.5px] text-faint">
            Prefer the command line? The{" "}
            <Link href="/docs#data">API and CLI</Link> read the catalog without
            any account.
          </p>
        </div>
      </main>
    </>
  )
}
