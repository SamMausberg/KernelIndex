import path from "node:path"
import type { NextConfig } from "next"

/**
 * Security headers (§18.2). CSP keeps `script-src 'unsafe-inline'`
 * deliberately: a nonce-based policy would force every ISR/CDN-cached page
 * dynamic, and Next's inline flight scripts change per revalidation so
 * hashes cannot work. Compensating controls and the divergence record live
 * in docs/hardening.md (no user-supplied HTML anywhere; the single
 * dangerouslySetInnerHTML is server-side Shiki output).
 */
const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // React dev mode needs eval() for its debugging features; production
      // React never calls it, so the allowance is dev-only.
      `script-src 'self' 'unsafe-inline'${
        process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
      }`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
  // Domain is stable; no preload yet (a one-way door).
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
]

const nextConfig: NextConfig = {
  // Monorepo root; without this Next infers it from stray lockfiles above the repo.
  turbopack: {
    root: path.join(import.meta.dirname, "../.."),
  },
  // CDN stale-while-revalidate ceiling: edge regions the post-deploy warm
  // can't reach may serve the previous deployment's copy; ten minutes bounds
  // that window instead of the multi-hour default, so users stop seeing
  // mixed build ids after a deploy.
  expireTime: 600,
  // The hosted /mcp route's manifest tools read the generated registry
  // schemas at runtime through a dynamic path the file tracer cannot see;
  // include them so validate_manifest answers on the deployment, not only
  // from a checkout.
  outputFileTracingIncludes: {
    "/mcp": ["../../registry/schemas/**"],
  },
  experimental: {
    // Back/forward navigation reuses the client router cache briefly instead
    // of refetching every dynamic page.
    staleTimes: { dynamic: 30 },
  },
  async headers() {
    return [
      { source: "/(.*)", headers: SECURITY_HEADERS },
      // Auth responses must never be cached by any intermediary.
      {
        source: "/api/auth/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ]
  },
}

export default nextConfig
