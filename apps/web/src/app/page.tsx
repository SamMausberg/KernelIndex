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
  const examples = [
    ...operations.map(([slug, name]) => ({ label: name, query: `op:${slug}` })),
    ...(models.kernel[0]
      ? [
          {
            label: `model:${models.kernel[0].model}`,
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
                check against their own workload — not the abstraction. */}
            <div className="mt-3 flex max-w-[620px] items-baseline justify-between gap-6">
              <p className="max-w-[46ch] text-small text-faint">
                Same shapes, same dtype, same GPU, same protocol. Anything else
                is not ranked against it.
              </p>
              <Link
                href="/docs#query-syntax"
                className="text-small whitespace-nowrap text-faint"
              >
                Query syntax
              </Link>
            </div>
            {/* The outcome comes before the machinery: one resolved workload,
                then the queries and corpus size on a single quiet line. */}
            <WorkedExample />
            {/* Example queries and the corpus count only (3-second rule):
                sources and the API live in the trust block and footer. */}
            <p className="mt-5 flex max-w-[620px] flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-small text-faint">
              {examples.map((example) => (
                <Link
                  key={example.query}
                  href={`/search?q=${encodeURIComponent(example.query)}`}
                  className="font-mono text-small text-subtle"
                >
                  {example.label}
                </Link>
              ))}
              {/* Named for what it counts, so /search and /records can be
                  reconciled against it rather than doubted (§16.4). */}
              <Link href="/docs#counting" className="text-subtle">
                {model.stats.operations.toLocaleString("en-US")} operations with
                ranked runs · {model.stats.runs.toLocaleString("en-US")} runs ·{" "}
                {model.stats.gpus.toLocaleString("en-US")} GPUs
              </Link>
            </p>
          </div>
        </section>

        <section className="shell pt-6">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="text-title font-medium">Latest records</h2>
            <Link href="/records" className="text-body">
              Full ledger →
            </Link>
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
