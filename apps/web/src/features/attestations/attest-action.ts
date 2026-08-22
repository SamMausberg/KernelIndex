"use server"

// Attestation intake (§15.6): signed-in only, so the session is the gate;
// validation and the daily cap live in the server module. A filed note
// drops the catalog caches so the run page shows it at once.
import { revalidateTag } from "next/cache"
import { headers } from "next/headers"
import { fileAttestation } from "@/server/attestations"
import { sessionUser } from "@/server/policy/authorization"

export type AttestState = { message: string; signIn?: boolean; filed?: boolean }

const NS_PER: Record<string, number> = { ns: 1, us: 1e3, ms: 1e6 }

export async function attestAction(
  _previous: AttestState,
  formData: FormData,
): Promise<AttestState> {
  const user = await sessionUser(await headers())
  if (user === null) return { message: "", signIn: true }
  const raw = String(formData.get("observed") ?? "").trim()
  const factor = NS_PER[String(formData.get("unit") ?? "us")] ?? 1e3
  const observedNs = raw === "" ? null : Number(raw) * factor
  const runId = String(formData.get("runId") ?? "")
  const error = await fileAttestation({
    runId,
    type: String(formData.get("type") ?? ""),
    body: String(formData.get("body") ?? ""),
    evidenceUrl: String(formData.get("evidenceUrl") ?? ""),
    observedNs,
    environmentSummary: String(formData.get("environment") ?? ""),
    user: { id: user.id, name: user.name },
  })
  if (error !== null) return { message: error }
  revalidateTag("catalog", "max")
  return { message: "Filed. It is on the page now.", filed: true }
}
