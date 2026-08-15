// Local manifest tooling (§13.8): validation from the generated JSON
// Schemas in registry/schemas and the RFC 8785 canonical spec digest —
// no server round trip, no dependency on the web app's code.
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import ajv2020 from "ajv/dist/2020.js"
import ajvFormats from "ajv-formats"
import canonicalizeModule from "canonicalize"

// CJS interop under NodeNext: the callable/constructable lives on .default.
const Ajv2020 = ajv2020.default
const addFormats = ajvFormats.default
const canonicalize = canonicalizeModule as unknown as (
  value: unknown,
) => string | undefined

import { parse as parseYaml } from "yaml"

const SCHEMAS_DIR = path.resolve(
  import.meta.dirname,
  "../../../registry/schemas",
)

const kebab = (kind: string) =>
  kind.replaceAll(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()

type ManifestDocument = {
  apiVersion?: unknown
  kind?: unknown
  spec?: unknown
}

function load(file: string): ManifestDocument {
  const text = readFileSync(file, "utf8")
  const document = file.endsWith(".json") ? JSON.parse(text) : parseYaml(text)
  if (document === null || typeof document !== "object") {
    throw new Error(`${file}: not a manifest document`)
  }
  return document as ManifestDocument
}

export function validateManifest(file: string): {
  valid: boolean
  kind: string
  errors: string[]
} {
  const document = load(file)
  const kind = typeof document.kind === "string" ? document.kind : ""
  if (kind === "") return { valid: false, kind, errors: ["missing kind"] }
  let schema: unknown
  try {
    schema = JSON.parse(
      readFileSync(
        path.join(SCHEMAS_DIR, `${kebab(kind)}.v1alpha1.schema.json`),
        "utf8",
      ),
    )
  } catch {
    return { valid: false, kind, errors: [`no schema for kind '${kind}'`] }
  }
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  addFormats(ajv)
  const validate = ajv.compile(schema as object)
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

/** RFC 8785 canonical digest of the identity body {apiVersion, kind, spec}. */
export function digestManifest(file: string): {
  kind: string
  specDigest: string
} {
  const document = load(file)
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
