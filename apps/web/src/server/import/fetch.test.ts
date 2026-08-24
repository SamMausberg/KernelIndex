// SSRF controls of the restricted fetcher (§14.9, §18.1): scheme/host/IP
// gates, private and reserved ranges (v4, v6, v4-mapped, metadata),
// DNS-rebinding shape, redirect revalidation and caps, the byte cap, the
// suffix allowlist that admits a source's CDN, ranged reads, and throttle
// backoff. DNS and fetch are mocked — no live network.
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }))
const { lookup } = await import("node:dns/promises")
const { fetchRange, fetchSnapshot, hostAllowed } = await import("./fetch.ts")

const publicAddress = { address: "140.82.112.3", family: 4 }
const resolveTo = (...addresses: string[]) =>
  vi.mocked(lookup).mockResolvedValue(
    addresses.map((address) => ({
      address,
      family: address.includes(":") ? 6 : 4,
    })) as never,
  )

const body = (text: string, init: ResponseInit = {}) =>
  new Response(text, { status: 200, ...init })

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("restricted fetch (§14.9)", () => {
  it("refuses http, off-allowlist hosts, and IP literals", async () => {
    await expect(
      fetchSnapshot("http://raw.githubusercontent.com/x"),
    ).rejects.toThrow(/non-HTTPS/)
    await expect(fetchSnapshot("https://evil.example.com/x")).rejects.toThrow(
      /not on the source allowlist/,
    )
    await expect(fetchSnapshot("https://140.82.112.3/x")).rejects.toThrow(
      /not on the source allowlist/,
    )
  })

  it.each([
    "127.0.0.1",
    "10.0.0.8",
    "169.254.169.254",
    "192.168.1.1",
    "172.16.0.9",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:10.0.0.1",
  ])("rejects an allowlisted host resolving to %s", async (address) => {
    resolveTo(address)
    await expect(
      fetchSnapshot("https://raw.githubusercontent.com/x"),
    ).rejects.toThrow(/private or reserved/)
  })

  it("rejects the DNS-rebinding shape: one public, one private answer", async () => {
    resolveTo("140.82.112.3", "10.0.0.5")
    await expect(
      fetchSnapshot("https://raw.githubusercontent.com/x"),
    ).rejects.toThrow(/private or reserved/)
  })

  it("revalidates every redirect target against the allowlist", async () => {
    vi.mocked(lookup).mockResolvedValue([publicAddress] as never)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        body("", {
          status: 302,
          headers: { location: "https://attacker.example.com/steal" },
        }),
      ),
    )
    await expect(
      fetchSnapshot("https://raw.githubusercontent.com/x"),
    ).rejects.toThrow(/not on the source allowlist/)
  })

  it("caps redirects at three and streamed bytes at the maximum", async () => {
    vi.mocked(lookup).mockResolvedValue([publicAddress] as never)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        body("", {
          status: 302,
          headers: { location: "https://raw.githubusercontent.com/next" },
        }),
      ),
    )
    await expect(
      fetchSnapshot("https://raw.githubusercontent.com/x"),
    ).rejects.toThrow(/too many redirects/)

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => body("x".repeat(8 * 1024 * 1024 + 1))),
    )
    await expect(
      fetchSnapshot("https://raw.githubusercontent.com/big"),
    ).rejects.toThrow(/exceeds/)
  })

  it("rejects an oversized content-length before reading the body", async () => {
    vi.mocked(lookup).mockResolvedValue([publicAddress] as never)
    const response = new Response(null, {
      headers: {
        "content-length": String(8 * 1024 * 1024 + 1),
      },
    })
    Object.defineProperty(response, "body", {
      get(): never {
        throw new Error("body was read")
      },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response),
    )
    await expect(
      fetchSnapshot("https://raw.githubusercontent.com/big"),
    ).rejects.toThrow(/exceeds/)
  })

  it("admits a source's CDN by suffix and nothing else", () => {
    // Hugging Face signs dataset blobs onto region-suffixed hosts that
    // cannot be enumerated; look-alikes must still fail.
    expect(hostAllowed("us.aws.cdn.hf.co")).toBe(true)
    expect(hostAllowed("cdn-lfs-us-1.hf.co")).toBe(true)
    expect(hostAllowed("datasets-server.huggingface.co")).toBe(true)
    expect(hostAllowed("hf.co.evil.example")).toBe(false)
    expect(hostAllowed("nothf.co")).toBe(false)
    expect(hostAllowed("evil.example.com")).toBe(false)
  })

  it("still checks a CDN host's resolved addresses", async () => {
    resolveTo("10.0.0.5")
    await expect(
      fetchRange("https://us.aws.cdn.hf.co/blob", 0, 16),
    ).rejects.toThrow(/private or reserved/)
  })

  it("reads a byte range and refuses one the host ignored", async () => {
    vi.mocked(lookup).mockResolvedValue([publicAddress] as never)
    const seen: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: URL, init: RequestInit) => {
        seen.push((init.headers as Record<string, string>).range)
        return body("0123", { status: 206 })
      }),
    )
    const bytes = await fetchRange("https://us.aws.cdn.hf.co/blob", 8, 12)
    expect(seen).toEqual(["bytes=8-11"])
    expect(new TextDecoder().decode(bytes)).toBe("0123")

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => body("whole file", { status: 200 })),
    )
    await expect(
      fetchRange("https://us.aws.cdn.hf.co/blob", 8, 12),
    ).rejects.toThrow(/ignored the range request/)
  })

  it("waits out a throttling host, then gives up", async () => {
    vi.mocked(lookup).mockResolvedValue([publicAddress] as never)
    vi.useFakeTimers()
    try {
      let calls = 0
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          calls += 1
          return calls === 1
            ? body("", { status: 429, headers: { "retry-after": "0" } })
            : body("ok")
        }),
      )
      const snapshot = fetchSnapshot("https://huggingface.co/x")
      await vi.runAllTimersAsync()
      expect((await snapshot).body).toBe("ok")
      expect(calls).toBe(2)

      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          body("", { status: 429, headers: { "retry-after": "0" } }),
        ),
      )
      const exhausted = fetchSnapshot("https://huggingface.co/y")
      const assertion = expect(exhausted).rejects.toThrow(/failed with 429/)
      await vi.runAllTimersAsync()
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it("digests a good response into an immutable snapshot", async () => {
    vi.mocked(lookup).mockResolvedValue([publicAddress] as never)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        body('{"ok":true}', {
          headers: { "content-type": "application/json; charset=utf-8" },
        }),
      ),
    )
    const snapshot = await fetchSnapshot("https://raw.githubusercontent.com/ok")
    expect(snapshot.contentDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(snapshot.mediaType).toBe("application/json")
    expect(snapshot.body).toBe('{"ok":true}')
  })
})
