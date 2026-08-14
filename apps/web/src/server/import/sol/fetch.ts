// The one restricted fetch module (§14.9): allowlisted HTTPS hosts only,
// resolved addresses checked against private/reserved ranges, redirects
// revalidated, bytes and duration capped, and every response digested into an
// immutable snapshot before anything parses it (§14.3).
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { type Digest, sha256Digest } from "../../identity/digest.ts"
import { PARSER_NAME, PARSER_VERSION } from "./types.ts"

const ALLOWED_HOSTS = new Set([
  "research.nvidia.com",
  "raw.githubusercontent.com",
  "api.github.com",
  "huggingface.co",
  "datasets-server.huggingface.co",
])

const MAX_BYTES = 8 * 1024 * 1024
const MAX_REDIRECTS = 3
const TIMEOUT_MS = 30_000
/** Bodies above this stay digest-only in source_snapshots (§10.9). */
export const INLINE_BODY_LIMIT = 512 * 1024

export type FetchedSnapshot = {
  locator: string
  resolvedLocator: string
  contentDigest: Digest
  mediaType: string | undefined
  sizeBytes: number
  body: string
  fetchedAt: Date
}

function privateRange(address: string): boolean {
  if (address.includes(":")) {
    const lower = address.toLowerCase()
    return (
      lower === "::1" ||
      lower.startsWith("fe80") ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("::ffff:") // v4-mapped: re-checked as v4 below
    )
  }
  const octets = address.split(".").map(Number)
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    octets[0] === 0 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
  )
}

async function assertAllowed(url: URL): Promise<void> {
  if (url.protocol !== "https:")
    throw new Error(`refusing non-HTTPS locator ${url.href}`)
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(`host ${url.hostname} is not on the source allowlist`)
  }
  if (isIP(url.hostname))
    throw new Error(`refusing IP-literal locator ${url.href}`)
  const resolved = await lookup(url.hostname, { all: true })
  for (const { address } of resolved) {
    if (privateRange(address)) {
      throw new Error(
        `${url.hostname} resolves to a private or reserved address`,
      )
    }
  }
}

/** Fetch one allowlisted HTTPS resource and digest it into a snapshot. */
export async function fetchSnapshot(locator: string): Promise<FetchedSnapshot> {
  let url = new URL(locator)
  for (let redirects = 0; ; redirects++) {
    await assertAllowed(url)
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "user-agent": "KernelIndex-importer/1 (+https://kernelindex.com)",
      },
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location || redirects >= MAX_REDIRECTS) {
        throw new Error(`too many redirects fetching ${locator}`)
      }
      url = new URL(location, url)
      continue
    }
    if (!response.ok)
      throw new Error(`fetch ${url.href} failed with ${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > MAX_BYTES) {
      throw new Error(`response from ${url.href} exceeds ${MAX_BYTES} bytes`)
    }
    return {
      locator,
      resolvedLocator: url.href,
      contentDigest: sha256Digest(bytes),
      mediaType: response.headers.get("content-type")?.split(";")[0],
      sizeBytes: bytes.byteLength,
      body: new TextDecoder().decode(bytes),
      fetchedAt: new Date(),
    }
  }
}

/** Snapshot row for the publication bundle, inlining only bounded bodies. */
export function snapshotRow(snapshot: FetchedSnapshot, observedAt?: Date) {
  return {
    locator: snapshot.locator,
    resolvedLocator: snapshot.resolvedLocator,
    contentDigest: snapshot.contentDigest,
    mediaType: snapshot.mediaType,
    sizeBytes: snapshot.sizeBytes,
    body: snapshot.sizeBytes <= INLINE_BODY_LIMIT ? snapshot.body : undefined,
    parserName: PARSER_NAME,
    parserVersion: PARSER_VERSION,
    observedAt: observedAt ?? snapshot.fetchedAt,
    fetchedAt: snapshot.fetchedAt,
  }
}
