// The fixture/read seam (§27.5). Pages call these functions and never
// know which backend produced the model. `CATALOG_BACKEND` selects the
// implementation: "fixtures" (default, deterministic, visibly illustrative)
// or "postgres" (real published records).
import { unstable_cache } from "next/cache"
import { cache } from "react"
import type {
  ComparePageModel,
  HomePageModel,
  ImplementationPageModel,
  OperationIndexEntry,
  OperationPageModel,
  RecordsPageModel,
  RunPageModel,
  SearchInput,
  SearchPageModel,
} from "./catalog-models"

export type * from "./catalog-models"

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
const BACKEND = process.env.CATALOG_BACKEND === "postgres" ? "pg" : "fx"

export const getHomePage = cache(
  unstable_cache(
    async (): Promise<HomePageModel> => {
      return (await reads()).getHomePage()
    },
    ["home", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

// The full ledger model outgrows the framework data cache's entry limit as
// the corpus scales, so it memoizes in-process instead.
const RECORDS_MEMO_MS = 60_000
let recordsMemo: { at: number; value: Promise<RecordsPageModel> } | null = null
export const getRecordsPage = cache(async (): Promise<RecordsPageModel> => {
  if (recordsMemo && Date.now() - recordsMemo.at < RECORDS_MEMO_MS) {
    return recordsMemo.value
  }
  const value = (async () => (await reads()).getRecordsPage())()
  recordsMemo = { at: Date.now(), value }
  value.catch(() => {
    recordsMemo = null
  })
  return value
})

export const getOperationIndex = cache(
  unstable_cache(
    async (): Promise<OperationIndexEntry[]> => {
      return (await reads()).getOperationIndex()
    },
    ["operation-index", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

export const searchCatalog = cache(
  unstable_cache(
    async (input: SearchInput): Promise<SearchPageModel> => {
      return (await reads()).searchCatalog(input)
    },
    ["search", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

export const getOperationPage = cache(
  unstable_cache(
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
  unstable_cache(
    async (slug: string): Promise<ImplementationPageModel | null> => {
      return (await reads()).getImplementationPage(slug)
    },
    ["implementation", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

export const getRunPage = cache(
  unstable_cache(
    async (id: string): Promise<RunPageModel | null> => {
      return (await reads()).getRunPage(id)
    },
    ["run", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)

export const getComparePage = cache(
  unstable_cache(
    async (runIds: string[]): Promise<ComparePageModel> => {
      return (await reads()).getComparePage(runIds)
    },
    ["compare", BACKEND],
    { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
  ),
)
