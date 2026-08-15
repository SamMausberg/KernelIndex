import type { Metadata } from "next"
import { headers } from "next/headers"
import { ContextHeader } from "@/components/context-header"
import { authConfigured } from "@/server/auth"
import { sessionUser } from "@/server/policy/authorization"
import { SubmitForm } from "./submit-form"

export const metadata: Metadata = { title: "Submit evidence" }

export default async function SubmitPage() {
  const user = authConfigured ? await sessionUser(await headers()) : null
  return (
    <>
      <div className="scan-line" />
      <ContextHeader
        title="Submit evidence"
        context="one YAML document · validated with the canonical schemas · reviewed before publication"
        meta={
          user ? (
            <span>signed in as {user.name}</span>
          ) : authConfigured ? (
            <a href="/api/auth/sign-in/social?provider=github">
              Sign in with GitHub
            </a>
          ) : (
            <span>sign-in not configured on this deployment</span>
          )
        }
      >
        <p className="mt-1.5 max-w-[72ch] text-[13px] text-subtle">
          A submission carries canonical manifests: projects, operations,
          workloads, implementations (with projectSlug), and runs with their
          protocol and environment. The PR path — a reviewed file under
          registry/submissions — runs the identical validation and publication
          transaction.
        </p>
      </ContextHeader>
      <main className="shell-narrow animate-fade-in pb-20">
        <SubmitForm signedIn={user !== null} />
      </main>
    </>
  )
}
