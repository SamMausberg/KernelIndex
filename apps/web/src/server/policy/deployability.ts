// Deployability policy v2 (§8.15, §11.8): a filter and explanation layer,
// never a hidden multiplier on rank. Returns eligibility plus a reason
// vector so every exclusion is explainable. v2 (2026-08-25) added the
// pinned-install requirement: a command that cannot be shown to resolve to
// the measured code no longer counts as usable.
export const DEPLOYABILITY_POLICY_VERSION = "deployability-v2"

/** Reviewed permissive allowlist for the `license:permissive` filter. */
const PERMISSIVE_LICENSES = new Set([
  "Apache-2.0",
  "MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "Zlib",
  "BSL-1.0",
])

export type DeployabilityFacts = {
  sourceAvailable: boolean
  installable: boolean
  /** The install command resolves to the measured code (§8.15). */
  installPinned: boolean
  licenseConcluded: string | null
}

/** Default policy: public source, an install recipe pinned to the measured
 * revision, and a known license. */
export function deployability(facts: DeployabilityFacts): {
  eligible: boolean
  reasons: string[]
} {
  const reasons: string[] = []
  if (!facts.sourceAvailable) reasons.push("NO_PUBLIC_SOURCE")
  if (!facts.installable) reasons.push("NO_INSTALL_RECIPE")
  else if (!facts.installPinned) reasons.push("INSTALL_UNPINNED")
  if (facts.licenseConcluded === null) reasons.push("LICENSE_UNKNOWN")
  return { eligible: reasons.length === 0, reasons }
}

export function isPermissiveLicense(concluded: string | null): boolean {
  return concluded !== null && PERMISSIVE_LICENSES.has(concluded)
}

/** Case-insensitive match for a `license:<value>` filter (§12.2). */
export function licenseMatches(
  filter: string,
  concluded: string | null,
): boolean {
  if (filter === "permissive") return isPermissiveLicense(concluded)
  if (filter === "unknown") return concluded === null
  return concluded !== null && concluded.toLowerCase() === filter
}
