// The one restricted fetch module (§14.9): allowlisted HTTPS hosts only,
// resolved addresses checked against private/reserved ranges, redirects
// revalidated, bytes and duration capped, and every response digested into an
// immutable snapshot before anything parses it (§14.3).
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { type Digest, sha256Digest } from "../identity/digest.ts"

/** Which importer parsed a snapshot; recorded on every snapshot row. */
export type ParserIdentity = { name: string; version: string }

const ALLOWED_HOSTS = new Set([
  "research.nvidia.com",
  "raw.githubusercontent.com",
  "api.github.com",
  "huggingface.co",
  "datasets-server.huggingface.co",
])

/**
 * Hugging Face serves dataset blobs from signed, region-suffixed CDN hosts
 * (`us.aws.cdn.hf.co`, `cdn-lfs-us-1.hf.co`, …) whose names are neither
 * stable nor enumerable, so the suffix is allowlisted instead of the host.
 * Every other guard still applies: HTTPS only, no IP literals, and the
 * resolved addresses are still rejected if they land in a private range.
 */
const ALLOWED_HOST_SUFFIXES = [".hf.co", ".huggingface.co"]

const MAX_BYTES = 8 * 1024 * 1024
const MAX_REDIRECTS = 3
const TIMEOUT_MS = 30_000
/** Bodies above this stay digest-only in source_snapshots (§10.9). */
export const INLINE_BODY_LIMIT = 512 * 1024

/** Ranged reads serve parquet column chunks, which exceed the body cap. */
const MAX_RANGE_BYTES = 256 * 1024 * 1024
/** Attempts spent honouring 429/503 before a fetch is called failed. */
const THROTTLE_ATTEMPTS = 5
const THROTTLE_FALLBACK_MS = 2_000

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

export function hostAllowed(hostname: string): boolean {
  return (
    ALLOWED_HOSTS.has(hostname) ||
    ALLOWED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  )
}

async function assertAllowed(url: URL): Promise<void> {
  if (url.protocol !== "https:")
    throw new Error(`refusing non-HTTPS locator ${url.href}`)
  if (!hostAllowed(url.hostname)) {
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

/** Retry-After is either a delay in seconds or an HTTP date. */
function retryDelayMs(header: string | null): number {
  if (!header) return THROTTLE_FALLBACK_MS
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds) * 1000
  const at = Date.parse(header)
  return Number.isNaN(at) ? THROTTLE_FALLBACK_MS : Math.max(0, at - Date.now())
}

/**
 * Walk one locator's redirects with every hop revalidated, backing off when
 * the host throttles us. Returns the final response and the URL it came from.
 */
async function request(
  locator: string,
  headers: Record<string, string> = {},
): Promise<{ response: Response; url: URL }> {
  let url = new URL(locator)
  let throttled = 0
  for (let redirects = 0; ; ) {
    await assertAllowed(url)
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "user-agent": "KernelIndex-importer/1 (+https://kernelindex.com)",
        ...headers,
      },
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location || redirects++ >= MAX_REDIRECTS) {
        throw new Error(`too many redirects fetching ${locator}`)
      }
      url = new URL(location, url)
      continue
    }
    // Politeness, not persistence: a throttled host is waited out a few
    // times, and anything else fails on the spot.
    if (
      (response.status === 429 || response.status === 503) &&
      throttled++ < THROTTLE_ATTEMPTS
    ) {
      const delay = retryDelayMs(response.headers.get("retry-after"))
      await new Promise((resolve) => setTimeout(resolve, delay))
      continue
    }
    if (!response.ok)
      throw new Error(`fetch ${url.href} failed with ${response.status}`)
    return { response, url }
  }
}

async function readBoundedBody(response: Response, url: URL, limit: number) {
  const contentLength = Number(response.headers.get("content-length"))
  if (Number.isFinite(contentLength) && contentLength > limit)
    throw new Error(`response from ${url.href} exceeds ${limit} bytes`)

  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      throw new Error(`response from ${url.href} exceeds ${limit} bytes`)
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/** Fetch one allowlisted HTTPS resource and digest it into a snapshot. */
export async function fetchSnapshot(locator: string): Promise<FetchedSnapshot> {
  const { response, url } = await request(locator)
  const bytes = await readBoundedBody(response, url, MAX_BYTES)
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

/** Total size of an allowlisted resource, without downloading it. */
export async function fetchSize(locator: string): Promise<number> {
  const { response, url } = await request(locator, { range: "bytes=0-0" })
  const contentRange = response.headers.get("content-range")
  const total = Number(contentRange?.split("/")[1])
  if (!Number.isFinite(total) || total <= 0)
    throw new Error(`${url.href} did not report a ranged size`)
  return total
}

/**
 * Read one byte range of an allowlisted resource (§14.9). Ranged reads exist
 * for column-oriented sources whose whole file dwarfs the facts we need, so
 * they carry their own, larger cap and are never digested as a snapshot: the
 * caller digests the file's own footer instead (§14.3).
 */
export async function fetchRange(
  locator: string,
  start: number,
  end: number,
): Promise<Uint8Array> {
  if (start < 0 || end <= start)
    throw new Error(`invalid range ${start}-${end} for ${locator}`)
  const length = end - start
  if (length > MAX_RANGE_BYTES)
    throw new Error(`range ${length} bytes exceeds ${MAX_RANGE_BYTES}`)
  const { response, url } = await request(locator, {
    range: `bytes=${start}-${end - 1}`,
  })
  if (response.status !== 206)
    throw new Error(`${url.href} ignored the range request`)
  return readBoundedBody(response, url, MAX_RANGE_BYTES)
}

/** Snapshot row for the publication bundle, inlining only bounded bodies. */
export function snapshotRow(
  snapshot: FetchedSnapshot,
  parser: ParserIdentity,
  observedAt?: Date,
) {
  return {
    locator: snapshot.locator,
    resolvedLocator: snapshot.resolvedLocator,
    contentDigest: snapshot.contentDigest,
    mediaType: snapshot.mediaType,
    sizeBytes: snapshot.sizeBytes,
    body: snapshot.sizeBytes <= INLINE_BODY_LIMIT ? snapshot.body : undefined,
    parserName: parser.name,
    parserVersion: parser.version,
    observedAt: observedAt ?? snapshot.fetchedAt,
    fetchedAt: snapshot.fetchedAt,
  }
}
