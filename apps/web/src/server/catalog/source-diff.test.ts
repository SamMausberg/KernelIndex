import { describe, expect, it } from "vitest"
import { diffSource } from "./source-diff.ts"

describe("diffSource", () => {
  it("produces context-bounded hunks with elision markers", () => {
    const previous = [
      ...Array.from({ length: 20 }, (_, i) => `line ${i}`),
      "old middle",
      ...Array.from({ length: 20 }, (_, i) => `tail ${i}`),
    ].join("\n")
    const current = previous.replace("old middle", "new middle")
    const lines = diffSource(previous, current)
    expect(lines.some((l) => l.kind === "del" && l.text === "old middle")).toBe(
      true,
    )
    expect(lines.some((l) => l.kind === "add" && l.text === "new middle")).toBe(
      true,
    )
    // Unchanged runs outside the 3-line context collapse into one marker.
    expect(lines.filter((l) => l.text.includes("unchanged lines"))).not.toEqual(
      [],
    )
    expect(lines.length).toBeLessThan(15)
  })

  it("caps pathological diffs", () => {
    const previous = Array.from({ length: 3000 }, (_, i) => `a${i}`).join("\n")
    const current = Array.from({ length: 3000 }, (_, i) => `b${i}`).join("\n")
    const lines = diffSource(previous, current)
    expect(lines.length).toBeLessThanOrEqual(1201)
    expect(lines.at(-1)?.text).toContain("truncated")
  })
})
