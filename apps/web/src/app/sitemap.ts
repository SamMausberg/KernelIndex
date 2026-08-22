// Machine discoverability (§16.18): stable canonical URLs for the corpus.
import type { MetadataRoute } from "next"
import {
  getHardwareIndex,
  getModelIndex,
  getOperationIndex,
  getProjectIndex,
} from "@/lib/catalog"
import { env, servingEnabled } from "@/server/env"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = env.SITE_ORIGIN ?? "https://kernelindex.com"
  const [index, hardware, models, projects] = await Promise.all([
    getOperationIndex(),
    getHardwareIndex(),
    getModelIndex(),
    getProjectIndex(),
  ])
  return [
    { url: origin },
    { url: `${origin}/search` },
    { url: `${origin}/records` },
    { url: `${origin}/feed` },
    { url: `${origin}/gpus` },
    { url: `${origin}/models` },
    { url: `${origin}/projects` },
    ...(servingEnabled ? [{ url: `${origin}/serving` }] : []),
    { url: `${origin}/docs` },
    { url: `${origin}/docs/api` },
    { url: `${origin}/legal` },
    ...hardware.gpus.map((gpu) => ({
      url: `${origin}/gpus/${gpu.slug}`,
      lastModified: gpu.lastObservedAt ?? undefined,
    })),
    ...models.kernel.map((entry) => ({
      url: `${origin}/models/${entry.model}`,
      lastModified: entry.lastObservedAt ?? undefined,
    })),
    ...projects.projects.map((project) => ({
      url: `${origin}/projects/${project.slug}`,
      lastModified: project.lastObservedAt ?? undefined,
    })),
    ...index.map((operation) => ({
      url: `${origin}/operations/${operation.slug}`,
      lastModified: operation.lastObservedAt ?? undefined,
    })),
  ]
}
