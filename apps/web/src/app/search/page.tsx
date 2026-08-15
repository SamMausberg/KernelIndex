import type { Metadata } from "next"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { type ResultMode, SearchResults } from "@/features/search/results"
import { searchCatalog } from "@/lib/catalog"

export const metadata: Metadata = { title: "Search" }

type Params = {
  q?: string
  view?: string
  verified?: string
  deployable?: string
  page?: string
}

const MODES = new Set(["exact", "compatible", "supported", "reported"])

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const params = await searchParams
  const query = params.q ?? ""
  const model = await searchCatalog({ query })
  const page = Number.parseInt(params.page ?? "1", 10)
  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <SearchResults
        model={model}
        filters={{
          view:
            params.view && MODES.has(params.view)
              ? (params.view as ResultMode)
              : undefined,
          verified: params.verified === "1",
          deployable: params.deployable === "1",
          page: Number.isNaN(page) ? 1 : page,
        }}
      />
    </>
  )
}
