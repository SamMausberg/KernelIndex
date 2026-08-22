"use client"

import { usePathname } from "next/navigation"
import { useActionState } from "react"
import { Select } from "@/components/select"
import { type AttestState, attestAction } from "./attest-action"

const TYPES = [
  { value: "reproduced", label: "reproduced it" },
  { value: "could_not_reproduce", label: "could not reproduce it" },
  { value: "environment_note", label: "environment note" },
  { value: "regression_observed", label: "regression observed" },
]
const UNITS = [
  { value: "us", label: "µs" },
  { value: "ns", label: "ns" },
  { value: "ms", label: "ms" },
]

/** §16.10 Replications intake: a native disclosure, closed it is one line,
 * open it is the typed form. Signed-out readers get a sign-in link that
 * returns here. Attestations never change the evidence level. */
export function AttestForm({ runId }: { runId: string }) {
  const pathname = usePathname()
  const [state, action, pending] = useActionState(attestAction, {
    message: "",
  } as AttestState)
  if (state.filed)
    return <p className="text-small text-subtle">{state.message}</p>
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-small text-faint transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
        Add a reproduction or note{" "}
        <span aria-hidden="true" className="group-open:hidden">
          +
        </span>
      </summary>
      <form action={action} className="mt-3 max-w-[560px] space-y-3">
        <input type="hidden" name="runId" value={runId} />
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-small text-subtle">I</span>
          <Select
            name="type"
            ariaLabel="Attestation type"
            options={TYPES}
            defaultValue="reproduced"
            className="w-[240px]"
          />
        </div>
        <textarea
          name="body"
          required
          rows={3}
          maxLength={2000}
          placeholder="what you ran, what you saw, and how it compares"
          aria-label="Attestation"
          className="well w-full px-2.5 py-2 font-mono text-small outline-none"
        />
        <div className="flex flex-wrap items-center gap-3">
          <span className="well flex h-8 w-[150px] items-center gap-1 px-2">
            <input
              name="observed"
              inputMode="decimal"
              placeholder="measured"
              aria-label="Measured value"
              className="w-full min-w-0 bg-transparent font-mono text-small outline-none"
            />
          </span>
          <Select
            name="unit"
            ariaLabel="Unit"
            options={UNITS}
            defaultValue="us"
            className="w-[72px]"
          />
          <input
            name="environment"
            maxLength={200}
            placeholder="GPU · CUDA · framework (optional)"
            aria-label="Environment"
            className="well w-[300px] px-2.5 py-1.5 font-mono text-small outline-none"
          />
        </div>
        <input
          name="evidenceUrl"
          type="url"
          placeholder="evidence URL (optional, https)"
          aria-label="Evidence URL"
          className="well w-[300px] px-2.5 py-1.5 font-mono text-small outline-none"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="key cursor-pointer px-3 py-1 text-small hover:text-fg"
          >
            File attestation
          </button>
          {state.signIn ? (
            <a
              href={`/signin?next=${encodeURIComponent(pathname)}`}
              className="text-small"
            >
              Sign in to attest →
            </a>
          ) : (
            state.message && (
              <span className="text-small text-warning">{state.message}</span>
            )
          )}
        </div>
        <p className="text-small leading-relaxed text-faint">
          Published under your account name. Community attestations never change
          the evidence level; a maintainer can hide abuse.
        </p>
      </form>
    </details>
  )
}
