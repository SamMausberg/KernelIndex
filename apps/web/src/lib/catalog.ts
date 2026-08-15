// The fixture/read seam (§27.5). Pages call these six functions and never
// know which backend produced the model. `CATALOG_BACKEND` selects the
// implementation: "fixtures" (default, deterministic, visibly illustrative)
// or "postgres" (real published records).
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
    options?: { workload?: string },
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

// React request-level cache: a page and its generateMetadata share one read.
export const getHomePage = cache(async (): Promise<HomePageModel> => {
  return (await reads()).getHomePage()
})

export const getRecordsPage = cache(async (): Promise<RecordsPageModel> => {
  return (await reads()).getRecordsPage()
})

export const getOperationIndex = cache(
  async (): Promise<OperationIndexEntry[]> => {
    return (await reads()).getOperationIndex()
  },
)

export const searchCatalog = cache(
  async (input: SearchInput): Promise<SearchPageModel> => {
    return (await reads()).searchCatalog(input)
  },
)

export const getOperationPage = cache(
  async (
    slug: string,
    options?: { workload?: string },
  ): Promise<OperationPageModel | null> => {
    return (await reads()).getOperationPage(slug, options)
  },
)

export const getImplementationPage = cache(
  async (slug: string): Promise<ImplementationPageModel | null> => {
    return (await reads()).getImplementationPage(slug)
  },
)

export const getRunPage = cache(
  async (id: string): Promise<RunPageModel | null> => {
    return (await reads()).getRunPage(id)
  },
)

export const getComparePage = cache(
  async (runIds: string[]): Promise<ComparePageModel> => {
    return (await reads()).getComparePage(runIds)
  },
)
