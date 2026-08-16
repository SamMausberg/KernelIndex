import { describe, expect, it } from "vitest"
import { safeNextPath } from "./paths.ts"

describe("safeNextPath", () => {
  it("keeps same-site absolute paths", () => {
    expect(safeNextPath("/operations/rmsnorm")).toBe("/operations/rmsnorm")
    expect(safeNextPath("/runs/018f?x=1#frag")).toBe("/runs/018f?x=1#frag")
  })

  it("rejects everything that could leave the site", () => {
    for (const hostile of [
      "//evil.example",
      "/\\evil.example",
      "https://evil.example",
      "javascript:alert(1)",
      "operations/rmsnorm",
      "",
      undefined,
      ["/a", "/b"],
    ])
      expect(safeNextPath(hostile)).toBe("/account")
  })
})
