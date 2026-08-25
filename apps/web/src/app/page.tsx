import type { Metadata } from "next"
import Link from "next/link"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { HeroSearch } from "@/features/home/hero-search"
import { LatestRecords } from "@/features/home/latest-records"
import { WorkedExample } from "@/features/home/worked-example"
import { TrustBlock } from "@/features/trust/sources"
import { getCoveragePage, getHomePage, getModelIndex } from "@/lib/catalog"

// The homepage reads live records; revalidate on a short cycle instead of
// freezing them into the build (data changes only on importer runs).
export const revalidate = 300
export const metadata: Metadata = { alternates: { canonical: "/" } }

export default async function Home() {
  const [model, coverage, models] = await Promise.all([
    getHomePage(),
    getCoveragePage(),
    getModelIndex(),
  ])
  // Real example queries (§16.5): the two newest record operations and the
  // most-measured model tag, each a query that resolves today. Nothing is
  // invented when the corpus is empty.
  const operations = [
    ...new Map(
      model.latest.map((holder) => [
        holder.operation.slug,
        holder.operation.name,
      ]),
    ),
  ].slice(0, 2)
  // Plain-language entry queries (2026-08-25, easier notation): operation
  // names resolve as free text; the model example keeps its one prefix in
  // the query but reads as the bare tag.
  const examples = [
    ...operations.map(([, name]) => ({ label: name, query: name })),
    ...(models.kernel[0]
      ? [
          {
            label: models.kernel[0].model,
            query: `model:${models.kernel[0].model}`,
          },
        ]
      : []),
  ]
  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <main>
        {/* Sparse hero on the bare canvas: headline, search, one hint,
            slightly above optical center under the sticky site header. */}
        <section className="relative flex min-h-[56svh] flex-col">
          <div
            data-hero
            className="shell flex flex-1 flex-col justify-center pt-6 pb-[4svh]"
          >
            <h1 className="max-w-[24ch] text-hero font-medium text-pretty">
              The fastest known GPU kernel for your exact workload.
            </h1>
            <HeroSearch />
            {/* What "comparable" actually means, in the facts a reader can
                check against their own workload — not the abstraction. The
                entry queries share the row instead of adding one below. */}
            <div className="mt-3 flex max-w-[620px] flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5">
              <p className="max-w-[46ch] text-small text-faint">
                Same shapes, same dtype, same GPU, same protocol. Anything else
                is not ranked against it.
              </p>
              <span className="flex items-baseline gap-x-4">
                {examples.map((example) => (
                  <Link
                    key={example.query}
                    href={`/search?q=${encodeURIComponent(example.query)}`}
                    className="font-mono text-small text-subtle"
                  >
                    {example.label}
                  </Link>
                ))}
                <Link
                  href="/docs#query-syntax"
                  className="text-small whitespace-nowrap text-faint"
                >
                  Query syntax
                </Link>
              </span>
            </div>
            {/* The outcome comes before the machinery: one resolved workload
                as the hero's proof. Corpus counts moved beside the ledger
                below (§16 page grammar: two quiet rows after the search). */}
            <WorkedExample />
          </div>
        </section>

        <section className="shell pt-6">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="text-title font-medium">Latest records</h2>
            <span className="flex flex-wrap items-baseline gap-x-5">
              {/* Named for what it counts, so /search and /records can be
                  reconciled against it rather than doubted (§16.4). */}
              <Link
                href="/docs#counting"
                className="font-mono text-small text-faint"
              >
                {model.stats.operations.toLocaleString("en-US")} operations with
                ranked runs · {model.stats.runs.toLocaleString("en-US")} runs ·{" "}
                {model.stats.gpus.toLocaleString("en-US")} GPUs
              </Link>
              <Link href="/records" className="text-body">
                Full ledger →
              </Link>
            </span>
          </div>
          <LatestRecords rows={model.latest} />
          {/* One note, pointing at the trust block below rather than off the
              page: the evidence-level breakdown renders right there. */}
          <p className="mt-3 text-small text-faint">
            Shown as published by their sources.{" "}
            <a href="#trust" className="text-faint">
              Evidence levels ↓
            </a>
          </p>
        </section>

        <section id="trust" className="shell pt-14 pb-4">
          <TrustBlock
            sources={coverage.sources}
            evidence={model.stats.evidence}
          />
        </section>
      </main>
    </>
  )
}
