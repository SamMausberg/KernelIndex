// /api/v1 contract tests (§21.2 Week 5): the API returns the same resolver
// decision as the web read seam, errors are Problem Details, the OpenAPI
// document enumerates every route, and cursors page deterministically.
// Runs against the fixtures backend like the e2e suite.
import { describe, expect, it } from "vitest"
import { searchCatalog } from "../../lib/catalog.ts"
import { api, composeQuery } from "./app.ts"

const get = (path: string) => api.request(path)
const post = (path: string, body: unknown) =>
  api.request(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })

describe("api /v1", () => {
  it("returns the same resolver decision as the web seam", async () => {
    const [response, model] = await Promise.all([
      get("/search?q=rmsnorm"),
      searchCatalog({ query: "rmsnorm" }),
    ])
    expect(response.status).toBe(200)
    const envelope = await response.json()
    expect(envelope.mode).toBe("exact")
    expect(envelope.operation).toEqual(model.operation)
    expect(
      envelope.groups.exact.map((r: { runId: string }) => r.runId),
    ).toEqual(model.groups.exact.map((r) => r.runId))
    expect(envelope.policyVersion).toMatch(/^ranking-v/)
    expect(envelope.generatedAt).toMatch(/Z$/)
  })

  it("composes structured resolve requests into the search grammar", () => {
    expect(
      composeQuery({
        operation: { name: "rmsnorm", axes: { tokens: 2048 } },
        environment: { hardwareProduct: "B200", dtype: "bf16" },
        policy: { minimumTrust: "verified", sourceRequired: true },
      }),
    ).toBe("rmsnorm tokens=2048 B200 dtype:bf16 trust:verified source:true")
  })

  it("resolves a structured request end to end", async () => {
    const response = await post("/resolve/kernel", {
      operation: { name: "rmsnorm" },
    })
    expect(response.status).toBe(200)
    const envelope = await response.json()
    expect(envelope.mode).toBe("exact")
  })

  it("pages records with a stable cursor", async () => {
    const first = await get("/records?limit=1")
    expect(first.status).toBe(200)
    const page1 = await first.json()
    expect(page1.records).toHaveLength(1)
    expect(page1.nextCursor).not.toBeNull()
    const second = await get(
      `/records?limit=1&cursor=${encodeURIComponent(page1.nextCursor)}`,
    )
    const page2 = await second.json()
    expect(page2.records[0].cohortKey).not.toBe(page1.records[0].cohortKey)
    const bad = await get("/records?cursor=bm9wZQ")
    expect(bad.status).toBe(400)
  })

  it("serves dossiers and Problem Details", async () => {
    const run = await get("/runs/run-fx-0001")
    expect(run.status).toBe(200)
    const missing = await get("/runs/00000000-0000-7000-8000-000000000000")
    expect(missing.status).toBe(404)
    expect(missing.headers.get("Content-Type")).toContain(
      "application/problem+json",
    )
    const body = await missing.json()
    expect(body).toMatchObject({
      code: "RUN_NOT_FOUND",
      status: 404,
      requestId: expect.any(String),
    })
  })

  it("compares runs through the same model", async () => {
    const response = await post("/compare", {
      runs: ["run-fx-0001", "run-fx-0002"],
    })
    expect(response.status).toBe(200)
    const model = await response.json()
    expect(model.comparable).toBe(true)
    expect(model.policyVersion).toMatch(/^ranking-v/)
  })

  it("publishes a complete OpenAPI document", async () => {
    const response = await get("/openapi.json")
    expect(response.status).toBe(200)
    const document = await response.json()
    expect(document.openapi).toBe("3.1.0")
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        "/search",
        "/resolve/kernel",
        "/operations/{idOrSlug}",
        "/implementations/{idOrSlug}",
        "/runs/{idOrDigest}",
        "/records",
        "/compare",
      ]),
    )
  })

  it("rejects revalidation without the token", async () => {
    const response = await api.request("/revalidate", { method: "POST" })
    expect(response.status).toBe(401)
  })
})
