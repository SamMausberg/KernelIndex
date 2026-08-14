// Comparison cohort identity (§11.1). A result is comparable only inside a
// declared cohort; hardware names or operation labels alone never establish
// comparability. The implementation is deliberately not part of the key —
// implementations are what the cohort compares.
import canonicalize from "canonicalize"
import { type Digest, sha256Digest } from "../identity/digest.ts"

function digestOf(value: unknown): Digest {
  const canonical = canonicalize(value)
  if (canonical === undefined) throw new Error("value is not canonicalizable")
  return sha256Digest(canonical)
}

/** Key over a workload's correctness policy body. */
export function correctnessKey(correctness: unknown): Digest {
  return digestOf({ correctness })
}

/** Measurement definition key, e.g. latency/median in nanoseconds. */
export function metricKey(
  metric: string,
  statistic: string,
  unit: string,
): string {
  return `${metric}:${statistic}:${unit}`
}

export type CohortParts = {
  operationDigest: string
  workloadDigest: string
  protocolKey: string
  environmentKey: string
  correctnessKey: string
  metricKey: string
}

/** Strict kernel cohort key (§11.1). */
export function comparisonKey(parts: CohortParts): Digest {
  return digestOf({
    v: 1,
    operation: parts.operationDigest,
    workload: parts.workloadDigest,
    protocol: parts.protocolKey,
    environment: parts.environmentKey,
    correctness: parts.correctnessKey,
    metric: parts.metricKey,
  })
}
