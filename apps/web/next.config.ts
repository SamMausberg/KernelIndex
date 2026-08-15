import path from "node:path"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Monorepo root; without this Next infers it from stray lockfiles above the repo.
  turbopack: {
    root: path.join(import.meta.dirname, "../.."),
  },
  experimental: {
    // Back/forward navigation reuses the client router cache briefly instead
    // of refetching every dynamic page.
    staleTimes: { dynamic: 30 },
  },
}

export default nextConfig
