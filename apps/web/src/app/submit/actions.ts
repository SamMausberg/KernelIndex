"use server"

// Contribution server actions (§15.5): validation preview and submission,
// both behind the centralized authorization policy.
import { headers } from "next/headers"
import {
  bundleFromSubmission,
  createSubmission,
  type SubmissionReport,
} from "@/server/catalog/submissions"
import { canSubmit, sessionUser } from "@/server/policy/authorization"

export type SubmitState = {
  report: SubmissionReport | null
  submittedId: string | null
  error: string | null
  text: string
}

export async function validateAction(
  _previous: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const text = String(formData.get("document") ?? "")
  const { report } = bundleFromSubmission(text)
  return { report, submittedId: null, error: null, text }
}

export async function submitAction(
  _previous: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const text = String(formData.get("document") ?? "")
  const user = await sessionUser(await headers())
  if (!canSubmit(user) || user === null) {
    return {
      report: null,
      submittedId: null,
      error: "Sign in with GitHub to submit evidence.",
      text,
    }
  }
  const { id, report } = await createSubmission(user, text)
  return { report, submittedId: id, error: null, text }
}
