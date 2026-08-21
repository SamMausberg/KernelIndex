// The fixture/read seam (§27.5). Pages call these functions and never
// know which backend produced the model. `CATALOG_BACKEND` selects the
// implementation: "fixtures" (default, deterministic, visibly illustrative)
// or "postgres" (real published records).
import { createHash } from "node:crypto"
import { unstable_cache } from "next/cache.js"
import { cache } from "react"
import type {
  ComparePageModel,
  CoveragePageModel,
  HardwareIndexModel,
  HardwarePageModel,
  HomePageModel,
  ImplementationPageModel,
  OperationIndexEntry,
  OperationPageModel,
  ProjectIndexModel,
  RecordsPageModel,
  RunListInput,
  RunPageModel,
  SearchInput,
  SearchPageModel,
} from "./catalog-models"
import type {
  ServingConfigurationSummary,
  ServingFacetsModel,
  ServingResolveInput,
  ServingResolveModel,
  ServingRunPageModel,
  ServingRunSummary,
} from "./serving-models"

export type * from "./catalog-models"
export type * from "./serving-models"

type CatalogReads = {
  getHomePage(): Promise<HomePageModel>
  getRecordsPage(): Promise<RecordsPageModel>
  getOperationIndex(): Promise<OperationIndexEntry[]>
  searchCatalog(input: SearchInput): Promise<SearchPageModel>
  getOperationPage(
    slug: string,
    workload?: string,
    cohort?: string,
  ): Promise<OperationPageModel | null>
  getImplementationPage(slug: string): Promise<ImplementationPageModel | null>
  getRunPage(id: string): Promise<RunPageModel | null>
  getComparePage(runIds: string[]): Promise<ComparePageModel>
  getCoveragePage(): Promise<CoveragePageModel>
  getHardwareIndex(): Promise<HardwareIndexModel>
  getHardwarePage(slug: string): Promise<HardwarePageModel | null>
  getProjectIndex(): Promise<ProjectIndexModel>
  // Serving (§8.16): a separate resolver surface behind the same seam.
  getServingFacets(): Promise<ServingFacetsModel>
  resolveServing(input: ServingResolveInput): Promise<ServingResolveModel>
  getServingRunPage(id: string): Promise<ServingRunPageModel | null>
  listServingRuns(input: {
    cursor?: string
    limit?: number
  }): Promise<{ runs: ServingRunSummary[]; nextCursor: string | null }>
  listServingConfigurations(): Promise<ServingConfigurationSummary[]>
}

// Server-only: both backends are loaded lazily so fixture mode never touches
// the database driver.
async function reads(): Promise<CatalogReads> {
  const { env } = await import("@/server/env")
  if (env.CATALOG_BACKEND === "postgres") {
    return await import("@/server/catalog/reads")
  }
  return await import("@/data/fixtures/catalog")
}

// Two cache layers: React request-level `cache` (a page and its
// generateMetadata share one read) over `unstable_cache` (results survive
// across requests for five minutes). Data changes only through the CLI
// importer, so short time-based staleness is acceptable (§16). Keys are
// namespaced by backend: locally the fixtures (e2e) and postgres servers
// share .next/cache, and entries must never cross the seam.
const REVALIDATE_SECONDS = 300
// Outside the Next server (vitest, CLI scripts) there is no incremental
// cache; the seam then runs uncached rather than crashing.
const cached: typeof unstable_cache = process.env.NEXT_RUNTIME
  ? unstable_cache
  : (fn) => fn
// Bump when a read model changes shape: the deployed data cache outlives a
// deploy, and an old-shape entry must never deserialize into new readers
// (v3: ResultRow/RecordHolder gained indexedAt; CoverageSource gained indexed).
const MODEL_VERSION = "v3"
// The database identity is part of the namespace too: two local servers on
// different databases share .next/cache and must never trade entries.
const BACKEND = `${
  process.env.CATALOG_BACKEND === "postgres"
    ? `pg-${createHash("sha256")
        .update(process.env.DATABASE_URL ?? "")
        .digest("hex")
        .slice(0, 8)}`
    : "fx"
}-${MODEL_VERSION}`

