import Link from "next/link"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { HeroSearch } from "@/features/home/hero-search"
import { LatestRecords } from "@/features/home/latest-records"
import { getHomePage } from "@/lib/catalog"
import { releaseSha } from "@/server/env"

// The homepage reads live records; revalidate on a short cycle instead of
// freezing them into the build (data changes only on importer runs).
export const revalidate = 300

export default async function Home() {
  const model = await getHomePage()
  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <main>
        {/* Sparse hero on the bare canvas: headline, search, one hint,
            slightly above optical center under the sticky site header. */}
        <section className="relative flex min-h-[56svh] flex-col">
          <div
            data-hero
            className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col justify-center px-10 pt-6 pb-[4svh] max-md:px-6"
          >
            <h1 className="max-w-[26ch] text-[clamp(32px,3.6vw,46px)] leading-[1.12] font-medium tracking-[-0.022em] text-pretty">
              Find the fastest verified GPU kernel for your exact workload.
            </h1>
            <HeroSearch />
            <div className="mt-3 flex max-w-[620px] items-baseline justify-between gap-6">
              <p className="text-[12.5px] text-faint">
                Ranked only inside comparable workloads and environments.
              </p>
              <Link
                href="/docs#query-syntax"
                className="text-[12.5px] whitespace-nowrap text-faint"
              >
                Query syntax
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1400px] px-10 pt-6 max-md:px-6">
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

        <footer className="mx-auto mt-24 flex max-w-[1400px] flex-wrap items-baseline justify-end gap-x-6 gap-y-3 px-10 pb-16 max-md:px-6">
          {releaseSha && (
            <span className="font-mono text-[12px] text-faint">
              {releaseSha.slice(0, 7)}
            </span>
          )}
          <Link href="/docs" className="text-[13px] text-subtle">
            Methodology
          </Link>
          <a
            href="https://github.com/SamMausberg/KernelIndex"
            className="text-[13px] text-subtle transition-colors hover:text-fg hover:no-underline"
          >
            GitHub
          </a>
        </footer>
      </main>
    </>
  )
}
