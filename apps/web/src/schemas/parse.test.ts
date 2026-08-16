// Hostile-input bounds of the manifest parser (§9.2, §21.1): document size,
// duplicate keys, custom tags, alias bombs, and deep nesting all fail
// cleanly and quickly — parser work is bounded for hostile input.
import { describe, expect, it } from "vitest"
import { parseManifestText } from "./parse.ts"

describe("manifest parser bounds (§9.2)", () => {
  it("rejects documents over the size cap", () => {
    expect(() =>
      parseManifestText(`kind: OperationSpec\nx: "${"a".repeat(1_048_576)}"`),
    ).toThrow(/exceeds|large|bytes/i)
  })

  it("rejects duplicate keys instead of last-wins", () => {
    expect(() =>
      parseManifestText("kind: OperationSpec\nkind: BenchmarkRun\n"),
    ).toThrow()
  })

  it("rejects custom tags (no executable YAML)", () => {
    expect(() =>
      parseManifestText('kind: !!js/function "function(){}"\n'),
    ).toThrow()
  })

  it("rejects alias expansion beyond the bound", () => {
    const anchors = 'a: &a ["x","x","x","x"]\n'
    const refs = `b: [${Array.from({ length: 200 }, () => "*a").join(",")}]\n`
    expect(() => parseManifestText(anchors + refs)).toThrow()
  })

  it("fails deep nesting cleanly instead of hanging", () => {
    const deep = `x: ${"[".repeat(50_000)}`
    const started = performance.now()
    expect(() => parseManifestText(deep)).toThrow()
    expect(performance.now() - started).toBeLessThan(5_000)
  })

  it("rejects non-object documents at the envelope", () => {
    expect(() => parseManifestText("- just\n- a\n- list\n")).toThrow()
    expect(() => parseManifestText('"scalar"')).toThrow()
  })
})