export const getHomePage = cache(
  cached(
    async (): Promise<HomePageModel> => {
      return (await reads()).getHomePage()
    },
    ["home", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

// The full ledger model outgrows the framework data cache's entry limit as
// the corpus scales; the postgres backend memoizes it in-process instead
// (shared with the GPU/project surfaces), so this layer is request-dedupe
// only.
export const getRecordsPage = cache(async (): Promise<RecordsPageModel> => {
  return (await reads()).getRecordsPage()
})

export const getOperationIndex = cache(
  cached(
    async (): Promise<OperationIndexEntry[]> => {
      return (await reads()).getOperationIndex()
    },
    ["operation-index", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

export const searchCatalog = cache(
  cached(
    async (input: SearchInput): Promise<SearchPageModel> => {
      return (await reads()).searchCatalog(input)
    },
    ["search", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

export const getOperationPage = cache(
  cached(
    async (
      slug: string,
      workload?: string,
      cohort?: string,
    ): Promise<OperationPageModel | null> => {
      return (await reads()).getOperationPage(slug, workload, cohort)
    },
    ["operation", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

export const getImplementationPage = cache(
  cached(
    async (slug: string): Promise<ImplementationPageModel | null> => {
      return (await reads()).getImplementationPage(slug)
    },
    ["implementation", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

export const getRunPage = cache(
  cached(
    async (id: string): Promise<RunPageModel | null> => {
      return (await reads()).getRunPage(id)
    },
    ["run", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

export const getComparePage = cache(
  cached(
    async (runIds: string[]): Promise<ComparePageModel> => {
      return (await reads()).getComparePage(runIds)
    },
    ["compare", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

export const getServingFacets = cache(
  cached(
    async (): Promise<ServingFacetsModel> => {
      return (await reads()).getServingFacets()
    },
    ["serving-facets", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

export const resolveServing = cache(
  cached(
    async (input: ServingResolveInput): Promise<ServingResolveModel> => {
      return (await reads()).resolveServing(input)
    },
    ["resolve-serving", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

export const getServingRunPage = cache(
  cached(
    async (id: string): Promise<ServingRunPageModel | null> => {
      return (await reads()).getServingRunPage(id)
    },
    ["serving-run", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

export const listServingRuns = cache(
  cached(
    async (input: { cursor?: string; limit?: number }) => {
      return (await reads()).listServingRuns(input)
    },
    ["serving-runs", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

export const getCoveragePage = cache(
  cached(
    async (): Promise<CoveragePageModel> => {
      return (await reads()).getCoveragePage()
    },
    ["coverage", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

export const listServingConfigurations = cache(
  cached(
    async (): Promise<ServingConfigurationSummary[]> => {
      return (await reads()).listServingConfigurations()
    },
    ["serving-configurations", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

export const getHardwareIndex = cache(
  cached(
    async (): Promise<HardwareIndexModel> => {
      return (await reads()).getHardwareIndex()
    },
    ["hardware-index", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

export const getHardwarePage = cache(
  cached(
    async (slug: string): Promise<HardwarePageModel | null> => {
      return (await reads()).getHardwarePage(slug)
    },
    ["hardware", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

export const getProjectIndex = cache(
  cached(
    async (): Promise<ProjectIndexModel> => {
      return (await reads()).getProjectIndex()
    },
    ["project-index", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

// Corpus enumeration reads (§13.2 at 20k records): database-backed only —
// the fixtures backend has no corpus to page — so these bypass the backend
// switch but keep the same lazy import and cache layers.
const apiReads = () => import("@/server/catalog/api-reads")

export const listRuns = cache(
  cached(
    async (input: RunListInput) => (await apiReads()).listRuns(input),
    ["runs-list", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

export const listOperations = cache(
  cached(
    async (input: { family?: string; tag?: string }) =>
      (await apiReads()).listOperations(input),
    ["operations-list", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

export const listHardwareCoverage = cache(
  cached(
    async () => (await apiReads()).listHardwareCoverage(),
    ["hardware-coverage", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

export const listModelCoverage = cache(
  cached(
    async () => (await apiReads()).listModelCoverage(),
    ["model-coverage", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)
