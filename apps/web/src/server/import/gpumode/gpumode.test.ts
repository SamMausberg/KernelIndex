// GPU MODE importer goldens (§21.3): parsing and normalization stability
// against committed real snapshots, per-user selection, and (with a
// database) reconcile → publish inside a rolled-back transaction.
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { publishBundle } from "../../catalog/publication.ts"
import { db } from "../../db/client.ts"
import { specDigest } from "../../identity/digest.ts"
import type { GmImportData } from "./discover.ts"
import {
  caseFromBenchmark,
  implementationFromRow,
  kernelbotEnvironment,
  kernelbotProtocol,
  operationFromProblem,
  runFromBenchmark,
} from "./normalize.ts"
import {
  parseBenchmarkSpec,
  parseLeaderboards,
  parseRunResult,
  parseSubmissionRows,
} from "./parse.ts"
import { CURATED_PROBLEMS } from "./problems.ts"
import { reconcileKernelbot } from "./reconcile.ts"

const fixtures = path.resolve(import.meta.dirname, "__fixtures__")
const read = (relative: string) =>
  readFileSync(path.join(fixtures, relative), "utf8")

const fp8 = CURATED_PROBLEMS.find((p) => p.leaderboard === "amd-fp8-mm")
if (!fp8) throw new Error("fp8-mm curation missing")

describe("gpumode parsing", () => {
  it("parses leaderboards and ranked submission rows", () => {
    const boards = parseLeaderboards(read("api/leaderboards.json"), "fx")
    expect(boards.issues).toHaveLength(0)
    expect(boards.values.map((b) => b.name).sort()).toEqual([
      "amd-fp8-mm",
      "amd-mixture-of-experts",
      "amd-mla-decode",
    ])
    const rows = parseSubmissionRows(read("api/fp8-mm-top.json"), "fx")
    expect(rows.issues).toHaveLength(0)
    expect(rows.values).toHaveLength(2)
    expect(rows.values[0].run_passed).toBe(true)
  })

  it("unfolds the flattened run_result into per-shape ns benchmarks", () => {
    const row = parseSubmissionRows(read("api/fp8-mm-top.json"), "fx").values[0]
    const benchmarks = parseRunResult(row.run_result as Record<string, unknown>)
    expect(benchmarks).toHaveLength(3)
    expect(benchmarks[0].axes).toEqual({
      k: 7168,
      m: 1024,
      n: 1536,
      seed: 8135,
    })
    expect(benchmarks[0].meanNs).toBeGreaterThan(benchmarks[0].bestNs ?? 0)
    expect(benchmarks[0].runs).toBe(100)
  })

  it("accepts mean-only benchmarks (mla-decode recorded no best/worst)", () => {
    const benchmarks = parseRunResult({
      "benchmark-count": "1",
      "benchmark.0.spec":
        "dq: 1536; dim: 7168; seed: 5291; prefill: 6144; batchsize: 128",
      "benchmark.0.mean": "1905575.33",
      "benchmark.0.std": "7016.49",
      "benchmark.0.runs": "3",
    })
    expect(benchmarks[0].bestNs).toBeNull()
    expect(benchmarks[0].meanNs).toBeCloseTo(1905575.33)
  })

  it("rejects malformed benchmark specs instead of guessing", () => {
    expect(() => parseBenchmarkSpec("m: 12; junk")).toThrow("unparseable")
  })
})

describe("gpumode normalization", () => {
  it("builds a deterministic curated OperationSpec with model tags", () => {
    const first = operationFromProblem(fp8)
    const second = operationFromProblem(fp8)
    expect(specDigest(first.manifest)).toBe(specDigest(second.manifest))
    expect(first.slug).toBe("gpumode-amd-fp8-mm")
    expect(first.tags).toContain("model:deepseek-r1")
    expect(first.manifest.spec.inputs[0].tensor?.layout).toBe("col_major")
  })

  it("binds derived axes when building a workload case", () => {
    const operation = operationFromProblem(fp8)
    const manifest = caseFromBenchmark(fp8, specDigest(operation.manifest), {
      m: 1024,
      n: 1536,
      k: 7168,
      seed: 8135,
    })
    // a_scale is m × k//128; b_scale is n//128 × k//128.
    expect(manifest.spec.tensors.a_scale.shape).toEqual([1024, 56])
    expect(manifest.spec.tensors.b_scale.shape).toEqual([12, 56])
    expect(manifest.spec.tensors.a.dtype).toBe("fp8_e4m3fnuz")
  })

  it("maps one benchmark to a per-case reported run with runner labels", () => {
    const row = parseSubmissionRows(read("api/fp8-mm-top.json"), "fx").values[0]
    const benchmark = parseRunResult(
      row.run_result as Record<string, unknown>,
    )[0]
    const protocol = kernelbotProtocol()
    const environment = kernelbotEnvironment("MI300")
    const run = runFromBenchmark({
      row,
      problem: fp8,
      benchmark,
      implementationDigest: `sha256:${"1".repeat(64)}`,
      workloadDigest: `sha256:${"2".repeat(64)}`,
      protocol,
      protocolDigest: specDigest(protocol),
      environment,
      environmentDigest: specDigest(environment),
    })
    expect(run.manifest.spec.timing?.latencyNs.mean).toBe(
      Math.round(benchmark.meanNs),
    )
    expect(run.manifest.spec.timing?.samples).toBe(100)
    expect(run.manifest.metadata.labels?.torch).toContain("rocm")
    expect(run.manifest.spec.sourceNative?.source).toBe("gpumode-kernelbot")
  })

  it("declares no source license for submissions (reported-only)", () => {
    const row = parseSubmissionRows(read("api/fp8-mm-top.json"), "fx").values[0]
    const implementation = implementationFromRow(
      row,
      fp8,
      `sha256:${"3".repeat(64)}`,
      "MI300",
    )
    expect(implementation.manifest.spec.licensing).toEqual({})
  })
})

const url = process.env.DATABASE_URL

describe.skipIf(!url)("gpumode import pipeline (database)", () => {
  class Rollback extends Error {}

  it("reconciles, dedupes users, and publishes idempotently", async () => {
    const boards = parseLeaderboards(read("api/leaderboards.json"), "fx")
    const board = boards.values.find((b) => b.name === "amd-fp8-mm")
    if (!board) throw new Error("fixture board missing")
    const rows = parseSubmissionRows(read("api/fp8-mm-top.json"), "fx").values
    const data: GmImportData = {
      problems: [{ problem: fp8, board }],
      rows: new Map([["amd-fp8-mm", rows]]),
      snapshots: [],
      issues: [],
      driftWarnings: [],
    }
    await db()
      .transaction(async (tx) => {
        const { bundle, report } = await reconcileKernelbot(tx, data, {
          topPerBoard: 5,
        })
        // Both fixture rows are one user: dedupe keeps the best submission.
        expect(report.selectedSubmissions).toBe(1)
        expect(report.skippedSubmissions.duplicateUser).toBe(1)
        expect(report.licenseWarnings).toHaveLength(1)
        expect(report.issues).toHaveLength(0)
        expect(bundle.operations).toHaveLength(1)
        expect(bundle.workloads).toHaveLength(3)
        expect(bundle.runs).toHaveLength(3)

        const first = await publishBundle(tx, bundle, { publish: true })
        expect(first.counts.runs.inserted).toBe(3)
        const again = await publishBundle(tx, bundle, { publish: true })
        expect(again.counts.runs).toEqual({ inserted: 0, existing: 3 })
        throw new Rollback("rollback")
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error
      })
  })
})
