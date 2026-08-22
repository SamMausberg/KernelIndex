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
      <ContextHeader
        title="Submit evidence"
        context="one YAML document · validated · reviewed before publication"
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
        <p className="mt-1.5 max-w-[72ch] text-body text-subtle">
          Paste one YAML document of <a href="/docs#data">manifests</a>, or one
          flat bench record as JSON (
          <a href="https://github.com/SamMausberg/KernelIndex/blob/main/registry/examples/bench-record.json">
            example
          </a>
          ) — the record assembles into the same manifests with every digest
          computed. Validate shows what was parsed and where each run would
          land; Submit queues it for review. From the terminal:{" "}
          <span className="font-mono text-small">ki submit record.json</span>.
          Prefer a PR? A file under registry/submissions goes through the same
          review.
        </p>
      </ContextHeader>
      <main className="shell-narrow pb-24">
        <SubmitForm signedIn={user !== null} signInAvailable={authConfigured} />
      </main>
    </>
  )
}
