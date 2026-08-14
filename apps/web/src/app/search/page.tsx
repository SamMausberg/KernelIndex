import type { Metadata } from "next"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { SiteHeader } from "@/components/site-header"
import { SearchResults } from "@/features/search/results"
import { searchCatalog } from "@/lib/catalog"

export const metadata: Metadata = { title: "Search" }

type Params = { q?: string; verified?: string; deployable?: string }

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const params = await searchParams
  const query = params.q ?? ""
  const model = await searchCatalog({ query })
  return (
    <>
      <SiteHeader query={query} />
      {model.illustrative && <IllustrativeNotice />}
      <SearchResults
        model={model}
        filters={{
          verified: params.verified === "1",
          deployable: params.deployable === "1",
        }}
      />
    </>
  )
}
