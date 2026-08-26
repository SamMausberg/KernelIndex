// KernelBench importer goldens (§21.3): static problem parsing against real
// modules, timing-file validation, and (with a database) reconcile → publish
// inside a rolled-back transaction.
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import type { AnyManifest } from "../../../schemas/kinds.ts"
import { publishBundle } from "../../catalog/publication.ts"
import { db } from "../../db/client.ts"
import { specDigest } from "../../identity/digest.ts"
import { type KbImportData, parseTimingFile } from "./discover.ts"
import { familyOf, parseProblem } from "./problem.ts"
import { reconcileKernelBench } from "./reconcile.ts"
import { MACHINES, MODES } from "./types.ts"

const fixture = (...parts: string[]) =>
  readFileSync(
    path.resolve(import.meta.dirname, "__fixtures__", ...parts),
    "utf8",
  )

const PROBLEMS = [
  "level1/1_Square_matrix_multiplication_.py",
  "level1/93_masked_cumsum.py",
  "level1/95_CrossEntropyLoss.py",
  "level2/1_Conv2D_ReLU_BiasAdd.py",
]

function fixtureData(): KbImportData {
  const data: KbImportData = {
    commit: "0123456789abcdef0123456789abcdef01234567",
    observedAt: "2026-03-24T04:29:13.000Z",
    timings: [],
    problems: new Map(
      PROBLEMS.map((key) => [key, fixture("problems", ...key.split("/"))]),
    ),
    snapshots: [],
    issues: [],
    driftWarnings: [],
  }
  for (const machine of Object.keys(MACHINES))
    for (const mode of Object.keys(MODES)) {
      const outcome = parseTimingFile(
        fixture("timing", machine, mode),
        `fx/${machine}/${mode}`,
        machine,
        mode,
      )
      expect(outcome.issues).toEqual([])
      data.timings.push(...outcome.timings)
    }
  return data
}

describe("kernelbench problem parsing", () => {
  it("binds constants, splats, dtypes, and init hyperparameters", () => {
    const gemm = parseProblem(
      "level1",
      "1_Square_matrix_multiplication_.py",
      fixture("problems", "level1", "1_Square_matrix_multiplication_.py"),
    )
    expect(gemm.spec).toMatchObject({
      number: 1,
      title: "Square matrix multiplication",
      family: "gemm",
      axes: { n: 4096 },
      inputs: [
        { name: "a", shape: ["n", "n"], dtype: "fp32" },
        { name: "b", shape: ["n", "n"], dtype: "fp32" },
      ],
    })
    const loss = parseProblem(
      "level1",
      "95_CrossEntropyLoss.py",
      fixture("problems", "level1", "95_CrossEntropyLoss.py"),
    )
    expect(loss.spec?.inputs).toEqual([
      { name: "input_1", shape: ["batch_size", "num_classes"], dtype: "fp32" },
      { name: "input_2", shape: ["batch_size"], dtype: "int64" },
    ])
    const conv = parseProblem(
      "level2",
      "1_Conv2D_ReLU_BiasAdd.py",
      fixture("problems", "level2", "1_Conv2D_ReLU_BiasAdd.py"),
    )
    expect(conv.spec?.family).toBe("conv")
    expect(conv.spec?.scalars).toMatchObject({ kernel_size: 3 })
    expect(conv.spec?.inputs[0].shape).toEqual([
      "batch_size",
      "in_channels",
      "height",
      "width",
    ])
  })

  it("skips a module whose inputs are not statically shaped", () => {
    const masked = parseProblem(
      "level1",
      "93_masked_cumsum.py",
      fixture("problems", "level1", "93_masked_cumsum.py"),
    )
    expect(masked.problem).toContain("x.shape")
  })

  it("files level-2 fusions under their leading op and level 3 as models", () => {
    expect(familyOf("level2", "12_Gemm_Multiply_LeakyReLU.py")).toBe("gemm")
    expect(familyOf("level1", "24_LogSoftmax.py")).toBe("softmax")
    expect(familyOf("level3", "11_VGG16.py")).toBe("model")
  })
})

const url = process.env.DATABASE_URL

describe.skipIf(!url)("kernelbench import pipeline (database)", () => {
  class Rollback extends Error {}

  it("reconciles the slices and publishes idempotently", async () => {
    await db()
      .transaction(async (tx) => {
        const { bundle, report } = await reconcileKernelBench(tx, fixtureData())
        expect(report.issues).toEqual([])
        expect(report.ambiguities).toEqual([])
        expect(Object.keys(report.skipped.unparsedProblems)).toEqual([
          "level1/93_masked_cumsum.py",
        ])
        expect(bundle.operations).toHaveLength(3)
        // 3 problems × 2 modes × 2 hosts; the skipped problem's 4 timings
        // are accounted for by its parse reason, not lost silently.
        expect(bundle.implementations).toHaveLength(6)
        expect(bundle.runs).toHaveLength(12)
        // Identity lives in the spec: problems sharing an input signature
        // and modes sharing a module must still publish as distinct rows.
        const distinct = (entries: { manifest: AnyManifest }[]) =>
          new Set(entries.map((entry) => specDigest(entry.manifest))).size
        expect(distinct(bundle.operations)).toBe(3)
        expect(distinct(bundle.implementations)).toBe(6)
        expect(distinct(bundle.workloads)).toBe(3)
        expect(report.skipped.missingProblem).toBe(0)
        expect(bundle.implementations[0].artifacts?.[0]).toMatchObject({
          storage: "inline",
          license: "MIT",
        })
        const first = await publishBundle(tx, bundle, { publish: true })
        expect(first.counts.runs.inserted + first.counts.runs.existing).toBe(12)
        const again = await publishBundle(tx, bundle, { publish: true })
        expect(again.counts.runs).toEqual({ inserted: 0, existing: 12 })
        throw new Rollback("rollback")
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error
      })
  })
})
