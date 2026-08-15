"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CommandK } from "./command-k"

const NAV = [
  { label: "Search", href: "/search" },
  { label: "Records", href: "/records" },
  { label: "Docs", href: "/docs" },
]

/**
 * Sticky site header (§16.4), mounted once in the root layout so it survives
 * route transitions instead of dropping into every page's loading state. The
 * active item derives from the pathname. One search model everywhere (§16.6):
 * the navbar carries only a compact "Search ⌘K" affordance — never a raw
 * query string — hidden only where the page renders its own search field.
 * There is deliberately no per-route variant: pathname-conditional mounting
 * broke under ISR prerender (the server saw "/index" for "/" and rendered a
 * duplicate header).
 */
export function SiteHeader() {
  const pathname = usePathname() ?? ""
  const onSearch = pathname.startsWith("/search")
  return (
    <div className="sticky top-0 z-50 border-b border-border bg-canvas">
      <div className="shell flex h-14 items-center gap-7 max-md:gap-4 max-md:px-4">
        <Link
          href="/"
          className="font-mono text-[14.5px] font-semibold tracking-[-0.02em] text-fg hover:no-underline"
        >
          KernelIndex
        </Link>
        <nav className="flex gap-[22px] text-[13.5px] max-md:gap-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`transition-colors hover:text-fg hover:no-underline ${
                pathname.startsWith(item.href) ? "text-fg" : "text-subtle"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex-1" />
        {!onSearch && (
          <Link
            href="/search"
            className="well flex h-[34px] w-[220px] items-center gap-2 px-2.5 text-[13px] text-faint transition-colors hover:text-subtle hover:no-underline max-md:hidden"
          >
            Search
            <kbd className="key ml-auto px-[5px] py-0.5 font-mono text-[11px]">
              ⌘K
            </kbd>
          </Link>
        )}
        <div className="flex items-center gap-3.5 text-[13.5px]">
          <span className="h-[18px] w-px bg-border max-md:hidden" />
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
