// Search (§16.6): the shell paints immediately; the resolver result
// streams in behind Suspense, since an uncached query can take a second.
import type { Metadata } from "next"
import { after } from "next/server"
import { Suspense } from "react"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import {
  type ResultMode,
  type ResultSort,
  SearchResults,
} from "@/features/search/results"
import type { BrowseSort } from "@/features/search/start-state"
import { searchCatalog } from "@/lib/catalog"
import { recordEvent } from "@/server/events"

export const metadata: Metadata = { title: "Search" }

type Params = {
  q?: string
  view?: string
  verified?: string
  source?: string
  license?: string
  installable?: string
  /** Legacy links: expands to the three availability filters it implied. */
  deployable?: string
  sort?: string
  family?: string
  page?: string
}

const MODES = new Set(["exact", "compatible", "supported", "reported"])
const RESULT_SORTS = new Set(["recommended", "newest"])
const BROWSE_SORTS = new Set(["indexed", "active", "az"])

async function Results({ params }: { params: Params }) {
  const query = params.q ?? ""
  const model = await searchCatalog({ query })
  // §20.5 answer-quality counters, after the response; empty = browse.
  if (query.trim() !== "")
    after(() =>
      recordEvent("search_submitted", {
        parseError: model.queryIssues.length > 0,
        zeroResult: model.noResult !== null,
        exactReturned: model.groups.exact.length > 0,
        resolvedOperation: model.operation !== null,
      }),
    )
  const page = Number.parseInt(params.page ?? "1", 10)
  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <SearchResults
        // Aliases exist for the suggest index, which the island fetches
        // from /suggest — inlining them here doubled the browse payload.
        model={
          model.browse
            ? {
                ...model,
                browse: model.browse.map((entry) => ({
                  ...entry,
                  aliases: [],
                })),
              }
            : model
        }
        filters={{
          view:
            params.view && MODES.has(params.view)
              ? (params.view as ResultMode)
              : undefined,
          sort:
            params.sort && RESULT_SORTS.has(params.sort)
              ? (params.sort as ResultSort)
              : undefined,
          verified: params.verified === "1",
          // Source-backed results are the default; source=0 widens to all.
          source: params.source !== "0",
          license: params.license === "1" || params.deployable === "1",
          installable: params.installable === "1" || params.deployable === "1",
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

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const params = await searchParams
  return (
    <Suspense
      fallback={
        <main className="shell pt-6">
          <p className="py-4 font-mono text-small text-faint">resolving…</p>
        </main>
      }
    >
      <Results params={params} />
    </Suspense>
  )
}
