// Canonical identity (§9.2): the identity body is {apiVersion, kind, spec} —
// editorial metadata never contributes to a digest. The body is serialized
// with RFC 8785 JSON Canonicalization and hashed with SHA-256.
import { createHash } from "node:crypto"
import canonicalize from "canonicalize"
import type { AnyManifest } from "../../schemas/kinds.ts"

export type Digest = `sha256:${string}`

export function sha256Digest(data: string | Uint8Array): Digest {
  return `sha256:${createHash("sha256").update(data).digest("hex")}`
}

/** RFC 8785 canonical JSON of a manifest's identity body. */
export function canonicalIdentityJson(manifest: AnyManifest): string {
  const body = {
    apiVersion: manifest.apiVersion,
    kind: manifest.kind,
    spec: manifest.spec,
  }
  const canonical = canonicalize(body)
  if (canonical === undefined)
    throw new Error("identity body is not canonicalizable")
  return canonical
}

/** Content digest of a validated manifest's semantic body. */
export function specDigest(manifest: AnyManifest): Digest {
  return sha256Digest(canonicalIdentityJson(manifest))
}
