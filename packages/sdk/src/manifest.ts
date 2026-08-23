// Local manifest tooling (§13.8): validation from the generated JSON
// Schemas in registry/schemas and the RFC 8785 canonical spec digest —
// no server round trip, no dependency on the web app's code.
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import ajv2020 from "ajv/dist/2020.js"
import ajvFormats from "ajv-formats"
import canonicalizeModule from "canonicalize"

// CJS interop: under NodeNext the constructable sits on .default, under an
// esModuleInterop consumer (the web app hosting /mcp) it is the export
// itself. The runtime picks whichever exists; the type comes from the ESM
// namespace, which both configurations agree on.
const Ajv2020 = ((ajv2020 as { default?: unknown }).default ??
  ajv2020) as typeof import("ajv/dist/2020.js").default
const addFormats = ((ajvFormats as { default?: unknown }).default ??
  ajvFormats) as typeof import("ajv-formats").default
const canonicalize = canonicalizeModule as unknown as (
  value: unknown,
) => string | undefined

import { parse as parseYaml } from "yaml"

// Located by walking up from this file, so the tooling keeps working from a
// build output directory or a moved file — not just the exact src/ layout.
// Resolved lazily: a bundler that rewrites import.meta must not break the
// module at load time; only the schema-reading functions need the path, and
// without one they fail closed.
let schemasDir: string | null | undefined
function locateSchemasDir(): string | null {
  // A bundler may rewrite import.meta.dirname away; the process working
  // directory then anchors the walk (on a server deployment it sits inside
  // the traced filesystem, with registry/schemas above it).
  const here: string | undefined = import.meta.dirname ?? process.cwd()
  if (!here) return null
  // A published package ships the generated schemas beside this file; a
  // checkout finds them by walking up to registry/schemas.
  const bundled = path.join(here, "schemas")
  if (existsSync(bundled)) return bundled
  let dir = here
  while (true) {
    const candidate = path.join(dir, "registry", "schemas")
    if (existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    // No checkout above us: reads fail closed.
    if (parent === dir) return null
    dir = parent
  }
}
function resolveSchemasDir(): string | null {
  if (schemasDir === undefined) schemasDir = locateSchemasDir()
  return schemasDir
}

const kebab = (kind: string) =>
  kind.replaceAll(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()

type ManifestDocument = {
  apiVersion?: unknown
  kind?: unknown
  spec?: unknown
}

/** Parse manifest text (YAML or JSON) into a document object. */
export function parseManifestText(
  text: string,
  format: "yaml" | "json" = "yaml",
): ManifestDocument {
  const document = format === "json" ? JSON.parse(text) : parseYaml(text)
  if (document === null || typeof document !== "object") {
    throw new Error("not a manifest document")
  }
  return document as ManifestDocument
}

function load(file: string): ManifestDocument {
  return parseManifestText(
    readFileSync(file, "utf8"),
    file.endsWith(".json") ? "json" : "yaml",
  )
}

/** The generated JSON Schema for a manifest kind, or null when unknown. */
export function readManifestSchema(kind: string): object | null {
  const dir = resolveSchemasDir()
  if (dir === null) return null
  try {
    return JSON.parse(
      readFileSync(
        path.join(dir, `${kebab(kind)}.v1alpha1.schema.json`),
        "utf8",
      ),
    )
  } catch {
    return null
  }
}

export function validateManifestDocument(document: ManifestDocument): {
  valid: boolean
  kind: string
  errors: string[]
} {
  const kind = typeof document.kind === "string" ? document.kind : ""
  if (kind === "") return { valid: false, kind, errors: ["missing kind"] }
  const schema = readManifestSchema(kind)
  if (schema === null)
    return { valid: false, kind, errors: [`no schema for kind '${kind}'`] }
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  addFormats(ajv)
  const validate = ajv.compile(schema)
  const valid = validate(document)
  return {
    valid: valid === true,
    kind,
    errors: (validate.errors ?? []).map(
      (error: { instancePath: string; message?: string }) =>
        `${error.instancePath || "/"}: ${error.message ?? "invalid"}`,
    ),
  }
}

export function validateManifest(file: string) {
  return validateManifestDocument(load(file))
}

/** RFC 8785 canonical digest of the identity body {apiVersion, kind, spec}. */
export function digestManifestDocument(document: ManifestDocument): {
  kind: string
  specDigest: string
} {
  const canonical = canonicalize({
    apiVersion: document.apiVersion,
    kind: document.kind,
    spec: document.spec,
  })
  if (canonical === undefined) throw new Error("not canonicalizable")
  return {
    kind: String(document.kind),
    specDigest: `sha256:${createHash("sha256").update(canonical).digest("hex")}`,
  }
}

export function digestManifest(file: string) {
  return digestManifestDocument(load(file))
}
