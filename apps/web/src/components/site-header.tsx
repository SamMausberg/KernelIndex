import Link from "next/link"
import { CommandK } from "./command-k"

type NavKey = "search" | "records" | "docs"

const NAV: { key: NavKey; label: string; href: string }[] = [
  { key: "search", label: "Search", href: "/search" },
  { key: "records", label: "Records", href: "/records" },
  { key: "docs", label: "Docs", href: "/docs" },
]

/**
 * Sticky site header (§16.4). One search model everywhere (§16.6): the
 * homepage hero and the search page's workload field are the primary
 * controls, so the navbar carries only a compact "Search ⌘K" affordance on
 * every other page — never a raw query string.
 */
export function SiteHeader({
  active,
  home,
}: {
  active?: NavKey
  home?: boolean
}) {
  return (
    <div className="sticky top-0 z-50 border-b border-border bg-canvas">
      <div className="shell flex h-14 items-center gap-7">
        <Link
          href="/"
          className="font-mono text-[15px] font-semibold tracking-[-0.01em] text-fg hover:no-underline"
        >
          kernel<span className="text-accent">index</span>
        </Link>
        <nav className="flex gap-[22px] text-[13.5px]">
          {NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`transition-colors hover:text-fg hover:no-underline ${
                active === item.key ? "text-fg" : "text-subtle"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex-1" />
        {!home && active !== "search" && (
          <Link
            href="/search"
            className="flex h-[34px] w-[220px] items-center gap-2 rounded-[3px] border border-border bg-raised px-2.5 text-[13px] text-faint transition-colors hover:border-edge-hover hover:text-subtle hover:no-underline"
          >
            Search
            <kbd className="ml-auto rounded-[2px] border border-border px-[5px] py-0.5 font-mono text-[11px]">
              ⌘K
            </kbd>
          </Link>
        )}
        <div className="flex items-center gap-3.5 text-[13.5px]">
          <span className="h-[18px] w-px bg-border" />
          <a
            href="https://github.com/SamMausberg/KernelIndex"
            className="text-subtle transition-colors hover:text-fg hover:no-underline"
          >
            GitHub
          </a>
        </div>
      </div>
      <CommandK />
    </div>
  )
}
