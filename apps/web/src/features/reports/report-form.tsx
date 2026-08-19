"use client"

import { useActionState } from "react"
import { Select } from "@/components/select"
import { type ReportState, reportAction } from "./report-action"

const REASONS = [
  { value: "incorrect_result", label: "incorrect result or correctness" },
  { value: "wrong_attribution", label: "wrong attribution or provenance" },
  { value: "license_issue", label: "license or content problem" },
  { value: "comparability", label: "should not be comparable / ranked" },
  { value: "other", label: "other" },
]

/** §15.6 report action, present on every run dossier. A native disclosure:
 * closed it is one line, open it is a complete structured dispute form.
 * Accepted reports become retractions or supersessions — history stays. */
export function ReportForm({
  targetKind,
  targetId,
}: {
  targetKind: "run" | "serving_run"
  targetId: string
}) {
  const [state, action, pending] = useActionState(reportAction, {
    message: "",
  } as ReportState)
  if (state.filed)
    return <p className="text-small text-subtle">{state.message}</p>
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-small text-faint transition-colors hover:text-fg">
        Report an issue with this{" "}
        {targetKind === "serving_run" ? "serving run" : "run"}{" "}
        <span aria-hidden="true" className="group-open:hidden">
          +
        </span>
      </summary>
      <form action={action} className="mt-3 max-w-[560px] space-y-3">
        <input type="hidden" name="targetKind" value={targetKind} />
        <input type="hidden" name="targetId" value={targetId} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-small text-subtle" htmlFor="report-reason">
            Reason
          </label>
          <Select
            name="reason"
            ariaLabel="Report reason"
            options={REASONS}
            defaultValue="incorrect_result"
            className="w-[300px]"
          />
        </div>
        <textarea
          name="detail"
          required
          rows={4}
          maxLength={4000}
          placeholder="what is wrong, and how you can tell"
          aria-label="Report detail"
          className="well w-full px-2.5 py-2 font-mono text-small outline-none"
        />
        <div className="flex flex-wrap gap-3">
          <input
            name="evidenceUrl"
            type="url"
            placeholder="evidence URL (optional)"
            aria-label="Evidence URL"
            className="well w-[300px] px-2.5 py-1.5 font-mono text-small outline-none"
          />
          <input
            name="contact"
            placeholder="contact for follow-up (optional)"
            aria-label="Contact"
            className="well w-[240px] px-2.5 py-1.5 font-mono text-small outline-none"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="key cursor-pointer px-3 py-1 text-small hover:text-fg"
          >
            File report
          </button>
          {state.message && (
            <span className="text-small text-warning">{state.message}</span>
          )}
        </div>
        <p className="text-small leading-relaxed text-faint">
          A maintainer reviews every report. If accepted, the record is
          retracted or superseded — its history stays visible.
        </p>
      </form>
    </details>
  )
}
