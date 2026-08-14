import Link from "next/link"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { SiteHeader } from "@/components/site-header"
import { HeroSearch } from "@/features/home/hero-search"
import { LatestRecords } from "@/features/home/latest-records"
import { getHomePage } from "@/lib/catalog"
import { releaseSha } from "@/server/env"

// The homepage reads live records; never freeze them into the build.
export const dynamic = "force-dynamic"

export default async function Home() {
  const model = await getHomePage()
  const { counts } = model
  return (
    <>
      <SiteHeader home />
      {model.illustrative && <IllustrativeNotice />}
      <main>
        <div data-hero className="mx-auto max-w-[1400px] px-10 pt-[88px]">
          <h1 className="max-w-[24ch] text-[56px] leading-[1.04] font-normal tracking-[-0.03em] text-pretty">
            Find the fastest verified GPU kernel for your exact workload.
          </h1>
          <p className="mt-4 text-[16px] text-muted">
            Verified performance data for GPU software.
          </p>
          <HeroSearch />
          <div className="mt-2.5 flex max-w-[880px] items-baseline justify-between gap-6">
            <p className="text-[13px] text-faint">
              Results are ranked only inside comparable workloads and
              environments.
            </p>
            <Link
              href="/docs#query-syntax"
              className="text-[13px] whitespace-nowrap text-faint"
            >
              Query syntax
            </Link>
          </div>
        </div>

        <section className="mx-auto max-w-[1400px] px-10 pt-14">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="text-[21px] font-medium tracking-[-0.015em]">
              Latest records
            </h2>
            <Link href="/records" className="text-[13px]">
              Full ledger →
            </Link>
          </div>
          <LatestRecords rows={model.latest} />
        </section>

        <div className="mx-auto mt-24 max-w-[1400px] px-10">
          <footer className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 border-t border-border pt-5 pb-16">
            <p className="text-[13px] text-subtle">
              Submit evidence, correct a record, or replicate a run —
              contribution opens with the beta.
            </p>
            <div className="flex flex-wrap items-baseline gap-6">
              <span className="font-mono text-[12px] text-faint">
                {[
                  [counts.operations, "operation"],
                  [counts.implementations, "implementation"],
                  [counts.runs, "run"],
                  [counts.sources, "source"],
                ]
                  .map(([n, word]) => `${n} ${word}${n === 1 ? "" : "s"}`)
                  .join(" · ")}
                {releaseSha && ` · ${releaseSha.slice(0, 7)}`}
              </span>
              <Link href="/docs" className="text-[13px] text-subtle">
                Methodology
              </Link>
              <a
                href="https://github.com/SamMausberg/KernelIndex"
                className="text-[13px] text-subtle transition-colors hover:text-fg hover:no-underline"
              >
                GitHub
              </a>
            </div>
          </footer>
        </div>
      </main>
    </>
  )
}
