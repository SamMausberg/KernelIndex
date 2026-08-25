// Batched-publication semantics the page-read integration tests don't pin
// down: in-bundle duplicates count as existing, and a runs-only bundle
// resolves implementations and workloads that live only in the catalog.
// Requires DATABASE_URL (migrated database).
import { describe, expect, it } from "vitest"
import { parseManifestDocument } from "../../schemas/parse.ts"
import { db } from "../db/client.ts"
import { exampleBundle } from "./example-bundle.ts"
import {
  type AnyWorkloadManifest,
  installCommandOf,
  NO_AXES,
  publishBundle,
  varyingAxisNames,
  workloadSummaryOf,
} from "./publication.ts"

const url = process.env.DATABASE_URL

// One paged-decode operation binds sixteen cases that all shape to
// [1, 32, 128] and differ only in num_pages and num_kv_indices. Rendered as
// the shape alone, their records read as contradictory measurements of one
// workload — the whole reason the summary carries axes (§8.5).
const decodeCase = (numPages: number, numKvIndices: number) => {
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "WorkloadCase",
    metadata: { name: `gqa-paged-decode-${numPages}-${numKvIndices}` },
    spec: {
      operationSpecDigest: `sha256:${"0".repeat(64)}`,
      axes: {
        head_dim: 128,
        page_size: 1,
        batch_size: 1,
        num_qo_heads: 32,
        num_kv_heads: 8,
        num_pages: numPages,
        num_kv_indices: numKvIndices,
      },
      tensors: { q: { shape: [1, 32, 128], dtype: "bf16" } },
      correctness: { comparator: "elementwise_close" },
    },
  })
  if (manifest.kind !== "WorkloadCase") throw new Error("unreachable")
  return manifest satisfies AnyWorkloadManifest
}

describe("install line synthesis", () => {
  it("pins a version-less pip recipe with the measured version (§8.15)", () => {
    const recipe = { kind: "pip", package: "liger-kernel" } as const
    expect(installCommandOf(recipe)).toBe("pip install liger-kernel")
    expect(installCommandOf(recipe, "0.8.1")).toBe(
      'pip install "liger-kernel==0.8.1"',
    )
    // A recipe's own version outranks the measured one.
    expect(installCommandOf({ ...recipe, version: "0.6.2" }, "0.8.1")).toBe(
      'pip install "liger-kernel==0.6.2"',
    )
  })
  it("keeps git and container forms pinned by their own coordinates", () => {
    expect(
      installCommandOf(
        {
          kind: "git",
          repository: "https://x.invalid/r",
          commit: "b81d40e",
        },
        "9.9.9",
      ),
    ).toBe("pip install git+https://x.invalid/r@b81d40e")
  })
})

describe("workload display identity", () => {
  const siblings = [decodeCase(17, 2), decodeCase(10, 9)]

  it("carries the axes that differ and leaves the constant ones out", () => {
    const varying = varyingAxisNames(siblings)
    expect([...varying].sort()).toEqual(["num_kv_indices", "num_pages"])
    expect(siblings.map((c) => workloadSummaryOf(c, varying))).toEqual([
      "[1, 32, 128] · num_pages=17 · num_kv_indices=2",
      "[1, 32, 128] · num_pages=10 · num_kv_indices=9",
    ])
  })

  it("is the shape alone when nothing looks like it", () => {
    expect(varyingAxisNames([siblings[0]]).size).toBe(0)
    expect(workloadSummaryOf(siblings[0], NO_AXES)).toBe("[1, 32, 128]")
  })

  it("never repeats what the shape already shows", () => {
    // batch_size is 1 in both, and the shape leads with 1. Resolving axes
    // against the rows that look alike — not the whole operation — keeps it
    // out on its own, with no rule about shapes to get wrong.
    expect(varyingAxisNames(siblings).has("batch_size")).toBe(false)
    for (const summary of siblings.map((c) =>
      workloadSummaryOf(c, varyingAxisNames(siblings)),
    ))
      expect(summary).not.toContain("batch_size")
  })

  it("distinguishes every sibling of a real operation", () => {
    const cases = Array.from({ length: 16 }, (_, i) => decodeCase(i + 1, i * 3))
    const varying = varyingAxisNames(cases)
    const summaries = cases.map((c) => workloadSummaryOf(c, varying))
    expect(new Set(summaries).size).toBe(cases.length)
  })
})

describe.skipIf(!url)("batched publication", () => {
  it("counts in-bundle duplicates as existing, keeping runIds per entry", async () => {
    await publishBundle(db(), exampleBundle(), { publish: true })

    const doubled = exampleBundle()
    doubled.operations = [...doubled.operations, ...doubled.operations]
    doubled.runs = [...doubled.runs, ...doubled.runs]
    const result = await publishBundle(db(), doubled, { publish: true })
    expect(result.counts.operations).toEqual({ inserted: 0, existing: 2 })
    expect(result.counts.runs).toEqual({ inserted: 0, existing: 2 })
    expect(result.runIds).toHaveLength(2)
    expect(new Set(result.runIds).size).toBe(1)
  })

  it("resolves run references from the catalog when absent from the bundle", async () => {
    await publishBundle(db(), exampleBundle(), { publish: true })

    // Only the run rides in the bundle; its implementation, workload, and
    // operation must be found in the catalog. A fixed alternate observedAt
    // gives a second deterministic run digest, so re-runs stay idempotent.
    //
    // Unpublished on purpose. These files share one database and vitest runs
    // them in parallel, so a second *eligible* run in the example cohort
    // raced reads.test.ts, which asserts that cohort's exact composition.
    // Reference resolution is the same code path either way, and leaving
    // publishedAt null keeps the row out of every ranked surface.
    const bundle = exampleBundle()
    bundle.projects = []
    bundle.operations = []
    bundle.workloads = []
    bundle.implementations = []
    bundle.runs[0].manifest.spec.observedAt = "2026-01-02T00:00:00Z"
    const result = await publishBundle(db(), bundle, { publish: false })
    expect(result.counts.runs.inserted + result.counts.runs.existing).toBe(1)
    expect(result.runIds[0]).toBeTruthy()
  })
})
