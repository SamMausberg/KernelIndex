import Link from "next/link"

/**
 * Sticky site header (§16.4). Pass `query` (even "") to show the inline
 * search field with that initial value; omit it on the homepage, where the
 * hero search is the primary control. Nav grows as routes ship — an empty
 * item makes the product feel less finished, not more ambitious (§0.2).
 */
export function SiteHeader({ query }: { query?: string }) {
  return (
    <div className="sticky top-0 z-50 border-b border-border bg-canvas">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-[30px] px-8">
        <Link
          href="/"
          className="font-mono text-[15px] font-semibold tracking-[-0.01em] text-fg hover:no-underline"
        >
          kernel<span className="text-accent">index</span>
        </Link>
        <nav className="flex gap-[22px] text-[13.5px]">
          <Link
            href="/search"
            className={`transition-colors hover:text-fg hover:no-underline ${
              query !== undefined ? "text-fg" : "text-subtle"
            }`}
          >
            Search
          </Link>
        </nav>
        {query !== undefined && (
          <form
            action="/search"
            className="ml-auto flex h-[34px] max-w-[460px] flex-1 items-center gap-2 rounded-[3px] border border-border bg-raised pr-1 pl-2.5"
          >
            <input
              name="q"
              defaultValue={query}
              placeholder="Search kernels"
              className="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[13px] outline-none"
            />
            <span className="rounded-[2px] border border-border px-[5px] py-0.5 font-mono text-[11px] text-faint">
              ⏎
            </span>
          </form>
        )}
        <div
          className={`flex items-center gap-3.5 text-[13.5px] ${
            query === undefined ? "ml-auto" : ""
          }`}
        >
          <span className="h-[18px] w-px bg-border" />
          <a
            href="https://github.com/SamMausberg/KernelIndex"
            className="text-subtle transition-colors hover:text-fg hover:no-underline"
          >
            GitHub
          </a>
        </div>
      </div>
    </div>
  )
}
