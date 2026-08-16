import type { MetadataRoute } from "next"
import { env } from "@/server/env"

export default function robots(): MetadataRoute.Robots {
  const origin = env.SITE_ORIGIN ?? "https://kernelindex.com"
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${origin}/sitemap.xml`,
  }
}
