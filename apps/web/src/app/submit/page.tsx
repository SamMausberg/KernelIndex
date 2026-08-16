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
            <a href="/signin">Sign in with GitHub</a>
          ) : (
            <span>sign-in not configured on this deployment</span>
          )
        }
      >
        <p className="mt-1.5 max-w-[72ch] text-[13px] text-subtle">
          Paste one YAML document of{" "}
          <a href="/docs#data">canonical manifests</a> describing your evidence:
          the projects, workloads, implementations, and runs with their protocol
          and environment. Validate previews the parsed objects and digests
          before anything is sent; submitting queues them for review. Prefer a
          pull request? A reviewed file under registry/submissions runs the
          identical validation and publication transaction.
        </p>
      </ContextHeader>
      <main className="shell-narrow animate-fade-in pb-20">
        <SubmitForm signedIn={user !== null} signInAvailable={authConfigured} />
      </main>
    </>
  )
}
