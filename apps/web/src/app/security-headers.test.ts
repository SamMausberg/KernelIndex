// §18.2 secure defaults: the header set every response carries. The CSP's
// script-src 'unsafe-inline' divergence is recorded in docs/hardening.md;
// this test locks the rest of the posture.
import { describe, expect, it } from "vitest"
import config from "../../next.config.ts"

describe("security headers (§18.2)", () => {
  it("declares CSP, HSTS, nosniff, referrer, and permissions policies", async () => {
    const rules = await config.headers?.()
    if (!rules) throw new Error("headers() missing from next.config")
    const all = Object.fromEntries(
      (rules.find((rule) => rule.source === "/(.*)")?.headers ?? []).map(
        (header) => [header.key, header.value],
      ),
    )
    expect(all["Content-Security-Policy"]).toContain("frame-ancestors 'none'")
    expect(all["Content-Security-Policy"]).toContain("object-src 'none'")
    expect(all["Content-Security-Policy"]).not.toContain("unsafe-eval")
    expect(all["Strict-Transport-Security"]).toContain("max-age=")
    expect(all["X-Content-Type-Options"]).toBe("nosniff")
    expect(all["Referrer-Policy"]).toBe("strict-origin-when-cross-origin")
    expect(all["Permissions-Policy"]).toContain("camera=()")

    const auth = rules.find((rule) => rule.source.startsWith("/api/auth"))
    expect(auth?.headers).toEqual([{ key: "Cache-Control", value: "no-store" }])
  })
})
