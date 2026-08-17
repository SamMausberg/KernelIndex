// Sign-in (§13.6): OAuth through Better Auth — GitHub primary (project
// claims verify repository ownership), Google optionally beside it. Roles
// are KernelIndex rows granted server-side, never derived from OAuth.
// Public reads never need an account.
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { safeNextPath } from "@/lib/paths"
import { authConfigured, googleEnabled } from "@/server/auth"
import { sessionUser } from "@/server/policy/authorization"
import { SignInButton } from "./sign-in-button"

export const metadata: Metadata = { title: "Sign in" }
export const dynamic = "force-dynamic"

const UNLOCKS = [
  ["Submit evidence", "send benchmark manifests for review"],
  ["Claim projects", "maintain your kernels' pages"],
  ["API keys", "higher API quota, scoped tokens"],
  ["Watch cohorts", "get told when a record falls"],
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
      <main className="animate-fade-in mx-auto w-full max-w-[400px] px-6 pt-[10vh] pb-24">
        <h1 className="text-center text-[22px] font-medium tracking-[-0.015em]">
          Sign in
        </h1>
        <p className="mt-1.5 text-center text-[13px] text-subtle">
          Reading never needs an account.
        </p>

        {authConfigured ? (
          <div className="plate mt-8 px-6 py-6">
            <SignInButton provider="github" next={next} primary />
            {googleEnabled && (
              <div className="mt-2.5">
                <SignInButton provider="google" next={next} />
              </div>
            )}
            <p className="mt-4 text-center text-[12.5px] leading-relaxed text-subtle">
              No passwords. Sign out anytime.
              {googleEnabled && (
                <>
                  <br />
                  Claiming a project needs GitHub.
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="plate mt-8 px-6 py-6">
            <p className="text-center text-[13px] leading-relaxed text-muted">
              Sign-in is not set up on this deployment. You can still contribute
              evidence with a{" "}
              <a href="https://github.com/SamMausberg/KernelIndex/tree/main/registry/submissions">
                pull request
              </a>
              ; it goes through the same review.
            </p>
          </div>
        )}

        <dl className="mt-10 space-y-2.5 border-t border-border pt-6">
          {UNLOCKS.map(([term, detail]) => (
            <div key={term} className="flex gap-3 text-[13px]">
              <dt className="w-[128px] shrink-0 text-fg">{term}</dt>
              <dd className="text-subtle">{detail}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-8 text-center text-[12.5px] text-faint">
          The <Link href="/docs#data">API and CLI</Link> work without an
          account.
        </p>
      </main>
    </>
  )
}
