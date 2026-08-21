// Latest breaks (§16.12): newest *indexed* first, one entry per operation,
// sole-first records excluded — the section can never lead with three
// sibling cohorts of one operation or with import-lagged observation dates.
import { describe, expect, it } from "vitest"
import type { LedgerHolder } from "./ledger-model"
import { latestBreaks } from "./ledger-model"

const metric = (value: number) => ({
  metric: "latency",
  unit: "ns",
  statistic: "median" as const,
  value,
  sampleCount: null,
  uncertainty: null,
})

const holder = (
  slug: string,
  cohort: string,
  displaced: boolean,
): LedgerHolder =>
  ({
    cohortKey: cohort,
    operation: { name: slug, slug },
    workloadSummary: "bf16",
    hardware: "GPU",
    environmentSummary: "",
    since: "2026-06-01T00:00:00Z",
    indexedAt: "2026-08-20T00:00:00Z",
    current: { runId: cohort } as LedgerHolder["current"],
    history: [
      {
        at: "2026-06-06T00:00:00Z",
        runId: cohort,
        implementation: { name: "impl", slug: "impl" },
        value: metric(100),
        previousValue: displaced ? metric(120) : null,
        improvementPct: displaced ? 16.7 : null,
      },
    ],
  }) as LedgerHolder

describe("latestBreaks", () => {
  it("dedupes by operation and skips sole-first records", () => {
    const latest = latestBreaks([
      holder("nvfp4-gemm", "a", true),
      holder("nvfp4-gemm", "b", true),
      holder("first-only", "c", false),
      holder("rmsnorm", "d", true),
      holder("softmax", "e", true),
      holder("rope", "f", true),
    ])
    expect(latest.map((entry) => entry.holder.operation.slug)).toEqual([
      "nvfp4-gemm",
      "rmsnorm",
      "softmax",
    ])
  })

  it("keeps the input's indexed-time order, never re-sorting by observed", () => {
    const older = holder("gemm", "a", true)
    older.indexedAt = "2026-08-01T00:00:00Z"
    older.history[0].at = "2026-08-19T00:00:00Z"
    const newer = holder("attention", "b", true)
    newer.history[0].at = "2026-06-06T00:00:00Z"
    // Backend order is indexed-time descending: newer-indexed arrives first.
    const latest = latestBreaks([newer, older])
    expect(latest[0].holder.operation.slug).toBe("attention")
  })
})
