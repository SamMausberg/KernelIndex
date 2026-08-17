"use client"

// The single-page submission flow (§15.5): paste a manifest document,
// preview the canonical digests and validation report, then submit for
// review. The preview never promises ranking — comparability is evaluated
// at review and publication.
import { useActionState } from "react"
import { countNoun } from "@/lib/format"
import { type SubmitState, submitAction, validateAction } from "./actions"

const INITIAL: SubmitState = {
  report: null,
  submittedId: null,
  error: null,
  text: "",
}

export function SubmitForm({
  signedIn,
  signInAvailable,
}: {
  signedIn: boolean
  /** False when the deployment has no OAuth app; the PR path still works. */
  signInAvailable: boolean
}) {
  const [validated, validate, validating] = useActionState(
    validateAction,
    INITIAL,
  )
  const [submitted, submit, submitting] = useActionState(submitAction, INITIAL)
  const state =
    submitted.report !== null || submitted.error ? submitted : validated

  return (
    <>
      <form className="mt-4">
        <textarea
          name="document"
          defaultValue={state.text || undefined}
          rows={18}
          spellCheck={false}
          placeholder={`projects:\n  - apiVersion: kernelindex.dev/v1alpha1\n    kind: SoftwareProject\n    …\nruns:\n  - run: { … }\n    protocol: { … }\n    environment: { … }`}
          className="well w-full px-4 py-3 font-mono text-[12.5px] leading-relaxed outline-none"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            formAction={validate}
            disabled={validating}
            className="key h-[30px] cursor-pointer px-4 text-[12.5px] hover:text-fg"
          >
            Validate
          </button>
          <button
            type="submit"
            formAction={submit}
            disabled={submitting || !signedIn}
            className="key-primary h-[30px] cursor-pointer px-4 text-[12.5px] disabled:cursor-not-allowed disabled:border-border-strong disabled:text-ghost"
          >
            Submit for review
          </button>
          {!signedIn && (
            <span className="text-[12.5px] text-faint">
              {signInAvailable
                ? "Sign in to submit."
                : "Sign-in is not set up here. Use the PR path instead."}
            </span>
          )}
        </div>
      </form>

      {state.error && (
        <p className="mt-4 text-[13px] text-warning">{state.error}</p>
      )}
      {state.submittedId && (
        <p className="mt-4 text-[13px] text-success">
          Submitted for review · {state.submittedId}
        </p>
      )}
      {state.report && (
        <div className="plate mt-5 px-4 py-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-line pb-2.5">
            <div className="text-[11.5px] tracking-[0.03em] text-faint uppercase">
              Validation report
            </div>
            <div className="font-mono text-[12px]">
              {state.report.valid ? (
                <span className="text-success">
                  valid · {countNoun(state.report.objects.length, "object")}
                </span>
              ) : (
                <span className="text-warning">
                  {countNoun(state.report.issues.length, "issue")}
                </span>
              )}
            </div>
          </div>
          {state.report.issues.map((issue) => (
            <p
              key={issue}
              className="mt-1.5 font-mono text-[12px] text-warning"
            >
              {issue}
            </p>
          ))}
          {state.report.objects.map((object) => (
            <p
              key={object.digest}
              className="mt-1.5 font-mono text-[12px] text-subtle"
            >
              {object.kind} · {object.name} ·{" "}
              <span className="text-faint">{object.digest.slice(0, 23)}…</span>
            </p>
          ))}
          <p className="mt-3 text-[12.5px] text-faint">
            {state.report.valid
              ? "Valid. A reviewer still checks comparability and identity — valid never promises a rank."
              : "Fix the issues above and validate again."}
          </p>
        </div>
      )}
    </>
  )
}
