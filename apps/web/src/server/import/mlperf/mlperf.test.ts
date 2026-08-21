// MLPerf importer goldens (§21.3): scope classification, normalization
// stability against committed real slices, cohort separation, and (with a
// database) reconcile → publish inside a rolled-back transaction.
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { publishServingBundle } from "../../catalog/serving-publication.ts"
import { db } from "../../db/client.ts"
import { specDigest } from "../../identity/digest.ts"
import { classifyRow, type MlperfImportData } from "./discover.ts"
import {
  acceleratorOf,
  modelSlugOf,
  runFor,
  stackFor,
  workloadFor,
} from "./normalize.ts"
import { reconcileMlperf } from "./reconcile.ts"
import type { MlperfRow } from "./types.ts"
import { ROUNDS } from "./types.ts"

const fixtures = path.resolve(import.meta.dirname, "__fixtures__")
const slice = (name: string): unknown[] =>
  JSON.parse(readFileSync(path.join(fixtures, name), "utf8"))

const classified = (name: string) =>
  slice(name).reduce<{ rows: MlperfRow[]; skipped: Record<string, number> }>(
    (acc, entry) => {
      const outcome = classifyRow(entry)
      if (outcome.kind === "row") acc.rows.push(outcome.row)
      else if (outcome.kind === "skip")
        acc.skipped[outcome.reason] = (acc.skipped[outcome.reason] ?? 0) + 1
      return acc
    },
    { rows: [], skipped: {} },
  )

function importData(): MlperfImportData {
  const v6 = classified("summary-v6.0-slice.json")
  const v51 = classified("summary-v5.1-slice.json")
  return {
    rounds: [
      { round: ROUNDS[0], rows: v51.rows },
      { round: ROUNDS[1], rows: v6.rows },
    ],
    skipped: v6.skipped,
    snapshots: [],
    issues: [],
    driftWarnings: [],
  }
}

describe("mlperf classification", () => {
  it("keeps closed/datacenter token-throughput LLM rows, counts the rest", () => {
    const { rows, skipped } = classified("summary-v6.0-slice.json")
    expect(rows).toHaveLength(9)
    expect(skipped).toEqual({
      open_or_network_division: 1,
      non_datacenter_suite: 1,
      non_llm_benchmark: 2,
    })
    // v5.1 rows parse despite lacking the v6.0-only Total Accelerators field.
    expect(classified("summary-v5.1-slice.json").rows).toHaveLength(4)
  })
})

