import { describe, expect, it } from "vitest"
import { comparisonKey, correctnessKey, metricKey } from "./comparison.ts"
import { concludeLicense } from "./licensing.ts"
import { evidenceLevel } from "./trust.ts"

describe("licensing", () => {
  it("normalizes valid SPDX with case correction", () => {
    expect(concludeLicense("apache-2.0")).toEqual({
      declared: "apache-2.0",
      concluded: "Apache-2.0",
    })
    expect(concludeLicense("MIT OR BSD-3-Clause").concluded).toBe(
      "MIT OR BSD-3-Clause",
    )
  })

  it("concludes unknown for invalid or missing expressions", () => {
    expect(concludeLicense("Totally Custom License").concluded).toBeNull()
    expect(concludeLicense(undefined)).toEqual({
      declared: null,
      concluded: null,
    })
  })
})

describe("comparison keys", () => {
  const parts = {
    operationDigest: "sha256:aa",
    workloadDigest: "sha256:bb",
    protocolKey: "sha256:cc",
    environmentKey: "sha256:dd",
    correctnessKey: correctnessKey({ comparator: "elementwise_close" }),
    metricKey: metricKey("latency", "median", "ns"),
  }

  it("is deterministic and sensitive to every part", () => {
    expect(comparisonKey(parts)).toBe(comparisonKey({ ...parts }))
    expect(comparisonKey({ ...parts, environmentKey: "sha256:ee" })).not.toBe(
      comparisonKey(parts),
    )
    expect(comparisonKey({ ...parts, workloadDigest: "sha256:ee" })).not.toBe(
      comparisonKey(parts),
    )
  })
})

describe("trust derivation", () => {
  const base = {
    reproducedByKernelindex: false,
    independentReplicationCount: 0,
    sourceAvailable: true,
    installable: true,
    hasRawEvidence: true,
    identityComplete: true,
  }

  it("caps imported evidence at reproducible", () => {
    expect(evidenceLevel(base)).toBe("reproducible")
  })

  it("degrades to reported without source or raw evidence", () => {
    expect(evidenceLevel({ ...base, sourceAvailable: false })).toBe("reported")
    expect(evidenceLevel({ ...base, hasRawEvidence: false })).toBe("reported")
  })

  it("requires a controlled rerun for verified and two runners for replicated", () => {
    expect(evidenceLevel({ ...base, reproducedByKernelindex: true })).toBe(
      "verified",
    )
    expect(
      evidenceLevel({
        ...base,
        reproducedByKernelindex: true,
        independentReplicationCount: 2,
      }),
    ).toBe("replicated")
  })
})
