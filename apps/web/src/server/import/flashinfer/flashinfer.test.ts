// FlashInfer-Bench importer goldens (§21.3): parsing and normalization
// stability against committed real snapshots, and (with a database)
// reconcile → publish inside a rolled-back transaction, covering the §22.8
// gate (idempotent re-import) and the §14.4 ambiguity rules.
import { readFileSync } from "node:fs"
import path from "node:path"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { publishBundle } from "../../catalog/publication.ts"
import { db } from "../../db/client.ts"
import * as schema from "../../db/schema.ts"
import { specDigest } from "../../identity/digest.ts"
import { parseDefinition, parseTraces } from "../sol/parse.ts"
import type { SolDefinition } from "../sol/types.ts"
import type { FiImportData } from "./discover.ts"
import {
  fiTraceProtocol,
  implementationFromFiSolution,
  projectForAuthor,
} from "./normalize.ts"
import { reconcileFlashinfer } from "./reconcile.ts"
import { type FiSolution, fiDatasetInfo, fiSolution } from "./types.ts"

const fixtures = path.resolve(import.meta.dirname, "__fixtures__")
const read = (relative: string) =>
  readFileSync(path.join(fixtures, relative), "utf8")

const REVISION = "da915083d4c7c5e61aa3005e3d17ae488e0fc71c"
const SOLUTION_PATH =
  "solutions/baseline/rmsnorm/fused_add_rmsnorm_h2048/flashinfer_wrapper_74a870.json"
const LLM_SOLUTION_PATH =
  "solutions/claude-opus-4-1-20250805/rmsnorm/fused_add_rmsnorm_h2048/claude-opus-4-1_triton_c9eea2.json"

function fixtureData(): {
  definition: SolDefinition
  solution: FiSolution
  data: FiImportData
} {
  const definition = parseDefinition(read("dataset/definition.json"), "fx")
    .values[0]
  const solution = fiSolution.parse(JSON.parse(read("dataset/solution.json")))
  const traces = parseTraces(read("dataset/trace.jsonl"), "fx")
  expect(traces.issues).toHaveLength(0)
  return {
    definition,
    solution,
    data: {
      revision: REVISION,
      definitions: new Map([[definition.name, definition]]),
      solutions: [{ solution, path: SOLUTION_PATH }],
      traces: traces.values,
      snapshots: [],
      issues: [],
      driftWarnings: [],
    },
  }
}

/** The opted-in model-authored counterpart to fixtureData (same definition). */
function llmFixture() {
  const solution = fiSolution.parse(
    JSON.parse(read("dataset/llm-solution.json")),
  )
  const traces = parseTraces(read("dataset/llm-trace.jsonl"), "fx-llm")
  expect(traces.issues).toHaveLength(0)
  return { solution, path: LLM_SOLUTION_PATH, traces: traces.values }
}

describe("flashinfer parsing", () => {
  it("parses the pinned dataset listing, definition, and baseline traces", () => {
    const info = fiDatasetInfo.parse(JSON.parse(read("dataset/info.json")))
    expect(info.sha).toBe(REVISION)
    expect(info.siblings).toHaveLength(3)

    const { definition, data } = fixtureData()
    expect(definition.name).toBe("fused_add_rmsnorm_h2048")
    expect(data.traces).toHaveLength(3)
    expect(data.traces.every((trace) => trace.evaluation !== null)).toBe(true)
  })

  it("quarantines a solution document missing its definition binding", () => {
    const broken = fiSolution.safeParse({ name: "orphan" })
    expect(broken.success).toBe(false)
  })

  it("records no bound for upstream 'Infinity' and 'NaN' error values", () => {
    const line = JSON.parse(read("dataset/trace.jsonl").split("\n")[0])
    line.evaluation.correctness.max_absolute_error = "Infinity"
    line.evaluation.correctness.max_relative_error = "NaN"
    const outcome = parseTraces(JSON.stringify(line), "fx")
    expect(outcome.issues).toHaveLength(0)
    const correctness = outcome.values[0].evaluation?.correctness
    expect(correctness?.max_absolute_error).toBeNull()
    expect(correctness?.max_relative_error).toBeNull()
  })
})

