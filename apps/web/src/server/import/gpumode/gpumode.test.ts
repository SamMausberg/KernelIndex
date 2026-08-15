// GPU MODE importer goldens (§21.3): parsing and normalization stability
// against committed real snapshots, per-user selection, and (with a
// database) reconcile → publish inside a rolled-back transaction.
import { readFileSync } from "node:fs"
import path from "node:path"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { publishBundle } from "../../catalog/publication.ts"
import { db } from "../../db/client.ts"
import * as schema from "../../db/schema.ts"
import { specDigest } from "../../identity/digest.ts"
import type { GmImportData } from "./discover.ts"
import {
  aggregateRunFromRow,
  caseFromBenchmark,
  implementationFromRow,
  kernelbotEnvironment,
  kernelbotProtocol,
  kernelbotRankedProtocol,
  operationFromProblem,
  runFromBenchmark,
  suiteFromProblem,
} from "./normalize.ts"
import {
  parseBenchmarkSpec,
  parseLeaderboards,
  parseRunResult,
  parseSubmissionRows,
} from "./parse.ts"
import { CURATED_PROBLEMS, type CuratedProblem } from "./problems.ts"
import { reconcileKernelbot } from "./reconcile.ts"
import type { GmCandidate, GmSubmissionRow } from "./types.ts"

const fixtures = path.resolve(import.meta.dirname, "__fixtures__")
const read = (relative: string) =>
  readFileSync(path.join(fixtures, relative), "utf8")

const fp8 = CURATED_PROBLEMS.find((p) => p.leaderboard === "amd-fp8-mm")
if (!fp8) throw new Error("fp8-mm curation missing")

function candidateOf(
  row: GmSubmissionRow,
  runner = "MI300",
  code: string | null = null,
): GmCandidate {
  return {
    submissionId: row.submission_id,
    userId: String(row.user_id),
    submissionTime: row.submission_time,
    fileName: row.file_name ?? null,
    score: row.run_score as number,
    code: code ?? row.code ?? null,
    runner,
    raw: row,
  }
}

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
      candidateOf(row),
      fp8,
      `sha256:${"3".repeat(64)}`,
    )
    expect(implementation.manifest.spec.licensing).toEqual({})
    expect(implementation.manifest.spec.source).toBeUndefined()
    expect(implementation.artifacts).toBeUndefined()
  })

  it("mirrors submission code as a content-addressed inline artifact", () => {
    const row = parseSubmissionRows(read("api/fp8-mm-top.json"), "fx").values[0]
    const code = "import torch\n\ndef custom_kernel(data):\n    return data\n"
    const withCode = implementationFromRow(
      candidateOf(row, "MI300", code),
      fp8,
      `sha256:${"3".repeat(64)}`,
    )
    const source = withCode.manifest.spec.source
    expect(source?.contentDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(withCode.artifacts?.[0]).toMatchObject({
      role: "source",
      storage: "inline",
      content: code,
      digest: source?.contentDigest,
    })
    // Code content is identity: same row without code digests differently.
    const withoutCode = implementationFromRow(
      candidateOf(row),
      fp8,
      `sha256:${"3".repeat(64)}`,
    )
    expect(specDigest(withCode.manifest)).not.toBe(
      specDigest(withoutCode.manifest),
    )
  })

  it("builds suite workloads and aggregate runs for flat boards", () => {
    const aggregate: CuratedProblem = {
      leaderboard: "trimul-test",
      slug: "gpumode-trimul-test",
      title: "Trimul test",
      family: "trimul",
      description: "test",
      taskPath: "problems/x/task.yml",
      axes: { n: { role: "variable" }, seed: { role: "variable" } },
      inputs: [{ name: "x", shape: ["n", "n"], dtype: "fp32" }],
      outputs: [{ name: "y", shape: ["n", "n"], dtype: "fp32" }],
      tags: ["trimul"],
      config: "trimul_submissions",
      scoring: "aggregate",
      suite: {
        statistic: "geomean",
        cases: [
          { externalId: "0", axes: { n: 128, seed: 1 } },
          { externalId: "1", axes: { n: 256, seed: 2 } },
        ],
      },
    }
    const operation = operationFromProblem(aggregate)
    const suite = suiteFromProblem(aggregate, specDigest(operation.manifest))
    expect(suite.spec.cases).toHaveLength(2)
    expect(suite.spec.aggregation).toEqual({
      metric: "score",
      statistic: "geomean",
    })
    const protocol = kernelbotRankedProtocol("geomean")
    const environment = kernelbotEnvironment("B200")
    const row = parseSubmissionRows(read("api/fp8-mm-top.json"), "fx").values[0]
    const run = aggregateRunFromRow({
      candidate: { ...candidateOf(row, "B200"), score: 1.234 },
      problem: aggregate,
      implementationDigest: `sha256:${"1".repeat(64)}`,
      workloadDigest: specDigest(suite),
      protocol,
      protocolDigest: specDigest(protocol),
      environment,
      environmentDigest: specDigest(environment),
    })
    expect(run.manifest.spec.timing).toBeUndefined()
    expect(run.manifest.spec.measurements?.[0]).toMatchObject({
      metric: "score",
      unit: "s",
      statistic: "geomean",
      value: 1.234,
    })
    expect(run.manifest.spec.sourceNative?.metrics?.leaderboard_score_s).toBe(
      1.234,
    )
  })
})

const url = process.env.DATABASE_URL

describe.skipIf(!url)("gpumode import pipeline (database)", () => {
  class Rollback extends Error {}

  it("reconciles, dedupes users, and publishes idempotently", async () => {
    const rows = parseSubmissionRows(read("api/fp8-mm-top.json"), "fx").values
    const code = "import torch\n\ndef custom_kernel(data):\n    return data\n"
    const candidates = rows.map((row, index) =>
      candidateOf(row, "MI300", index === 0 ? code : null),
    )
    const data: GmImportData = {
      boards: [
        {
          problem: fp8,
          cohorts: new Map([["MI300", candidates]]),
          histories: new Map(),
        },
      ],
      snapshots: [],
      issues: [],
      driftWarnings: [],
    }
    await db()
      .transaction(async (tx) => {
        const { bundle, report } = await reconcileKernelbot(tx, data, {
          topPerBoard: 5,
          authors: 5,
          maxPerAuthor: 12,
        })
        // Both fixture rows are one user: dedupe keeps the best submission.
        expect(report.selectedSubmissions).toBe(1)
        expect(report.cohorts).toEqual([
          {
            leaderboard: "amd-fp8-mm",
            runner: "MI300",
            top: 1,
            progression: 0,
            withCode: 1,
          },
        ])
        expect(report.code.uniqueBlobs).toBe(1)
        expect(report.licenseWarnings).toHaveLength(1)
        expect(report.issues).toHaveLength(0)
        expect(bundle.operations).toHaveLength(1)
        expect(bundle.workloads).toHaveLength(3)
        expect(bundle.runs).toHaveLength(3)

        const first = await publishBundle(tx, bundle, { publish: true })
        expect(first.counts.runs.inserted).toBe(3)
        const again = await publishBundle(tx, bundle, { publish: true })
        expect(again.counts.runs).toEqual({ inserted: 0, existing: 3 })

        // The mirrored source landed as one inline content-addressed artifact.
        const digest = bundle.implementations[0].artifacts?.[0].digest
        const [artifact] = await tx
          .select()
          .from(schema.artifacts)
          .where(eq(schema.artifacts.contentDigest, digest as string))
        expect(artifact.content).toBe(code)
        expect(artifact.storage).toBe("inline")
        throw new Rollback("rollback")
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error
      })
  })
})
