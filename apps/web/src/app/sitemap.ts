// Machine discoverability (§16.18): stable canonical URLs for the corpus.
import type { MetadataRoute } from "next"
import { getHardwareIndex, getOperationIndex } from "@/lib/catalog"
import { env, servingEnabled } from "@/server/env"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = env.SITE_ORIGIN ?? "https://kernelindex.com"
  const [index, hardware] = await Promise.all([
    getOperationIndex(),
    getHardwareIndex(),
  ])
  return [
    { url: origin },
    { url: `${origin}/search` },
    { url: `${origin}/records` },
    { url: `${origin}/gpus` },
    { url: `${origin}/implementations` },
    ...(servingEnabled ? [{ url: `${origin}/serving` }] : []),
    { url: `${origin}/docs` },
    { url: `${origin}/docs/api` },
    { url: `${origin}/coverage` },
    ...hardware.gpus.map((gpu) => ({
      url: `${origin}/gpus/${gpu.slug}`,
      lastModified: gpu.lastObservedAt ?? undefined,
    })),
    ...index.map((operation) => ({
      url: `${origin}/operations/${operation.slug}`,
      lastModified: operation.lastObservedAt ?? undefined,
    })),
  ]
}
