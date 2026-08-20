// Liger importer goldens (§21.3): CSV parsing against a committed real
// slice, curation guards, and (with a database) reconcile → publish inside
// a rolled-back transaction.
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { publishBundle } from "../../catalog/publication.ts"
import { db } from "../../db/client.ts"
import { parseCsv, parseRows } from "./discover.ts"
import { KERNELS_BY_NAME } from "./kernels.ts"
import { reconcileLiger } from "./reconcile.ts"

const slice = readFileSync(
  path.resolve(
    import.meta.dirname,
    "__fixtures__/all-benchmark-data-slice.csv",
  ),
  "utf8",
)

describe("liger csv parsing", () => {
  it("parses quoted JSON config fields and validates the header", () => {
    const outcome = parseRows(slice, "fx")
    expect(outcome.issues).toHaveLength(0)
    expect(outcome.rows).toHaveLength(9)
    const config = JSON.parse(outcome.rows[0].extra_benchmark_config_str)
    expect(config).toEqual({ M: 2048, dtype: "torch.bfloat16", eps: 1e-6 })
  })

  it("keeps doubled quotes and rejects ragged records", () => {
    expect(parseCsv('a,"x ""y"", z",c\n')).toEqual([["a", 'x "y", z', "c"]])
    const broken = `${slice.split("\n")[0]}\na,b\n`
    const outcome = parseRows(broken, "fx")
    expect(outcome.rows).toHaveLength(0)
    expect(outcome.issues[0].problem).toContain("expected 15 fields")
  })
})

describe("liger curation", () => {
  it("binds era-specific configs and rejects unknown shapes", () => {
    const rms = KERNELS_BY_NAME.get("rms_norm")
    if (!rms) throw new Error("rms_norm curation missing")
    expect(
      rms.bind(1024, "H", { M: 2048, dtype: "torch.bfloat16", eps: 1e-6 }),
    ).toEqual({
      axes: { rows: 2048, hidden: 1024 },
      dtype: "bf16",
      scalars: { eps: 1e-6 },
    })
    // The current-era config (hidden_size, no M) is a different script; the
    // row skips instead of guessing which shape it meant.
    expect(
      rms.bind(2048, "BT", { hidden_size: 4096, dtype: "torch.bfloat16" }),
    ).toBeNull()

    const rope = KERNELS_BY_NAME.get("rope")
    if (!rope) throw new Error("rope curation missing")
    const bound = rope.bind(512, "H", {
      dtype: "torch.bfloat16",
      seq_len: 2048,
      num_q_heads: 32,
      num_kv_heads: 8,
    })
    expect(bound?.axes).toEqual({
      seq: 2048,
      hidden: 512,
      q_heads: 32,
      kv_heads: 8,
    })
  })
})

const url = process.env.DATABASE_URL

describe.skipIf(!url)("liger import pipeline (database)", () => {
  class Rollback extends Error {}

  it("reconciles the slice and publishes idempotently", async () => {
    const parsed = parseRows(slice, "fx")
    await db()
      .transaction(async (tx) => {
        const { bundle, report } = await reconcileLiger(tx, {
          commit: "2120862ba532c9449e72d603ba6324310ae756e7",
          rows: parsed.rows,
          snapshots: [],
          issues: [],
          driftWarnings: [],
        })
        // 9 rows: 8 curated speed rows import (fused_moe joined the curation
        // 2026-08-20); the memory row is counted, never guessed.
        expect(report.skipped.memoryRows).toBe(1)
        expect(report.skipped.uncuratedKernels).toEqual({})
        expect(report.issues).toHaveLength(0)
        expect(bundle.operations.map((op) => op.slug).sort()).toEqual([
          "liger-embedding",
          "liger-fused-add-rms-norm",
          "liger-fused-moe",
          "liger-rms-norm",
          "liger-rope",
        ])
        expect(bundle.runs).toHaveLength(8)
        // fp32 H100 rows and bf16 A100 rows land in separate cohorts: the
        // workload dtype and the environment digest both differ.
        const workloadTitles = bundle.workloads.map(
          (workload) => workload.manifest.metadata.title,
        )
        expect(workloadTitles.some((title) => title?.includes("bf16"))).toBe(
          true,
        )
        expect(workloadTitles.some((title) => title?.includes("fp32"))).toBe(
          true,
        )

        // The dev catalog may already hold some of these append-only runs;
        // what must hold is full coverage, then exact idempotency.
        const first = await publishBundle(tx, bundle, { publish: true })
        expect(first.counts.runs.inserted + first.counts.runs.existing).toBe(8)
        const again = await publishBundle(tx, bundle, { publish: true })
        expect(again.counts.runs).toEqual({ inserted: 0, existing: 8 })
        throw new Rollback("rollback")
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error
      })
  })
})
