// Trust is derived from stored evidence facts, never chosen by a submitter
// (§8.14). Before a controlled runner exists, imported records can reach at
// most "reproducible"; "verified" requires a KernelIndex-controlled rerun.
import type { EvidenceLevel } from "../../lib/catalog-models.ts"

export type TrustFacts = {
  reproducedByKernelindex: boolean
  independentReplicationCount: number
  sourceAvailable: boolean
  installable: boolean
  /** Raw samples, logs, or an equivalent rerunnable evidence artifact. */
  hasRawEvidence: boolean
  /** Exact revision, workload, protocol, and environment are all present. */
  identityComplete: boolean
}

export function evidenceLevel(facts: TrustFacts): EvidenceLevel {
  if (facts.independentReplicationCount >= 2) return "replicated"
  if (facts.reproducedByKernelindex) return "verified"
  if (facts.sourceAvailable && facts.identityComplete && facts.hasRawEvidence) {
    return "reproducible"
  }
  return "reported"
}