describe("mlperf normalization", () => {
  it("accuracy targets map to quality policy, never model identity", () => {
    expect(modelSlugOf("llama2-70b-99")).toBe("mlperf-llama2-70b")
    expect(modelSlugOf("llama2-70b-99.9")).toBe("mlperf-llama2-70b")
    expect(modelSlugOf("gpt-oss-120b")).toBe("mlperf-gpt-oss-120b")
  })

  it("parses accelerator vendor and strips the count suffix", () => {
    expect(acceleratorOf("AMD Instinct MI355X 288GB HBM3e (x87)")).toEqual({
      vendor: "amd",
      model: "AMD Instinct MI355X 288GB HBM3e",
    })
    expect(acceleratorOf("NVIDIA B200-SXM-180GB").vendor).toBe("nvidia")
  })

  it("titles the stack with the submitted Software string, never the slug", () => {
    const { rows } = classified("summary-v6.0-slice.json")
    const stack = stackFor(rows[0])
    expect(stack.manifest.metadata.title).toBe(rows[0].Software.trim())
    // The identity digest excludes metadata, so titles never fork the corpus.
    const untitled = structuredClone(stack.manifest)
    untitled.metadata = { name: untitled.metadata.name }
    expect(specDigest(untitled)).toBe(specDigest(stack.manifest))
  })

  it("placeholder Software strings fall back to the submitter", () => {
    const { rows } = classified("summary-v6.0-slice.json")
    const junk = { ...rows[0], Software: "TODO" }
    const stack = stackFor(junk)
    expect(stack.manifest.metadata.title).toBe(
      `${junk.Submitter} submission (software not stated)`,
    )
    // Identity still carries the raw string; only display falls back.
    expect(stack.manifest.spec.revision.version).toBe("TODO")
  })

  it("declares rules-cited SLOs on Server/Interactive, none on Offline", () => {
    const interactive = workloadFor("llama2-70b-99", "Interactive")
    expect(interactive.manifest.spec.slo).toEqual([
      {
        metric: "ttft_ms",
        statistic: "p99",
        operator: "<=",
        value: 450,
        unit: "ms",
      },
      {
        metric: "tpot_ms",
        statistic: "p99",
        operator: "<=",
        value: 40,
        unit: "ms",
      },
    ])
    expect(interactive.manifest.metadata.sourceRefs?.[0]?.url).toContain(
      "inference_policies",
    )
    const offline = workloadFor("llama2-70b-99", "Offline")
    expect(offline.manifest.spec.slo).toBeUndefined()
    expect(offline.manifest.spec.streaming).toBe(false)
    expect(offline.manifest.spec.loadGeneration).toBe("offline")
  })

  it("builds a stable, digestable run from a real row", () => {
    const { rows } = classified("summary-v6.0-slice.json")
    const row = rows[0]
    const run = runFor({
      row,
      round: ROUNDS[1],
      modelDigest: `sha256:${"1".repeat(64)}`,
      configurationDigest: `sha256:${"2".repeat(64)}`,
      workloadDigest: `sha256:${"3".repeat(64)}`,
    })
    expect(specDigest(run)).toBe(
      specDigest(
        runFor({
          row,
          round: ROUNDS[1],
          modelDigest: `sha256:${"1".repeat(64)}`,
          configurationDigest: `sha256:${"2".repeat(64)}`,
          workloadDigest: `sha256:${"3".repeat(64)}`,
        }),
      ),
    )
    expect(run.spec.measurements).toEqual([
      {
        metric: "output_token_throughput_tps",
        unit: "tokens_s",
        statistic: "reported",
        value: row.Performance_Result,
      },
    ])
    expect(run.spec.sourceNative?.externalId).toBe(`v6.0/${row.ID}`)
    expect(run.spec.topology.acceleratorsPerNode).toBe(row["a#"])
  })
})

const url = process.env.DATABASE_URL

describe.skipIf(!url)("mlperf import pipeline (database)", () => {
  class Rollback extends Error {}

  it("reconciles and publishes idempotently with separated cohorts", async () => {
    const data = importData()
    await db()
      .transaction(async (tx) => {
        const { bundle, report } = await reconcileMlperf(tx, data)
        expect(report.issues).toHaveLength(0)
        // -99 and -99.9 share one model revision; scenarios split workloads.
        expect(bundle.models.length).toBeLessThan(bundle.workloads.length)
        expect(bundle.runs).toHaveLength(13)

        const first = await publishServingBundle(tx, bundle, {
          publish: true,
        })
        expect(first.counts.runs.inserted).toBe(13)
        const again = await publishServingBundle(tx, bundle, {
          publish: true,
        })
        expect(again.counts.runs).toEqual({ inserted: 0, existing: 13 })

        const { report: second } = await reconcileMlperf(tx, data)
        expect(
          second.proposed.every((object) => object.action === "exists"),
        ).toBe(true)

        // The §22.10 gate: same model+scenario+quality can only share a
        // cohort when topology matches too — count distinct cohort keys.
        const runs = await tx.query.servingRuns.findMany({
          columns: { cohortKey: true, scenario: true, qualityPolicy: true },
        })
        const cohorts = new Set(runs.map((run) => run.cohortKey))
        expect(cohorts.size).toBeGreaterThan(1)
        throw new Rollback("rollback")
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error
      })
  })
})
