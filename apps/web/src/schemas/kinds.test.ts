// Schema boundary behavior (§21.1): strictness, normalization, and rejection
// of ambiguous or invalid manifests.
import { describe, expect, it } from "vitest"
import { parseManifestDocument } from "./parse.ts"

const envelope = (kind: string, spec: unknown, name = "test-object") => ({
  apiVersion: "kernelindex.dev/v1alpha1",
  kind,
  metadata: { name },
  spec,
})

describe("manifest schemas", () => {
  it("rejects unknown fields everywhere", () => {
    expect(() =>
      parseManifestDocument(
        envelope("SoftwareProject", { name: "P", popularity: 9001 }),
      ),
    ).toThrow()
    expect(() =>
      parseManifestDocument({
        ...envelope("SoftwareProject", { name: "P" }),
        extra: true,
      }),
    ).toThrow()
  })

  it("rejects an unknown apiVersion or kind", () => {
    expect(() =>
      parseManifestDocument({
        ...envelope("SoftwareProject", { name: "P" }),
        kind: "Gadget",
      }),
    ).toThrow()
    expect(() =>
      parseManifestDocument({
        ...envelope("SoftwareProject", { name: "P" }),
        apiVersion: "kernelindex.dev/v2",
      }),
    ).toThrow()
  })

  it("requires a value on constant axes", () => {
    const spec = {
      family: "rmsnorm",
      axes: { hidden: { role: "constant", type: "integer" } },
      inputs: [{ name: "input", tensor: { shape: ["hidden"], dtype: "bf16" } }],
      outputs: [
        { name: "output", tensor: { shape: ["hidden"], dtype: "bf16" } },
      ],
      semantics: { mutation: "none", determinism: "deterministic" },
    }
    expect(() =>
      parseManifestDocument(envelope("OperationSpec", spec)),
    ).toThrow()
  })

  it("requires an argument to be exactly one of tensor or scalar", () => {
    const spec = {
      family: "rmsnorm",
      axes: {},
      inputs: [
        {
          name: "x",
          tensor: { shape: [1], dtype: "bf16" },
          scalar: { dtype: "fp32" },
        },
      ],
      outputs: [{ name: "y", tensor: { shape: [1], dtype: "bf16" } }],
      semantics: { mutation: "none", determinism: "deterministic" },
    }
    expect(() =>
      parseManifestDocument(envelope("OperationSpec", spec)),
    ).toThrow()
  })

  it("bounds correctness ratios to [0, 1]", () => {
    const spec = {
      operationSpecDigest: `sha256:${"0".repeat(64)}`,
      axes: { tokens: 8 },
      tensors: { input: { shape: [8], dtype: "bf16" } },
      correctness: {
        comparator: "elementwise_close",
        requiredMatchedRatio: 1.5,
      },
    }
    expect(() =>
      parseManifestDocument(envelope("WorkloadCase", spec)),
    ).toThrow()
  })

  it("rejects non-sha256 digests", () => {
    const spec = {
      operationSpecDigest: "md5:abc123",
      axes: {},
      tensors: { input: { shape: [8], dtype: "bf16" } },
      correctness: { comparator: "elementwise_close" },
    }
    expect(() =>
      parseManifestDocument(envelope("WorkloadCase", spec)),
    ).toThrow()
  })
})
