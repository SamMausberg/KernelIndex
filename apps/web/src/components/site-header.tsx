"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { CommandK } from "./command-k"
import { Link } from "./quiet-link"

// GPUs and Projects yield on narrow screens (search reaches both); the
// original five keep the mobile header on one uncramped line.
const NAV = [
  { label: "Search", href: "/search" },
  { label: "Records", href: "/records" },
  { label: "GPUs", href: "/gpus", desktopOnly: true },
  { label: "Projects", href: "/implementations", desktopOnly: true },
  { label: "Serving", href: "/serving" },
  { label: "Docs", href: "/docs" },
  { label: "Contribute", href: "/submit" },
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
/**
 * Session state for the nav without making catalog pages dynamic: the
 * header stays a client island and asks Better Auth's GET /get-session
 * after mount. Signed-out (the overwhelming default) renders immediately;
 * a signed-in visitor sees their name replace "Sign in" post-hydration.
 */
function useSessionName(enabled: boolean): string | null {
  const [name, setName] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    fetch("/api/auth/get-session", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((session: { user?: { name?: string } } | null) => {
        if (session?.user?.name) setName(session.user.name)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [enabled])
  return name
}

export function SiteHeader({
  showServing = true,
  authConfigured = false,
}: {
  showServing?: boolean
  authConfigured?: boolean
}) {
  const pathname = usePathname() ?? ""
  const onSearch = pathname.startsWith("/search")
  const sessionName = useSessionName(authConfigured)
  const nav = showServing ? NAV : NAV.filter((item) => item.href !== "/serving")
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
          {/* Hover-intent prefetch via quiet-link: no viewport prefetch —
              the header is on every page — but a rested pointer warms the
              target before the click. */}
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`transition-colors hover:text-fg hover:no-underline ${
                pathname.startsWith(item.href) ? "text-fg" : "text-subtle"
              }${item.desktopOnly ? " max-md:hidden" : ""}`}
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
          {sessionName !== null ? (
            <Link
              href="/account"
              className="max-w-[160px] truncate text-subtle transition-colors hover:text-fg hover:no-underline"
            >
              {sessionName}
            </Link>
          ) : (
            <Link
              href="/signin"
              className="text-subtle transition-colors hover:text-fg hover:no-underline"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
      <CommandK />
    </div>
  )
}
