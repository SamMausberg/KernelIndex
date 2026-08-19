import Link from "next/link"
import { releaseSha } from "@/server/env"

const LINKS = [
  { label: "Projects", href: "/implementations" },
  { label: "Contribute", href: "/submit" },
  { label: "Coverage", href: "/coverage" },
  { label: "Methodology", href: "/docs" },
  { label: "Legal", href: "/legal" },
] as const

/**
 * Global footer (§16.4): the demoted destinations — everything reachable,
 * nothing competing with the five-item nav. One quiet row; pages keep their
 * own contextual bottom rows above it.
 */
export function SiteFooter() {
  // No top margin of its own: every page already ends in its bottom
  // padding, which becomes the breathing room above the hairline.
  return (
    <footer className="border-t border-border">
      <div className="shell flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 py-6">
        <span className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-small text-subtle no-underline transition-colors hover:text-fg"
            >
              {link.label}
            </Link>
          ))}
          <a
            href="https://github.com/SamMausberg/KernelIndex"
            className="text-small text-subtle no-underline transition-colors hover:text-fg"
          >
            GitHub
          </a>
          <a
            href="/records/feed.xml"
            className="text-small text-subtle no-underline transition-colors hover:text-fg"
          >
            Feed
          </a>
        </span>
        {releaseSha && (
          <span className="font-mono text-mini text-faint">
            {releaseSha.slice(0, 7)}
          </span>
        )}
      </div>
    </footer>
  )
}
