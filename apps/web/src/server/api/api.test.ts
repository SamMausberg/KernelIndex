// /api/v1 contract tests (§21.2 Week 5): the API returns the same resolver
// decision as the web read seam, errors are Problem Details, the OpenAPI
// document enumerates every route, and cursors page deterministically.
// Runs against the fixtures backend like the e2e suite.
import { describe, expect, it } from "vitest"

// The contract tests always run against the deterministic fixtures backend,
// whatever the shell environment says (dynamic imports order after this).
process.env.CATALOG_BACKEND = "fixtures"
const { searchCatalog } = await import("../../lib/catalog.ts")
const { api, composeQuery } = await import("./app.ts")

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

  it("rejects corrections without an authorized session (IDOR guard)", async () => {
    const response = await post("/corrections", {
      action: "retract",
      runId: "00000000-0000-7000-8000-000000000000",
      reason: "should never happen",
    })
    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.code).toBe("FORBIDDEN")
  })

  it("resolves serving to cohorts with feasibility and a frontier, no score", async () => {
    const response = await post("/resolve/serving", {
      objective: {
        direction: "maximize",
        metric: "output_token_throughput_tps",
        statistic: "reported",
      },
    })
    expect(response.status).toBe(200)
    const model = await response.json()
    expect(model.policyVersion).toBe("serving-v1")
    // Cohorts never merge: interactive and offline stay separate groups.
    expect(model.groups.length).toBe(2)
    const [first] = model.groups
    expect(first.rows[0].rank).toBe(1)
    expect(
      first.rows.some((row: { onFrontier: boolean }) => row.onFrontier),
    ).toBe(true)
    // No universal score field exists anywhere in a row.
    expect("score" in first.rows[0]).toBe(false)
  })

  it("excludes candidates whose constrained metric is unreported", async () => {
    const response = await post("/resolve/serving", {
      workload: "interactive-chat-trace",
      constraints: [{ metric: "ttft_ms", operator: "<=", value: 400 }],
    })
    const model = await response.json()
    const interactive = model.groups[0]
    expect(
      interactive.excluded.some((entry: { reasons: string[] }) =>
        entry.reasons.includes("METRIC_NOT_REPORTED:ttft_ms"),
      ),
    ).toBe(true)
    // The 410ms-TTFT candidate fails the measured constraint.
    expect(
      interactive.excluded.some((entry: { reasons: string[] }) =>
        entry.reasons.includes("CONSTRAINT_UNSATISFIED:ttft_ms"),
      ),
    ).toBe(true)
  })

  it("404s an unknown serving run as a problem", async () => {
    const response = await get("/serving-runs/srv-fx-nope")
    expect(response.status).toBe(404)
  })
})
