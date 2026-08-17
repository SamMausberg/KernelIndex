// The JSON route handlers serve seam models with CDN cache headers; they
// must keep working under the fixtures backend (e2e runs against it).
import { describe, expect, it } from "vitest"
import { GET as badge } from "./badges/implementations/[slug]/route.ts"
import { POST as beacon } from "./e/route.ts"
import { GET as recordsData } from "./records/data/route.ts"
import { GET as suggest } from "./suggest/route.ts"

describe("JSON routes", () => {
  it("/suggest serves the operation index with CDN caching", async () => {
    const response = await suggest()
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=300")
    const index = await response.json()
    expect(Array.isArray(index)).toBe(true)
    expect(index[0]).toMatchObject({ slug: expect.any(String) })
    expect(Array.isArray(index[0].aliases)).toBe(true)
  })

  it("/records/data serves the full ledger model with CDN caching", async () => {
    const response = await recordsData()
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=300")
    const model = await response.json()
    expect(Array.isArray(model.records)).toBe(true)
    expect(Array.isArray(model.hardwareOptions)).toBe(true)
  })

  it("/badges serves a record-count SVG and 404s unknown slugs", async () => {
    const request = new Request("http://test/badges")
    const response = await badge(request, {
      params: Promise.resolve({ slug: "meridian-rmsnorm.svg" }),
    })
    expect(response.headers.get("Content-Type")).toBe("image/svg+xml")
    const svg = await response.text()
    expect(svg).toContain("kernelindex")
    expect(svg).not.toContain("<script")
    const missing = await badge(request, {
      params: Promise.resolve({ slug: "no-such-kernel" }),
    })
    expect(missing.status).toBe(404)
  })

  it("/e answers 204 to every beacon, hostile ones included", async () => {
    const post = (body: string) =>
      beacon(new Request("http://test/e", { method: "POST", body }))
    for (const body of [
      JSON.stringify({ event: "evidence_opened", kind: "run" }),
      JSON.stringify({ event: "drop table", kind: "run" }),
      "not json",
      "x".repeat(10_000),
    ]) {
      expect((await post(body)).status).toBe(204)
    }
  })
})
