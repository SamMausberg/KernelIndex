// The hosted MCP endpoint (§13.10) answers a Streamable HTTP round trip
// with the same tool list the stdio package serves.
import { describe, expect, it } from "vitest"

process.env.CATALOG_BACKEND = "fixtures"
const { POST } = await import("./route.ts")

const rpc = (body: unknown) =>
  POST(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(body),
    }),
  )

describe("/mcp", () => {
  it("lists every tool over one stateless POST", async () => {
    const response = await rpc({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    const names = body.result.tools.map((tool: { name: string }) => tool.name)
    expect(names).toContain("search_catalog")
    expect(names).toContain("find_precedents")
    expect(names).toHaveLength(18)
  })
})
