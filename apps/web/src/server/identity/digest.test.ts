// Digest vectors (§21.1): formatting and metadata never change identity;
// semantic order and normalized values do.
import { describe, expect, it } from "vitest"
import {
  parseManifestDocument,
  parseManifestText,
} from "../../schemas/parse.ts"
import { canonicalIdentityJson, specDigest } from "./digest.ts"

const vectorProject = {
  apiVersion: "kernelindex.dev/v1alpha1",
  kind: "SoftwareProject",
  metadata: { name: "vector-project" },
  spec: {
    name: "Vector Project",
    repository: "https://example.invalid/vector/project",
  },
}

function runManifest(median: number | string) {
  return {
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "BenchmarkRun",
    metadata: { name: "vector-run" },
    spec: {
      implementationDigest: `sha256:${"4".repeat(64)}`,
      workloadDigest: `sha256:${"1".repeat(64)}`,
      protocolDigest: `sha256:${"2".repeat(64)}`,
      environmentDigest: `sha256:${"3".repeat(64)}`,
      status: "passed",
      timing: { primaryStatistic: "median", latencyNs: { median } },
      observedAt: "2026-08-01T12:00:00Z",
    },
  }
}

describe("canonical identity digests", () => {
  it("matches the pinned vector (canonicalization drift alarm)", () => {
    const manifest = parseManifestDocument(vectorProject)
    expect(canonicalIdentityJson(manifest)).toBe(
      '{"apiVersion":"kernelindex.dev/v1alpha1","kind":"SoftwareProject","spec":{"name":"Vector Project","repository":"https://example.invalid/vector/project"}}',
    )
    expect(specDigest(manifest)).toBe(
      "sha256:bea60af06f12216679b113d6624c5293d59bef2104ccc27cd33c992d124e039d",
    )
  })

  it("is invariant to object key order and YAML formatting", () => {
    const flow = parseManifestText(
      `{apiVersion: kernelindex.dev/v1alpha1, kind: SoftwareProject, metadata: {name: vector-project}, spec: {repository: "https://example.invalid/vector/project", name: "Vector Project"}}`,
    )
    expect(specDigest(flow)).toBe(
      specDigest(parseManifestDocument(vectorProject)),
    )
  })

  it("excludes editorial metadata from identity", () => {
    const retitled = parseManifestDocument({
      ...vectorProject,
      metadata: { name: "another-name", title: "A different title" },
    })
    expect(specDigest(retitled)).toBe(
      specDigest(parseManifestDocument(vectorProject)),
    )
  })

  it("changes when semantically ordered lists change order", () => {
    const base = {
      apiVersion: "kernelindex.dev/v1alpha1",
      kind: "OperationSpec",
      metadata: { name: "vector-op" },
      spec: {
        family: "rmsnorm",
        axes: { tokens: { role: "variable", type: "integer" } },
        inputs: [
          { name: "input", tensor: { shape: ["tokens"], dtype: "bf16" } },
          { name: "weight", tensor: { shape: [4096], dtype: "bf16" } },
        ],
        outputs: [
          { name: "output", tensor: { shape: ["tokens"], dtype: "bf16" } },
        ],
        semantics: { mutation: "none", determinism: "deterministic" },
      },
    }
    const swapped = structuredClone(base)
    swapped.spec.inputs.reverse()
    expect(specDigest(parseManifestDocument(swapped))).not.toBe(
      specDigest(parseManifestDocument(base)),
    )
  })

  it("normalizes set-like lists so their order never changes identity", () => {
    const impl = (dtypes: string[]) =>
      parseManifestDocument({
        apiVersion: "kernelindex.dev/v1alpha1",
        kind: "ImplementationRevision",
        metadata: { name: "vector-impl" },
        spec: {
          projectRevision: {
            repository: "https://example.invalid/vector/project",
          },
          operation: { specDigest: `sha256:${"0".repeat(64)}` },
          callable: { language: "triton" },
          support: { hardwareArchitectures: ["sm_100"], dtypes },
          licensing: {},
        },
      })
    expect(specDigest(impl(["fp16", "bf16", "fp16"]))).toBe(
      specDigest(impl(["bf16", "fp16"])),
    )
  })

  it("digests unit-normalized values, not authoring spellings", () => {
    expect(specDigest(parseManifestDocument(runManifest("0.008 ms")))).toBe(
      specDigest(parseManifestDocument(runManifest(8000))),
    )
  })

  it("is stable under parse -> canonicalize -> parse", () => {
    const manifest = parseManifestDocument(runManifest(8000))
    const reparsed = parseManifestDocument({
      ...JSON.parse(canonicalIdentityJson(manifest)),
      metadata: { name: "vector-run" },
    })
    expect(specDigest(reparsed)).toBe(specDigest(manifest))
  })
})
