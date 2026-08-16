import type { MetadataRoute } from "next"
import { env } from "@/server/env"

export default function robots(): MetadataRoute.Robots {
  const origin = env.SITE_ORIGIN ?? "https://kernelindex.com"
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private surfaces and the JSON API are not for crawlers (§18.2).
      disallow: ["/account", "/admin", "/api/", "/dev/"],
    },
    sitemap: `${origin}/sitemap.xml`,
  }
}
