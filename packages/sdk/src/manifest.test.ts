// Golden parity: ki's local digest must equal the server's canonical digest
// for the registry examples, and schema validation must reject structural
// breakage (Zod-only refinements are documented as schema-level passes).
import path from "node:path"
import { describe, expect, it } from "vitest"
import { digestManifest, validateManifest } from "./manifest.ts"

const examples = path.resolve(import.meta.dirname, "../../../registry/examples")

describe("ki manifest", () => {
  it("computes the canonical spec digest the catalog uses", () => {
    const { specDigest } = digestManifest(
      path.join(examples, "operation-spec.yaml"),
    )
    // The digest every other example references (registry digest chain).
    expect(specDigest).toBe(
      "sha256:7a3b25630f0628b21ed74b6adb588d28f7e29191f9038bed6f56ed393deefb5b",
    )
  })

  it("validates every registry example against its schema", () => {
    for (const file of [
      "operation-spec.yaml",
      "workload-case.yaml",
      "workload-suite.yaml",
      "software-project.yaml",
      "implementation-revision.yaml",
      "benchmark-protocol.yaml",
      "execution-environment.yaml",
      "benchmark-run.yaml",
    ]) {
      const result = validateManifest(path.join(examples, file))
      expect(result.valid, `${file}: ${result.errors.join("; ")}`).toBe(true)
    }
  })

  it("rejects structural breakage", () => {
    const bad = validateManifest(path.join(examples, "invalid/bad-digest.yaml"))
    expect(bad.valid).toBe(false)
    const unknown = validateManifest(
      path.join(examples, "invalid/unknown-field.yaml"),
    )
    expect(unknown.valid).toBe(false)
  })
})
