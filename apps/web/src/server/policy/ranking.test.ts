// Ranking policy vectors (§11.5): ties, noise boundaries, deterministic
// ordering, and eligibility reason codes are frozen behavior for ranking-v1.
import { describe, expect, it } from "vitest"
import { deployability, licenseMatches } from "./deployability.ts"
import { eligibilityReasons, type RankInput, rankCohort } from "./ranking.ts"

const run = (
  id: string,
  value: number,
  interval: [number, number] | null,
  evidence: RankInput["evidence"] = "reproducible",
  observedAt = "2026-08-01T00:00:00Z",
): RankInput => ({
  id,
  value,
  interval: interval ? { low: interval[0], high: interval[1] } : null,
  evidence,
  observedAt: new Date(observedAt),
})

describe("eligibilityReasons", () => {
  const eligible = {
    status: "passed",
    published: true,
    retracted: false,
    superseded: false,
    primaryValue: 100,
  }

  it("returns no reasons for an eligible run", () => {
    expect(eligibilityReasons(eligible)).toEqual([])
  })

  it("returns one structured code per failed criterion", () => {
    expect(
      eligibilityReasons({
        ...eligible,
        status: "runtime_error",
        retracted: true,
        primaryValue: null,
      }),
    ).toEqual(["STATUS_RUNTIME_ERROR", "RETRACTED", "MISSING_PRIMARY_METRIC"])
    expect(eligibilityReasons({ ...eligible, superseded: true })).toEqual([
      "SUPERSEDED",
    ])
  })
})

describe("rankCohort", () => {
  it("assigns dense ranks with overlapping intervals tied", () => {
    const ranked = rankCohort(
      [
        run("a", 7810, [7788, 7841]),
        run("b", 8120, [8095, 8151]),
        run("c", 8138, [8092, 8177]), // overlaps b → tied at rank 2
        run("d", 9480, [9433, 9542]),
      ],
      "strict_exact",
    )
    expect(ranked.map((entry) => [entry.id, entry.rank])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 2],
      ["d", 3],
    ])
    expect(ranked[2].tiedWithPrevious).toBe(true)
    expect(ranked[1].tiedWithPrevious).toBe(false)
  })

  it("declares no tie when either interval is missing and values differ", () => {
    const ranked = rankCohort(
      [run("a", 100, null), run("b", 101, [95, 108])],
      "strict_exact",
    )
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 2])
  })

  it("ties equal values even without intervals", () => {
    const ranked = rankCohort(
      [run("a", 100, null), run("b", 100, null)],
      "strict_exact",
    )
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 1])
  })

  it("keeps source-native order strict unless values are equal", () => {
    const ranked = rankCohort(
      [run("a", 100, [90, 130]), run("b", 101, [95, 140])],
      "source_native",
    )
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 2])
  })

  it("orders a tie chain by trust, recency, then stable id, display only", () => {
    const ranked = rankCohort(
      [
        run("newer", 100, [95, 105], "reported", "2026-08-02T00:00:00Z"),
        run("older", 101, [96, 106], "reported", "2026-08-01T00:00:00Z"),
        run("trusted", 102, [97, 107], "verified", "2026-07-01T00:00:00Z"),
      ],
      "strict_exact",
    )
    expect(ranked.map((entry) => entry.id)).toEqual([
      "trusted",
      "newer",
      "older",
    ])
    expect(ranked.every((entry) => entry.rank === 1)).toBe(true)
  })

  it("does not chain ties transitively through an intermediate run", () => {
    // a~b overlap, b~c overlap, but a and c do not: c starts a new chain.
    const ranked = rankCohort(
      [
        run("a", 100, [98, 103]),
        run("b", 103, [101, 106]),
        run("c", 106, [104, 109]),
      ],
      "strict_exact",
    )
    expect(ranked.map((entry) => [entry.id, entry.rank])).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 2],
    ])
  })
})

describe("deployability", () => {
  it("returns reason codes, never a blended score", () => {
    expect(
      deployability({
        sourceAvailable: false,
        installable: false,
        installPinned: false,
        licenseConcluded: null,
      }).reasons,
    ).toEqual(["NO_PUBLIC_SOURCE", "NO_INSTALL_RECIPE", "LICENSE_UNKNOWN"])
    expect(
      deployability({
        sourceAvailable: true,
        installable: true,
        installPinned: true,
        licenseConcluded: "Apache-2.0",
      }).eligible,
    ).toBe(true)
    // v2: an install that cannot be shown to resolve to the measured code
    // is a stated command, not a usable answer.
    expect(
      deployability({
        sourceAvailable: true,
        installable: true,
        installPinned: false,
        licenseConcluded: "Apache-2.0",
      }).reasons,
    ).toEqual(["INSTALL_UNPINNED"])
  })

  it("matches license filters case-insensitively with a permissive class", () => {
    expect(licenseMatches("permissive", "Apache-2.0")).toBe(true)
    expect(licenseMatches("permissive", "AGPL-3.0-only")).toBe(false)
    expect(licenseMatches("apache-2.0", "Apache-2.0")).toBe(true)
    expect(licenseMatches("unknown", null)).toBe(true)
  })
})