describe("flashinfer normalization", () => {
  it("mirrors the inline Apache-2.0 source as a content-addressed artifact", () => {
    const { definition, solution } = fixtureData()
    const implementation = implementationFromFiSolution({
      solution,
      definition,
      operationSpecDigest: `sha256:${"1".repeat(64)}`,
      revision: REVISION,
      path: SOLUTION_PATH,
    })
    expect(implementation.slug).toBe("flashinfer-flashinfer-wrapper-74a870")
    expect(implementation.projectSlug).toBe("flashinfer-baseline")
    const spec = implementation.manifest.spec
    expect(spec.licensing).toEqual({
      declared: "Apache-2.0",
      concluded: "Apache-2.0",
    })
    expect(spec.callable).toMatchObject({
      language: "python",
      path: "main.py",
      symbol: "run",
    })
    expect(spec.support.productsTested).toHaveLength(6)
    expect(spec.support.dtypes).toEqual(["bf16"])
    const artifact = implementation.artifacts?.[0]
    expect(artifact).toMatchObject({
      role: "source",
      storage: "inline",
      mediaType: "text/x-python",
      digest: spec.source?.contentDigest,
      license: "Apache-2.0",
    })
    expect(artifact?.content).toContain("fused_add_rmsnorm")
  })

  it("keeps the baseline label and digest byte-identical (§22.8)", () => {
    const { definition, solution } = fixtureData()
    const implementation = implementationFromFiSolution({
      solution,
      definition,
      operationSpecDigest: `sha256:${"1".repeat(64)}`,
      revision: REVISION,
      path: SOLUTION_PATH,
    })
    expect(implementation.manifest.metadata.labels).toEqual({
      role: "baseline",
    })
    // Pinned pre-llm-import digest: re-publishing baselines inserts nothing.
    expect(specDigest(implementation.manifest)).toBe(
      "sha256:635f4b7b595c62b00c85f9d65a660f8357ecb5bbe06fbfdda8d5d83c3876eacd",
    )
  })

  it("labels a model-directory solution llm-generated with its author", () => {
    const { definition } = fixtureData()
    const llm = llmFixture()
    const implementation = implementationFromFiSolution({
      solution: llm.solution,
      definition,
      operationSpecDigest: `sha256:${"1".repeat(64)}`,
      revision: REVISION,
      path: llm.path,
    })
    expect(implementation.manifest.metadata.labels).toEqual({
      role: "llm-generated",
      author: "claude-opus-4-1-20250805",
    })
    expect(implementation.manifest.metadata.authors).toEqual([
      { name: "claude-opus-4-1-20250805" },
    ])
    expect(implementation.projectSlug).toBe(
      "flashinfer-claude-opus-4-1-20250805",
    )
    expect(implementation.artifacts?.[0]).toMatchObject({
      storage: "inline",
      mediaType: "text/x-python",
      license: "Apache-2.0",
    })
  })

  it("falls back to a stable unknown-author project", () => {
    expect(projectForAuthor(null).slug).toBe("flashinfer-unknown")
    expect(projectForAuthor("baseline").slug).toBe("flashinfer-baseline")
    const manifest = projectForAuthor("baseline").manifest
    if (manifest.kind !== "SoftwareProject") throw new Error("unreachable")
    expect(manifest.spec.name).toBe("FlashInfer-Bench baselines")
  })

  it("pins the trace-protocol digest as a drift alarm", () => {
    expect(specDigest(fiTraceProtocol())).toBe(
      "sha256:7d44d206ad086b4bece35ce31f6531ebb11f07e0d9dcfb74c75be86d3ec02095",
    )
  })
})

const url = process.env.DATABASE_URL

