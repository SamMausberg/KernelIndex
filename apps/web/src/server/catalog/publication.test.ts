// Batched-publication semantics the page-read integration tests don't pin
// down: in-bundle duplicates count as existing, and a runs-only bundle
// resolves implementations and workloads that live only in the catalog.
// Requires DATABASE_URL (migrated database).
import { describe, expect, it } from "vitest"
import { db } from "../db/client.ts"
import { exampleBundle } from "./example-bundle.ts"
import { publishBundle } from "./publication.ts"

const url = process.env.DATABASE_URL

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
    const bundle = exampleBundle()
    bundle.projects = []
    bundle.operations = []
    bundle.workloads = []
    bundle.implementations = []
    bundle.runs[0].manifest.spec.observedAt = "2026-01-02T00:00:00Z"
    const result = await publishBundle(db(), bundle, { publish: true })
    expect(
      result.counts.runs.inserted + result.counts.runs.existing,
    ).toBe(1)
    expect(result.runIds[0]).toBeTruthy()
  })
})
