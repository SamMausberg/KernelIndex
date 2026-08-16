import { describe, expect, it } from "vitest"
import { atomFeed } from "./feed.xml/route.ts"

describe("atom feed", () => {
  it("escapes markup in titles and builds stable entry identity", () => {
    const xml = atomFeed(
      [
        {
          at: new Date("2026-08-16T00:00:00Z"),
          cause: "new_record",
          runId: "run-1",
          operation: { name: "GEMM <n & k>", slug: "gemm" },
          implementation: `quote"'impl`,
          value: 12.5,
          unit: "µs",
        },
      ],
      "https://kernelindex.com",
    )
    expect(xml).not.toContain("<n & k>")
    expect(xml).toContain("GEMM &#60;n &#38; k&#62;")
    expect(xml).toContain("quote&#34;&#39;impl")
    expect(xml).toContain("tag:kernelindex.com,2026:record/run-1/new_record")
    expect(xml).toContain('<link href="https://kernelindex.com/runs/run-1"/>')
    expect(xml).toContain("<updated>2026-08-16T00:00:00.000Z</updated>")
  })

  it("serves an empty but well-formed feed", () => {
    const xml = atomFeed([], "https://kernelindex.com")
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">')
    expect(xml).toContain("<updated>1970-01-01T00:00:00.000Z</updated>")
  })
})
