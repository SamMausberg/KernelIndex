import type { Metadata } from "next"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { FilterChip } from "@/components/chip"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { Meter } from "@/components/meter"
import { Pager } from "@/components/pager"
import * as fixtures from "@/data/fixtures/catalog"
import { BestKnownTable, GapTable } from "@/features/models/best-known"
import { RecordsLedger } from "@/features/records/ledger"
import { ledgerSlice } from "@/features/records/ledger-model"
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
      <h2 className="mb-2 font-mono text-label text-faint uppercase">
        {label}
      </h2>
      <div className="overflow-hidden rounded border border-edge">
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
  const multiMatch = await fixtures.searchCatalog({ query: "norm" })
  const records = await fixtures.getRecordsPage()
  const modelPage = await fixtures.getModelPage("llama-3.1-8b")
  const bestKnown = modelPage?.groups ?? []
  // The measured-but-undeployable state: the fastest stands, nothing passes.
  const undeployable = bestKnown[0]
    ? [{ ...bestKnown[0].entries[0], deployable: null }]
    : []
  const noFilters = {
    view: undefined,
    verified: false,
    source: false,
    license: false,
    installable: false,
  }

  return (
    <div className="shell pb-24">
      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-title font-medium">Design lab</h1>
        <p className="text-small text-subtle">
          Deterministic fixture states for every difficult case. Preview only,
          never indexed, never production.
        </p>
      </div>

      <State label="notice · illustrative data">
        <IllustrativeNotice />
      </State>

      <State label="components · chip, pager, meter">
        <div className="space-y-6 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip href="#" on={false} label="Has source" count={12} />
            <FilterChip href="#" on={true} label="Verified" count={3} />
            <FilterChip
              href="#"
              on={false}
              dead
              title="Nothing to toggle to"
              label="Installable"
              count={0}
            />
          </div>
          <Pager page={2} pageCount={5} hrefFor={() => "#"} />
          <div className="flex items-center gap-3">
            <Meter fraction={1} className="w-24" />
            <Meter fraction={0.62} className="w-24" />
            <Meter fraction={0.13} className="w-24" />
            <span className="font-mono text-mini text-faint">
              calibrated rule at 100 / 62 / 13%
            </span>
          </div>
        </div>
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

      <State label="search · newest sort (presentation reorder)">
        <SearchResults
          model={results}
          filters={{ ...noFilters, sort: "newest" }}
        />
      </State>

      <State label="search · multi-match operation chooser">
        <SearchResults model={multiMatch} filters={noFilters} />
      </State>

      <State label="search · no matching operation">
        <SearchResults model={noResult} filters={noFilters} />
      </State>

      <State label="search · empty query start state with suggestions wired">
        <SearchResults model={emptyQuery} filters={noFilters} />
      </State>

      <State label="model · best known with a fastest-vs-deployable split">
        <div className="p-6">
          <BestKnownTable groups={bestKnown} />
        </div>
      </State>

      <State label="model · measured but no deployable entry">
        <div className="p-6">
          <BestKnownTable
            groups={
              bestKnown[0]
                ? [{ family: bestKnown[0].family, entries: undeployable }]
                : []
            }
          />
        </div>
      </State>

      <State label="model · coverage gaps (unmeasured and undeployable)">
        <div className="p-6">
          <GapTable
            gaps={modelPage?.gaps ?? []}
            undeployable={undeployable}
            selectedGpu={modelPage?.selectedGpu ?? ""}
          />
        </div>
      </State>

      <State label="records · current ledger with history and tie">
        <RecordsLedger
          initial={ledgerSlice(records, {
            view: "current",
            hardware: null,
            verified: false,
            source: false,
            baselines: true,
            filter: "",
            sort: "date",
            page: 1,
          })}
        />
      </State>

      <State label="records · recently broken">
        <RecordsLedger
          initial={ledgerSlice(records, {
            view: "broken",
            hardware: null,
            verified: false,
            source: false,
            baselines: true,
            filter: "",
            sort: "date",
            page: 1,
          })}
        />
      </State>

      <State label="records · sorted by largest improvement">
        <RecordsLedger
          initial={ledgerSlice(records, {
            view: "current",
            hardware: null,
            verified: false,
            source: false,
            baselines: true,
            filter: "",
            sort: "improvement",
            page: 1,
          })}
        />
      </State>
    </div>
  )
}
