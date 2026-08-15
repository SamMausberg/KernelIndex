import type { Metadata } from "next"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { type ResultMode, SearchResults } from "@/features/search/results"
import type { BrowseSort } from "@/features/search/start-state"
import { getOperationIndex, searchCatalog } from "@/lib/catalog"

export const metadata: Metadata = { title: "Search" }

type Params = {
  q?: string
  view?: string
  verified?: string
  deployable?: string
  sort?: string
  family?: string
  page?: string
}

const MODES = new Set(["exact", "compatible", "supported", "reported"])
const BROWSE_SORTS = new Set(["indexed", "active", "az"])

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const params = await searchParams
  const query = params.q ?? ""
  const [model, suggest] = await Promise.all([
    searchCatalog({ query }),
    getOperationIndex(),
  ])
  const page = Number.parseInt(params.page ?? "1", 10)
  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <SearchResults
        model={model}
        suggest={suggest}
        filters={{
          view:
            params.view && MODES.has(params.view)
              ? (params.view as ResultMode)
              : undefined,
          verified: params.verified === "1",
          deployable: params.deployable === "1",
          page: Number.isNaN(page) ? 1 : page,
        }}
        browse={{
          sort:
            params.sort && BROWSE_SORTS.has(params.sort)
              ? (params.sort as BrowseSort)
              : "indexed",
          family: params.family ?? null,
          page: Number.isNaN(page) ? 1 : page,
        }}
      />
    </>
  )
}
