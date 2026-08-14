// Bounded manifest intake (§9.2 step 1). YAML is accepted for authoring and
// JSON parses as its subset; the parsed document is then strictly validated.
// YAML text is never an identity: digests come from the canonical JSON body.
import { parse as parseYaml } from "yaml"
import { type AnyManifest, anyManifest } from "./kinds.ts"

const MAX_MANIFEST_BYTES = 1_048_576

/**
 * Parse one manifest document from YAML or JSON text with duplicate-key
 * rejection, no custom tags, bounded aliases, and a bounded document size.
 */
export function parseManifestText(text: string): AnyManifest {
  if (Buffer.byteLength(text, "utf8") > MAX_MANIFEST_BYTES) {
    throw new Error(`manifest exceeds ${MAX_MANIFEST_BYTES} bytes`)
  }
  const document: unknown = parseYaml(text, {
    schema: "core",
    version: "1.2",
    uniqueKeys: true,
    maxAliasCount: 100,
    strict: true,
  })
  return anyManifest.parse(document)
}

/** Validate an already-parsed manifest document. */
export function parseManifestDocument(document: unknown): AnyManifest {
  return anyManifest.parse(document)
}
