// The two JSON route handlers serve seam models with CDN cache headers;
// they must keep working under the fixtures backend (e2e runs against it).
import { describe, expect, it } from "vitest"
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
})
