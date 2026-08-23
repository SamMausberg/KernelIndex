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
            <h1 className="max-w-[26ch] text-hero font-medium text-pretty">
              Find the fastest known GPU kernel for your exact workload.
            </h1>
            <HeroSearch />
            <div className="mt-3 flex max-w-[620px] items-baseline justify-between gap-6">
              <p className="text-small text-faint">
                Ranked only against runs that measured the same thing.
              </p>
              <Link
                href="/docs#query-syntax"
                className="text-small whitespace-nowrap text-faint"
              >
                Query syntax
              </Link>
            </div>
            {examples.length > 0 && (
              <p className="mt-2 flex max-w-[620px] flex-wrap items-baseline gap-x-4 gap-y-1 text-small">
                <span className="text-faint">Try</span>
                {examples.map((example) => (
                  <Link
                    key={example.query}
                    href={`/search?q=${encodeURIComponent(example.query)}`}
                    className="font-mono text-small text-subtle"
                  >
                    {example.label}
                  </Link>
                ))}
              </p>
            )}
            <WorkedExample />
            <p className="mt-5 font-mono text-small text-faint">
              <a href="#trust" className="text-subtle">
                {model.stats.operations.toLocaleString("en-US")} operations ·{" "}
                {model.stats.runs.toLocaleString("en-US")} runs ·{" "}
                {model.stats.gpus.toLocaleString("en-US")} GPUs
              </a>{" "}
              ·{" "}
              <Link href="/docs/api" className="text-faint">
                API
              </Link>{" "}
              ·{" "}
              <Link href="/docs#agents" className="text-faint">
                MCP
              </Link>{" "}
              ·{" "}
              <a href="/llms.txt" className="text-faint">
                llms.txt
              </a>
            </p>
          </div>
        </section>

        <section className="shell pt-6">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="text-title font-medium">Latest records</h2>
            <span className="flex gap-5 text-body">
              <Link href="/records?source=1">With source →</Link>
              <Link href="/records">Full ledger →</Link>
            </span>
          </div>
          <LatestRecords rows={model.latest} />
          <p className="mt-3 text-small text-faint">
            Shown as published by their sources.{" "}
            <Link href="/docs#evidence" className="text-faint">
              Evidence levels →
            </Link>
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
