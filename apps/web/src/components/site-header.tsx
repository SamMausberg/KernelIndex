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
 * query string. The homepage floats its own transparent variant (`home`)
 * inside the hero so the illustrative notice can push it down; the layout
 * instance stands down there.
 */
export function SiteHeader({ home }: { home?: boolean }) {
  const pathname = usePathname()
  if (!home && pathname === "/") return null
  const onSearch = pathname.startsWith("/search")
  return (
    <div
      className={
        home
          ? "absolute inset-x-0 top-0 z-40"
          : "sticky top-0 z-50 border-b border-border bg-canvas"
      }
    >
      <div className="shell flex h-14 items-center gap-7">
        <Link
          href="/"
          className="font-mono text-[14.5px] font-semibold tracking-[-0.02em] text-fg hover:no-underline"
        >
          KernelIndex
        </Link>
        <nav className="flex gap-[22px] text-[13.5px]">
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
        {!home && !onSearch && (
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
