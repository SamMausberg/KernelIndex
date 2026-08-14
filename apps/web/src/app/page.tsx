import { IllustrativeNotice } from "@/components/illustrative-notice"
import { SiteHeader } from "@/components/site-header"
import { LatestRecords } from "@/features/home/latest-records"
import { getHomePage } from "@/lib/catalog"

// The homepage reads live records; never freeze them into the build.
export const dynamic = "force-dynamic"

export default async function Home() {
  const model = await getHomePage()
  return (
    <>
      <SiteHeader />
      {model.illustrative && <IllustrativeNotice />}
      <main>
        <div className="mx-auto max-w-[1400px] px-10 pt-[104px]">
          <h1 className="max-w-[24ch] text-[56px] leading-[1.04] font-normal tracking-[-0.03em] text-pretty">
            Find the fastest verified GPU kernel for your exact workload.
          </h1>
          <p className="mt-[18px] text-[16px] text-muted">
            Verified performance data for GPU software.
          </p>

          <form
            action="/search"
            className="mt-9 flex h-[60px] max-w-[880px] items-center gap-3 rounded-[4px] border border-edge bg-raised pr-3.5 pl-[18px] transition-[border-color,box-shadow] focus-within:border-[#55647a] focus-within:shadow-[0_0_0_3px_rgba(156,179,214,0.07)]"
          >
            <input
              name="q"
              placeholder="Search operation, GPU, dtype, shape, framework…"
              className="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[15.5px] outline-none"
            />
            <button
              type="submit"
              aria-label="Search"
              className="flex-none cursor-pointer rounded-[3px] border border-border-strong bg-transparent px-[9px] pb-[3px] font-mono text-[13px] text-faint transition-colors hover:border-edge-hover hover:text-fg"
            >
              ↵
            </button>
          </form>
          <p className="mt-2.5 max-w-[880px] text-right text-[13px] text-faint">
            Results are ranked only inside comparable workloads and
            environments.
          </p>
        </div>

        <section className="mx-auto max-w-[1400px] px-10 pt-14">
          <div className="mb-[18px] flex items-baseline justify-between gap-4">
            <h2 className="text-[21px] font-medium tracking-[-0.015em]">
              Latest records
            </h2>
          </div>
          <LatestRecords rows={model.latest} />
        </section>

        <div className="mx-auto mt-28 max-w-[1400px] px-10">
          <footer className="flex flex-wrap items-baseline justify-between gap-6 border-t border-border pt-6 pb-[72px]">
            <p className="text-[13.5px] text-subtle">
              Submit evidence, correct a record, or replicate a run.
            </p>
            <a
              href="https://github.com/SamMausberg/KernelIndex"
              className="text-[13.5px] text-subtle transition-colors hover:text-fg hover:no-underline"
            >
              GitHub
            </a>
          </footer>
        </div>
      </main>
    </>
  )
}
