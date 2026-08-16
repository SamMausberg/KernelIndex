// Machine discoverability (§16.18): stable canonical URLs for the corpus.
import type { MetadataRoute } from "next"
import { getOperationIndex } from "@/lib/catalog"
import { env, servingEnabled } from "@/server/env"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = env.SITE_ORIGIN ?? "https://kernelindex.com"
  const index = await getOperationIndex()
  return [
    { url: origin },
    { url: `${origin}/search` },
    { url: `${origin}/records` },
    ...(servingEnabled ? [{ url: `${origin}/serving` }] : []),
    { url: `${origin}/docs` },
    { url: `${origin}/coverage` },
    ...index.map((operation) => ({
      url: `${origin}/operations/${operation.slug}`,
      lastModified: operation.lastObservedAt ?? undefined,
    })),
  ]
}