describe.skipIf(!url)("flashinfer import pipeline (database)", () => {
  class Rollback extends Error {}

  async function inRollback(
    fn: (
      tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0],
    ) => Promise<void>,
  ) {
    await db()
      .transaction(async (tx) => {
        await fn(tx)
        throw new Rollback("rollback")
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error
      })
  }

  it("reconciles and publishes the fixture snapshot idempotently (§22.8)", async () => {
    const { data } = fixtureData()
    await inRollback(async (tx) => {
      const { bundle, report } = await reconcileFlashinfer(tx, data)
      expect(report.issues).toHaveLength(0)
      expect(bundle.operations).toHaveLength(1)
      expect(bundle.implementations).toHaveLength(1)
      expect(bundle.projects).toHaveLength(1)
      // Three traces at distinct batch sizes: one workload case each.
      expect(bundle.workloads).toHaveLength(3)
      expect(bundle.runs).toHaveLength(3)
      expect(report.code).toEqual({ solutionsWithCode: 1, totalBytes: 411 })

      const first = await publishBundle(tx, bundle, { publish: true })
      expect(first.counts.runs.inserted).toBe(3)
      const again = await publishBundle(tx, bundle, { publish: true })
      expect(again.counts.runs).toEqual({ inserted: 0, existing: 3 })

      const { report: second } = await reconcileFlashinfer(tx, data)
      expect(
        second.proposed.every((object) => object.action === "exists"),
      ).toBe(true)
    })
  })

  it("imports labeled llm solutions without touching published baselines", async () => {
    const { data } = fixtureData()
    const llm = llmFixture()
    await inRollback(async (tx) => {
      const first = await reconcileFlashinfer(tx, data)
      await publishBundle(tx, first.bundle, { publish: true })

      // Re-reconcile with the model author opted in: every baseline object
      // already exists; only the llm project/implementation/runs are new.
      const { bundle, report } = await reconcileFlashinfer(tx, {
        ...data,
        solutions: [
          ...data.solutions,
          { solution: llm.solution, path: llm.path },
        ],
        traces: [...data.traces, ...llm.traces],
      })
      expect(report.issues).toHaveLength(0)
      const inserts = report.proposed.filter((o) => o.action === "insert")
      expect(inserts.map((o) => o.entity)).toEqual([
        "implementation",
        "run",
        "run",
      ])

      const result = await publishBundle(tx, bundle, { publish: true })
      expect(result.counts.implementations).toMatchObject({ inserted: 1 })
      expect(result.counts.runs).toEqual({ inserted: 2, existing: 3 })
      const [row] = await tx
        .select({ role: schema.implementations.role })
        .from(schema.implementations)
        .where(
          eq(
            schema.implementations.slug,
            "flashinfer-claude-opus-4-1-triton-c9eea2",
          ),
        )
      expect(row.role).toBe("llm-generated")
    })
  })

  it("flags a slug bound to different semantics as review, not overwrite", async () => {
    const { data } = fixtureData()
    // Same definition name (same slug), drifted constant: different digest.
    const raw = JSON.parse(read("dataset/definition.json"))
    raw.axes.hidden_size.value = 4096
    const drifted = parseDefinition(JSON.stringify(raw), "fx-drift").values[0]

    await inRollback(async (tx) => {
      const rival = await reconcileFlashinfer(tx, {
        ...data,
        definitions: new Map([[drifted.name, drifted]]),
        solutions: [],
        traces: [],
      })
      await publishBundle(tx, rival.bundle, { publish: true })

      const { report } = await reconcileFlashinfer(tx, data)
      expect(
        report.ambiguities.some((entry) => entry.includes("already maps to")),
      ).toBe(true)
    })
  })

  it("skips traces naming an undiscovered solution as an ambiguity", async () => {
    const { data } = fixtureData()
    await inRollback(async (tx) => {
      const { bundle, report } = await reconcileFlashinfer(tx, {
        ...data,
        solutions: [],
      })
      expect(bundle.runs).toHaveLength(0)
      expect(
        report.ambiguities.filter((entry) =>
          entry.includes("not discovered this run"),
        ),
      ).toHaveLength(3)
    })
  })
})
