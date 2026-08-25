import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ImplementationDossier } from "@kernelindex/sdk"
import { afterEach, describe, expect, it } from "vitest"
import { vendorPlan, writeVendoredSource } from "./vendor.ts"

/** Minimal dossier: only the fields vendorPlan reads. */
function dossier(over: {
  install?: { kind: string; command: string } | null
  sourceCode?: Partial<NonNullable<ImplementationDossier["sourceCode"]>> | null
}): ImplementationDossier {
  return {
    implementation: {
      slug: "ionflux-rmsnorm",
      name: "ionflux-rmsnorm",
      digest: "sha256:abc123",
    },
    project: { name: "IonFlux" },
    usage: { install: over.install ?? null, invocationExample: null },
    source: {
      url: "https://github.com/example/ionflux",
      commit: "deadbeefcafe",
    },
    license: { declared: "MIT", concluded: null },
    sourceCode:
      over.sourceCode === undefined
        ? null
        : (over.sourceCode as ImplementationDossier["sourceCode"]),
  } as ImplementationDossier
}

describe("vendorPlan", () => {
  it("prefers the verified install command when a package exists", () => {
    const plan = vendorPlan(
      dossier({ install: { kind: "pip", command: "pip install ionflux" } }),
      "2026-08-23",
    )
    expect(plan).toEqual({
      kind: "install",
      command: "pip install ionflux",
      installKind: "pip",
    })
  })

  it("vendors mirrored source with full provenance in the header", () => {
    const plan = vendorPlan(
      dossier({
        sourceCode: {
          fileName: "rmsnorm.py",
          language: "python",
          content: "def rmsnorm(x):\n    ...\n",
          license: "Apache-2.0",
          attribution: { text: "© IonFlux authors", url: null },
        },
      }),
      "2026-08-23",
    )
    if (plan.kind !== "vendor") throw new Error("expected vendor plan")
    expect(plan.fileName).toBe("rmsnorm.py")
    expect(plan.license).toBe("Apache-2.0")
    const header = plan.content.split("\n\n")[0]
    for (const fact of [
      "# Vendored from KernelIndex · https://kernelindex.com/implementations/ionflux-rmsnorm",
      "# commit deadbeefcafe",
      "# revision digest sha256:abc123",
      "# license Apache-2.0",
      "# © IonFlux authors",
      "# retrieved 2026-08-23",
    ])
      expect(header).toContain(fact)
    expect(plan.content.endsWith("def rmsnorm(x):\n    ...\n")).toBe(true)
  })

  it("refuses when there is no public source", () => {
    const plan = vendorPlan(dossier({ sourceCode: null }), "2026-08-23")
    expect(plan).toEqual({
      kind: "none",
      reason: "No public source for ionflux-rmsnorm: benchmark evidence only.",
    })
  })
})

describe("writeVendoredSource", () => {
  const roots: string[] = []
  const temporaryRoot = () => {
    const root = mkdtempSync(join(tmpdir(), "ki-vendor-"))
    roots.push(root)
    return root
  }

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true })
  })

  it("creates a nested source path beneath the selected root", () => {
    const root = temporaryRoot()
    const written = writeVendoredSource(
      root,
      "safe-slug",
      "src/kernels/rmsnorm.py",
      "source",
    )
    expect(readFileSync(written, "utf8")).toBe("source")
  })

  it.each([
    ["slug", "../victim"],
    ["slug", "a/../../victim"],
    ["slug", "..\\victim"],
    ["../slug", "source.py"],
    ["C:slug", "source.py"],
    ["slug", "NUL.txt"],
  ])("rejects unsafe slug/file pairs", (slug, fileName) => {
    expect(() =>
      writeVendoredSource(temporaryRoot(), slug, fileName, "source"),
    ).toThrow(/unsafe/)
  })

  it("preserves existing files and rejects links outside the root", () => {
    const root = temporaryRoot()
    const outside = temporaryRoot()
    const existing = join(root, "existing.py")
    writeFileSync(existing, "local edits")
    expect(() =>
      writeVendoredSource(root, null, "existing.py", "remote"),
    ).toThrow(/refusing to overwrite/)
    expect(readFileSync(existing, "utf8")).toBe("local edits")

    symlinkSync(outside, join(root, "linked"), "dir")
    expect(() =>
      writeVendoredSource(root, null, "linked/source.py", "remote"),
    ).toThrow(/unsafe source path/)
  })
})
