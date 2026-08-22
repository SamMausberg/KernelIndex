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

  it("resolves a batch of structured requests in order, bounded", async () => {
    const response = await post("/resolve/kernel/batch", {
      requests: [{ operation: { name: "rmsnorm" } }, { query: "zzz-none" }],
    })
    expect(response.status).toBe(200)
    const batch = await response.json()
    expect(batch.results.map((r: { mode: string }) => r.mode)).toEqual([
      "exact",
      "none",
    ])
    expect(batch.generatedAt).toMatch(/Z$/)
    const tooMany = await post("/resolve/kernel/batch", {
      requests: Array.from({ length: 21 }, () => ({})),
    })
    expect(tooMany.status).toBe(400)
  })

  it("brackets an unmeasured case with its measured neighbours", async () => {
    const response = await get("/search?q=rmsnorm%20tokens%3D3000")
    const envelope = await response.json()
    expect(envelope.groups.exact).toHaveLength(0)
    expect(envelope.nearest).toMatchObject({
      axis: "tokens",
      requested: 3000,
      below: { value: 2048, query: "rmsnorm tokens=2048" },
      above: { value: 4096, query: "rmsnorm tokens=4096" },
    })
    const measured = await get("/search?q=rmsnorm%20tokens%3D2048")
    expect((await measured.json()).nearest).toBeNull()
  })

  it("serves the change feed grouped by day and honors since", async () => {
    const response = await get("/feed")
    expect(response.status).toBe(200)
    const feed = await response.json()
    expect(feed.days.length).toBeGreaterThan(0)
    const kinds = new Set(
      feed.days.flatMap((day: { entries: { kind: string }[] }) =>
        day.entries.map((entry) => entry.kind),
      ),
    )
    expect(kinds.has("record")).toBe(true)
    expect(kinds.has("import")).toBe(true)
    const narrowed = await get("/feed?since=2099-01-01T00:00:00Z")
    expect((await narrowed.json()).days).toEqual([])
    expect((await get("/feed?since=yesterday")).status).toBe(400)
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

  it("serves the project dossier and 404s an unknown slug", async () => {
    const response = await get("/projects/meridian-kernels")
    expect(response.status).toBe(200)
    const model = await response.json()
    expect(model.project.slug).toBe("meridian-kernels")
    expect(model.implementations.length).toBeGreaterThanOrEqual(1)
    expect(model.implementations[0].operation.slug).toBe("rmsnorm-h4096")
    expect(model.claim.state).toBe("unclaimed")
    const missing = await get("/projects/no-such-project")
    expect(missing.status).toBe(404)
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
        "/runs",
        "/operations",
        "/hardware",
        "/models",
        "/models/{slug}",
        "/coverage",
        "/sources",
      ]),
    )
  })

  it("refuses a machine attestation without a key (key-mandatory)", async () => {
    const response = await post("/runs/run-fx-0002/attestations", {
      type: "reproduced",
      body: "same number here",
    })
    expect(response.status).toBe(401)
    expect(response.headers.get("Content-Type")).toContain("problem+json")
  })

  it("serves published attestations on the run dossier", async () => {
    const response = await get("/runs/run-fx-0002")
    const model = await response.json()
    expect(model.attestations.map((a: { type: string }) => a.type)).toEqual([
      "reproduced",
      "environment_note",
    ])
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

// Corpus enumeration surfaces (§13.2 at 20k records). /coverage and /sources
// read through the seam (fixtures here); the listing reads are database-only
// and run against whatever DATABASE_URL holds, so cases assert contract
// shape and filter/paging invariants, never counts.
describe("api /v1 enumeration", () => {
  it("pages runs by keyset, newest first, and 400s a bad cursor", async () => {
    const first = await get("/runs?limit=2")
    expect(first.status).toBe(200)
    const page = await first.json()
    expect(page.generatedAt).toMatch(/Z$/)
    for (const run of page.runs) {
      expect(run.digest).toMatch(/^sha256:[0-9a-f]{64}$/)
      expect(run.status).toBe("passed")
    }
    const observed = page.runs.map((run: { observedAt: string }) =>
      Date.parse(run.observedAt),
    )
    expect(observed).toEqual([...observed].sort((a, b) => b - a))
    if (page.nextCursor !== null) {
      const second = await (
        await get(`/runs?limit=2&cursor=${encodeURIComponent(page.nextCursor)}`)
      ).json()
      const firstIds = page.runs.map((run: { id: string }) => run.id)
      for (const run of second.runs) expect(firstIds).not.toContain(run.id)
    }
    expect((await get("/runs?cursor=bm9wZQ")).status).toBe(400)
  })

  it("lists operations with tags and honors the family filter", async () => {
    const all = await (await get("/operations")).json()
    for (const entry of all.operations) {
      expect(entry.slug).toBeTruthy()
      expect(Array.isArray(entry.tags)).toBe(true)
      expect(entry.workloads).toBeGreaterThanOrEqual(0)
    }
    const family = all.operations[0]?.family
    if (family) {
      const filtered = await (
        await get(`/operations?family=${encodeURIComponent(family)}`)
      ).json()
      expect(filtered.operations.length).toBeGreaterThan(0)
      for (const entry of filtered.operations) expect(entry.family).toBe(family)
    }
  })

  it("reports per-GPU kernel and serving coverage as separate counts", async () => {
    const { hardware } = await (await get("/hardware")).json()
    for (const gpu of hardware) {
      expect(typeof gpu.kernelRuns).toBe("number")
      expect(typeof gpu.servingRuns).toBe("number")
      expect(typeof gpu.families).toBe("number")
      expect(gpu.slug).toBeTruthy()
    }
  })

  it("keeps serving models and kernel model tags in separate arrays", async () => {
    const coverage = await (await get("/models")).json()
    expect(Array.isArray(coverage.serving)).toBe(true)
    expect(Array.isArray(coverage.kernel)).toBe(true)
    for (const tag of coverage.kernel) {
      expect(tag.model).not.toMatch(/^model:/)
      expect(tag.operations).toBeGreaterThan(0)
    }
  })

  it("serves the model dossier and 404s an unknown slug", async () => {
    const response = await get("/models/llama-3.1-8b")
    expect(response.status).toBe(200)
    const model = await response.json()
    expect(model.resolved).toBe(true)
    expect(model.selectedGpu).toBe("NVIDIA B200 SXM")
    const entry = model.groups[0].entries[0]
    // The fixture cohort's fastest is not deployable; the answer states both.
    expect(entry.fastest.sourceAvailable).toBe(false)
    expect(entry.deployable.installable).toBe(true)
    expect(model.gaps[0].operation.slug).toBe("fused-residual-rmsnorm")

    // A hyphen-boundary near miss resolves to the related-tag chooser.
    const near = await (await get("/models/llama-3.1")).json()
    expect(near.resolved).toBe(false)
    expect(near.model.relatedTags).toEqual(["llama-3.1-8b"])

    const missing = await get("/models/no-such-model")
    expect(missing.status).toBe(404)
    expect(missing.headers.get("Content-Type")).toContain(
      "application/problem+json",
    )
  })

  it("exposes the coverage page model", async () => {
    const coverage = await (await get("/coverage")).json()
    expect(coverage.illustrative).toBe(true)
    expect(coverage.hero.gpus.length).toBeGreaterThan(0)
    for (const source of coverage.sources)
      expect(["kernel", "serving"]).toContain(source.kind)
  })

  it("derives /sources from the coverage read", async () => {
    const [sources, coverage] = await Promise.all([
      (await get("/sources")).json(),
      (await get("/coverage")).json(),
    ])
    expect(sources.sources).toEqual(coverage.sources)
    expect(sources.generatedAt).toMatch(/Z$/)
  })
})
