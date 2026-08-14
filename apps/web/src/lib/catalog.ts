// The fixture/read seam (§27.5). Pages call these four functions and never
// know which backend produced the model. `CATALOG_BACKEND` selects the
// implementation: "fixtures" (default, deterministic, visibly illustrative)
// or "postgres" (real published records).
import type {
  ImplementationPageModel,
  OperationPageModel,
  RunPageModel,
  SearchInput,
  SearchPageModel,
} from "./catalog-models"

export type * from "./catalog-models"

type CatalogReads = {
  searchCatalog(input: SearchInput): Promise<SearchPageModel>
  getOperationPage(
    slug: string,
    options?: { workload?: string },
  ): Promise<OperationPageModel | null>
  getImplementationPage(slug: string): Promise<ImplementationPageModel | null>
  getRunPage(id: string): Promise<RunPageModel | null>
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

export async function searchCatalog(
  input: SearchInput,
): Promise<SearchPageModel> {
  return (await reads()).searchCatalog(input)
}

export async function getOperationPage(
  slug: string,
  options?: { workload?: string },
): Promise<OperationPageModel | null> {
  return (await reads()).getOperationPage(slug, options)
}

export async function getImplementationPage(
  slug: string,
): Promise<ImplementationPageModel | null> {
  return (await reads()).getImplementationPage(slug)
}

export async function getRunPage(id: string): Promise<RunPageModel | null> {
  return (await reads()).getRunPage(id)
}
