import type { Metadata } from "next"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import * as fixtures from "@/data/fixtures/catalog"
import { RecordsLedger } from "@/features/records/ledger"
import { SearchResults } from "@/features/search/results"

// Preview-only design lab (§16.19): the real shell and components rendered
// against deterministic fixtures, whatever backend the app is using. It
// replaces Storybook and never ships to production.
export const metadata: Metadata = {
  title: "Design lab",
  robots: { index: false, follow: false },
}

function State({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-2 font-mono text-[12px] tracking-[0.04em] text-faint uppercase">
        {label}
      </h2>
      <div className="overflow-hidden rounded-[4px] border border-edge">
        {children}
      </div>
    </section>
  )
}

export default async function DesignLabPage() {
  if (process.env.VERCEL_ENV === "production") notFound()

  const results = await fixtures.searchCatalog({ query: "rmsnorm B200 bf16" })
  const noResult = await fixtures.searchCatalog({ query: "unknown-op" })
  const emptyQuery = await fixtures.searchCatalog({ query: "" })
  const records = await fixtures.getRecordsPage()
  const noFilters = { view: undefined, verified: false, deployable: false }

  return (
    <div className="shell pb-24">
      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-[20px] font-medium tracking-[-0.012em]">
          Design lab
        </h1>
        <p className="text-[12.5px] text-subtle">
          Deterministic fixture states for every difficult case. Preview only,
          never indexed, never production.
        </p>
      </div>

      <State label="notice · illustrative data">
        <IllustrativeNotice />
      </State>

      <State label="search · exact results, ties, stale, license-unknown, divergence">
        <SearchResults model={results} filters={noFilters} />
      </State>

      <State label="search · compatible view with mismatch vectors">
        <SearchResults
          model={results}
          filters={{ ...noFilters, view: "compatible" }}
        />
      </State>

      <State label="search · verified-only filter hiding rows">
        <SearchResults
          model={results}
          filters={{ ...noFilters, verified: true }}
        />
      </State>

      <State label="search · supported-unmeasured with overflowing names">
        <SearchResults
          model={results}
          filters={{ ...noFilters, view: "supported" }}
        />
      </State>

      <State label="search · no matching operation">
        <SearchResults model={noResult} filters={noFilters} />
      </State>

      <State label="search · empty query start state">
        <SearchResults model={emptyQuery} filters={noFilters} />
      </State>

      <State label="records · current ledger with history and tie">
        <RecordsLedger
          model={records}
          filters={{
            view: "current",
            hardware: null,
            verified: false,
            filter: "",
            sort: "date",
            page: 1,
          }}
        />
      </State>

      <State label="records · recently broken">
        <RecordsLedger
          model={records}
          filters={{
            view: "broken",
            hardware: null,
            verified: false,
            filter: "",
            sort: "date",
            page: 1,
          }}
        />
      </State>
    </div>
  )
}
