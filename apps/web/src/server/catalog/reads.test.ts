// End-to-end integration: publish the illustrative example bundle through
// the real publication transaction, then read it back through all five
// page-read functions. Requires DATABASE_URL (migrated database).
import { beforeAll, describe, expect, it } from "vitest"
import { db } from "../db/client.ts"
import { exampleBundle } from "./example-bundle.ts"
import { publishBundle } from "./publication.ts"
import {
  getHomePage,
  getImplementationPage,
  getOperationPage,
  getRecordsPage,
  getRunPage,
  searchCatalog,
} from "./reads.ts"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("postgres catalog reads", () => {
  beforeAll(async () => {
    // Idempotent: re-publishing the unchanged bundle inserts nothing.
    await publishBundle(db(), exampleBundle(), { publish: true })
  })

  it("publishes idempotently", async () => {
    const again = await publishBundle(db(), exampleBundle(), { publish: true })
    expect(again.counts.runs).toEqual({ inserted: 0, existing: 1 })
    expect(again.counts.operations).toEqual({ inserted: 0, existing: 1 })
  })

  it("getHomePage lists recent published records newest first", async () => {
    const model = await getHomePage()
    expect(model.latest.length).toBeGreaterThanOrEqual(1)
    const dates = model.latest.map((row) => row.lastTestedAt ?? "")
    expect(dates).toEqual([...dates].sort().reverse())
    const [first] = model.latest
    expect(first.runId).toBeTruthy()
    expect(first.operation.slug).toBeTruthy()
    expect(first.primary?.unit).toBe("ns")
  })

  it("getRecordsPage derives per-cohort record history from runs", async () => {
    const model = await getRecordsPage()
    expect(model.records.length).toBeGreaterThanOrEqual(1)
    for (const holder of model.records) {
      // The newest event is the current record.
      expect(holder.history[0].runId).toBe(holder.current.runId)
      expect(holder.since).toBe(holder.history[0].at)
      // Records only ever improve: newer events are strictly faster.
      for (let i = 0; i + 1 < holder.history.length; i++) {
        expect(holder.history[i].value.value).toBeLessThan(
          holder.history[i + 1].value.value,
        )
      }
      // The first event has no predecessor; later events always do.
      expect(holder.history.at(-1)?.previousValue).toBeNull()
    }
  })

  it("searchCatalog finds the operation by alias and labels it illustrative", async () => {
    const model = await searchCatalog({ query: "rms_norm b200" })
    expect(model.noResult).toBeNull()
    expect(model.illustrative).toBe(true)
    expect(model.groups.exact.length).toBeGreaterThanOrEqual(1)
    const [first] = model.groups.exact
    expect(first.rank).toBe(1)
    expect(first.primary?.value).toBe(8120)
    expect(first.primary?.unit).toBe("ns")
    expect(first.caveats).toContain("Illustrative example record")
    expect(model.cohort?.profile).toBe("strict_exact")
  })

  it("searchCatalog returns the browse start state for an empty query", async () => {
    const model = await searchCatalog({ query: "" })
    expect(model.noResult).toBeNull()
    expect(model.browse?.length).toBeGreaterThanOrEqual(1)
    const rmsnorm = model.browse?.find((entry) => entry.family === "rmsnorm")
    expect(rmsnorm?.runs).toBeGreaterThanOrEqual(1)
  })

  it("searchCatalog explains a no-result query", async () => {
    const model = await searchCatalog({ query: "nonexistent-operation-xyz" })
    expect(model.groups.exact).toHaveLength(0)
    expect(model.noResult?.guidance).toContain("No matching operation")
  })

  it("getOperationPage returns semantics, workloads, and records", async () => {
    const model = await getOperationPage("example-rmsnorm-h4096")
    expect(model).not.toBeNull()
    expect(model?.semantics.inputs.map((input) => input.name)).toEqual([
      "input",
      "weight",
      "epsilon",
    ])
    expect(model?.workloads).toHaveLength(1)
    expect(model?.records).toHaveLength(1)
    // The example run ships no raw-evidence artifacts, so it derives as
    // "reported" — trust comes from stored facts, never from labels.
    expect(model?.coverage.reported).toBe(1)
    expect(model?.coverage.reproducible).toBe(0)
    expect(model?.operation.aliases).toContain("rms_norm")
  })

  it("getImplementationPage answers 'can I use this?'", async () => {
    const model = await getImplementationPage("example-meridian-rmsnorm")
    expect(model).not.toBeNull()
    expect(model?.license.concluded).toBe("Apache-2.0")
    expect(model?.source.available).toBe(true)
    expect(model?.support.dtypes).toEqual(["bf16"])
    expect(model?.bestResults).toHaveLength(1)
  })

  it("getRunPage returns the full evidence dossier", async () => {
    const search = await searchCatalog({ query: "rmsnorm" })
    const runId = search.groups.exact[0]?.runId
    expect(runId).toBeTruthy()
    const model = await getRunPage(runId as string)
    expect(model).not.toBeNull()
    expect(model?.run.digest).toMatch(/^sha256:/)
    expect(model?.evidence).toBe("reported")
    expect(model?.cohort.rank).toBe(1)
    expect(model?.protocol.length).toBeGreaterThan(3)
    expect(model?.environment.length).toBeGreaterThan(3)
    expect(model?.measurements.length).toBeGreaterThanOrEqual(6)
    expect(model?.workload.tolerance.length).toBeGreaterThan(0)
  })

  it("getRunPage rejects malformed identifiers without touching the database", async () => {
    expect(await getRunPage("not-a-uuid")).toBeNull()
  })
})
