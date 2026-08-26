// The wire is lossless: decode(encode(model)) is the model, derived fields
// included, so the island sees exactly what the server rendered from.
import { describe, expect, it } from "vitest"
import type { LedgerHolder, LedgerModel } from "./ledger-model"
import { decodeLedger, encodeLedger } from "./ledger-wire"

const cohort = (key: string) => `sha256:${key.repeat(64)}`
const metric = (value: number, uncertainty = false) => ({
  metric: "latency",
  unit: "ns",
  statistic: "median",
  value,
  sampleCount: uncertainty ? 100 : null,
  uncertainty: uncertainty ? { low: value - 1, high: value + 1 } : null,
})
const impl = (slug: string) => ({ name: slug.toUpperCase(), slug })

function holder(cohortKey: string, values: number[]): LedgerHolder {
  const history = values.map((value, i) => {
    const previous = values[i + 1]
    return {
      at: `2026-08-0${i + 1}T00:00:00.000Z`,
      runId: `${cohortKey}-${i}`,
      implementation: impl(i % 2 ? "b" : "a"),
      value: metric(value, i === 0),
      previousValue: previous === undefined ? null : metric(previous),
      improvementPct:
        previous === undefined ? null : ((previous - value) / previous) * 100,
    }
  })
  return {
    cohortKey: cohort(cohortKey),
    operation: { name: "GEMM", slug: "gemm" },
    workloadId: `w-${cohortKey}`,
    workloadSummary: "[4096,4096] bf16",
    hardware: "NVIDIA B200",
    environmentSummary: "CUDA 13",
    current: {
      runId: history[0].runId,
      implementation: history[0].implementation,
      project: { name: "Proj", slug: "proj" },
      primary: history[0].value,
      solScore: cohortKey === "x" ? 0.5 : null,
      baseline: false,
      evidence: "reported",
      sourceAvailable: true,
      installable: false,
      license: { declared: "MIT", concluded: null },
    },
    since: history[0].at,
    indexedAt: "2026-08-20T00:00:00.000Z",
    history,
  }
}

describe("ledger wire", () => {
  it("round-trips the model, deriving previous values and margins", () => {
    const model: LedgerModel = {
      illustrative: false,
      hardwareOptions: ["NVIDIA B200"],
      asOf: "2026-08-26T00:00:00.000Z",
      records: [holder("x", [90, 100, 120]), holder("y", [7])],
    }
    const wire = encodeLedger(model)
    // Shared names, slugs, and metric shapes are stored once.
    expect(wire.refs).toHaveLength(4)
    expect(wire.metrics).toHaveLength(1)
    expect(decodeLedger(JSON.parse(JSON.stringify(wire)))).toEqual(model)
  })
})
