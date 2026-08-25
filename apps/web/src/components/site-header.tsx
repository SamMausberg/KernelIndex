"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { CommandK, useShortcutHint } from "./command-k"
import { Link } from "./quiet-link"

// Five items (§16.4): the primary surfaces only. Serving, Projects, and
// Contribute live in the global footer and the search browse — reachable
// everywhere, competing for attention nowhere. Models is primary: the
// whole-model question is the wedge.
//
// The nav sheds items as the viewport narrows rather than crushing: five at
// full width, four below md, and below sm only Search and Models, with the
// rest behind a plain "More" disclosure. A word, never a hamburger glyph —
// the header has no icons anywhere else.
const NAV = [
  { label: "Search", href: "/search", from: 0 },
  { label: "Models", href: "/models", from: 0 },
  { label: "Records", href: "/records", from: 1 },
  { label: "GPUs", href: "/gpus", from: 2 },
  { label: "Docs", href: "/docs", from: 1 },
]

/** In the bar: hidden until the viewport is wide enough to carry the item. */
const VISIBLE_FROM = ["", "max-sm:hidden", "max-md:hidden"]
/** In the More menu: the exact inverse, so an item is in one place or the
 * other at every width and never in both or neither. */
const MENU_UNTIL = ["hidden", "sm:hidden", "md:hidden"]

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
  authConfigured = false,
}: {
  authConfigured?: boolean
}) {
  const pathname = usePathname() ?? ""
  const onSearch = pathname.startsWith("/search")
  const sessionName = useSessionName(authConfigured)
  const shortcut = useShortcutHint()
  return (
    <div className="sticky top-0 z-50 border-b border-border bg-canvas">
      <div className="shell flex h-14 items-center gap-7 max-md:gap-4 max-md:px-4">
        <Link
          href="/"
          className="font-mono text-lead font-medium text-fg no-underline"
        >
          KernelIndex
        </Link>
        <nav className="flex items-center gap-6 text-body max-md:gap-3.5">
          {/* Hover-intent prefetch via quiet-link: no viewport prefetch —
              the header is on every page — but a rested pointer warms the
              target before the click. */}
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname.startsWith(item.href) ? "page" : undefined}
              className={`whitespace-nowrap transition-colors hover:text-fg no-underline ${
                pathname.startsWith(item.href) ? "text-fg" : "text-subtle"
              } ${VISIBLE_FROM[item.from]}`}
            >
              {item.label}
            </Link>
          ))}
          {/* The shed items, on narrow screens only. A details disclosure so
              it works before hydration and closes on blur like the ledger's
              hardware picker. */}
          <details
            className="relative md:hidden"
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                event.currentTarget.removeAttribute("open")
            }}
          >
            <summary className="cursor-pointer list-none whitespace-nowrap text-subtle transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
              More
            </summary>
            <div className="absolute top-[calc(100%+10px)] left-0 z-50 min-w-[150px] overflow-hidden rounded-md border border-edge bg-raised py-1">
              {NAV.filter((item) => item.from > 0).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={
                    pathname.startsWith(item.href) ? "page" : undefined
                  }
                  className={`block px-3 py-1.5 text-body no-underline hover:bg-accent-soft ${
                    pathname.startsWith(item.href) ? "text-fg" : "text-subtle"
                  } ${MENU_UNTIL[item.from]}`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
        </nav>
        <div className="flex-1" />
        {!onSearch && (
          <Link
            href="/search"
            className="well flex h-9 w-[220px] items-center gap-2 px-2.5 text-body text-faint transition-colors hover:text-subtle no-underline max-md:hidden"
          >
            Search
            <kbd className="key ml-auto px-1.5 py-0.5 font-mono text-mini">
              {shortcut}
            </kbd>
          </Link>
        )}
        <div className="flex items-center gap-3.5 text-body">
          <span className="h-4 w-px bg-border max-md:hidden" />
          {sessionName !== null ? (
            <Link
              href="/account"
              className="max-w-[160px] truncate text-subtle transition-colors hover:text-fg no-underline"
            >
              {sessionName}
            </Link>
          ) : (
            <Link
              href="/signin"
              className="text-subtle transition-colors hover:text-fg no-underline"
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
