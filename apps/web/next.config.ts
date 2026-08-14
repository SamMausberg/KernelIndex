import path from "node:path"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Monorepo root; without this Next infers it from stray lockfiles above the repo.
  turbopack: {
    root: path.join(import.meta.dirname, "../.."),
  },
}

export default nextConfig
