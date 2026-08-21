// The model page's per-operation resolution: cohort selection, ranking, and
// the deployable pick. Pure derivation over crafted joined rows — the SQL
// around it reuses the already-tested eligibility and projection helpers.
import { describe, expect, it } from "vitest"
import { bestKnown } from "./model-reads.ts"

const OPERATION = { name: "rmsnorm", slug: "rmsnorm-h4096" }

/** Minimal joined row; overrides shape the scenario. */
function row(
  id: string,
  cohort: string,
  latencyNs: number | null,
  overrides: { deployable?: boolean; sourceNative?: boolean } = {},
) {
  const deployable = overrides.deployable ?? true
  return {
    run: {
      id,
      observedAt: new Date("2026-08-01T00:00:00Z"),
      publishedAt: new Date("2026-08-02T00:00:00Z"),
      comparisonKey: cohort,
      protocolKey: "proto",
      environmentKey: "env",
      hardwareModel: "NVIDIA B200",
      hardwareArchitecture: "sm_100",
      cudaMajor: 13,
      primaryMetric: "latency",
      primaryValue: latencyNs,
      primaryUnit: "ns",
      primaryStatistic: "median",
      sampleCount: 100,
      uncertaintyLow: null,
      uncertaintyHigh: null,
      reproducedByKernelindex: false,
      independentReplicationCount: 0,
      sourceAvailable: deployable,
      installable: deployable,
      licenseExpression: deployable ? "MIT" : null,
      hasRawEvidence: true,
      sourceNative: overrides.sourceNative ?? false,
      environmentSummary: null,
      solScore: null,
    },
    implementation: {
      id: `impl-${id}`,
      slug: `impl-${id}`,
      sourceRevision: null,
      language: "cuda",
      framework: null,
      title: null,
      installKind: deployable ? "pip" : null,
      installCommand: deployable ? "pip install x" : null,
      licenseDeclared: deployable ? "MIT" : null,
      sourceAvailable: deployable,
      installable: deployable,
      licenseExpression: deployable ? "MIT" : null,
      role: null,
    },
    project: { name: "Proj", slug: "proj" },
    workload: {
      id: `wl-${cohort}`,
      dtypes: ["bf16"],
      shapeSummary: "[2048, 4096]",
    },
    source: { slug: "src", kind: "leaderboard", name: "Source" },
    operation: { id: "op-1", slug: OPERATION.slug, name: OPERATION.name },
  }
}

type Rows = Parameters<typeof bestKnown>[0]

describe("bestKnown", () => {
  it("resolves inside the cohort with the most rankable evidence", () => {
    const rows = [
      row("a1", "cohort-a", 900),
      row("b1", "cohort-b", 500),
      row("b2", "cohort-b", 600),
    ] as Rows
    const entry = bestKnown(rows, OPERATION, "rmsnorm")
    expect(entry?.cohort.comparisonKey).toBe("cohort-b")
    expect(entry?.fastest.runId).toBe("b1")
    expect(entry?.fastest.rank).toBe(1)
    expect(entry?.alternatives).toBe(1)
    expect(entry?.workloadId).toBe("wl-cohort-b")
  })

  it("picks the fastest deployable entry when the leader fails the policy", () => {
    const rows = [
      row("fast", "c", 500, { deployable: false }),
      row("deploy", "c", 600),
    ] as Rows
    const entry = bestKnown(rows, OPERATION, "rmsnorm")
    expect(entry?.fastest.runId).toBe("fast")
    expect(entry?.deployable?.runId).toBe("deploy")
  })

  it("returns a null deployable when nothing in the cohort passes", () => {
    const rows = [
      row("x1", "c", 500, { deployable: false }),
      row("x2", "c", 600, { deployable: false }),
    ] as Rows
    const entry = bestKnown(rows, OPERATION, "rmsnorm")
    expect(entry?.deployable).toBeNull()
  })

  it("returns null when no row carries a primary value", () => {
    expect(
      bestKnown([row("n1", "c", null)] as Rows, OPERATION, "rmsnorm"),
    ).toBeNull()
  })

  it("labels a source-native cohort as such", () => {
    const entry = bestKnown(
      [row("s1", "c", 500, { sourceNative: true })] as Rows,
      OPERATION,
      "rmsnorm",
    )
    expect(entry?.cohort.profile).toBe("source_native")
  })
})
