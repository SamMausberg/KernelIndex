import type { MouseEventHandler } from "react"
import { Link } from "@/components/quiet-link"

/**
 * The filter chip (§16.7): one implementation for every toggleable facet
 * across search, the records ledger, and browse. State lives in the border
 * (`key` / `key-on`); a dead chip states its count and does nothing.
 */
export function FilterChip({
  href,
  onClick,
  on,
  dead = false,
  title,
  label,
  count,
}: {
  href: string
  onClick?: MouseEventHandler<HTMLAnchorElement>
  on: boolean
  /** Nothing to toggle to: rendered inert with an explanatory title. */
  dead?: boolean
  title?: string
  label: string
  count?: number
}) {
  // The selected surface (accent-soft) is lighter than the canvas: the
  // counter steps up one role there to keep AA contrast (§16.17).
  const counter = count !== undefined && (
    <span
      className={`ml-1 font-mono text-mini ${on ? "text-subtle" : "text-faint"}`}
    >
      {count}
    </span>
  )
  // Dead state reads one tier below a live chip: faint, not ghost — ghost
  // is decorative-only and fails AA contrast for readable text (§16.17).
  if (dead) {
    return (
      <span
        title={title}
        className="key text-small whitespace-nowrap text-faint"
      >
        {label}
        {counter}
      </span>
    )
  }
  return (
    <Link
      href={href}
      prefetch={false}
      // Toggles with an href fallback: aria-pressed is only valid with the
      // button role.
      role="button"
      aria-pressed={on}
      onClick={onClick}
      className={`key text-small whitespace-nowrap no-underline ${
        on ? "key-on" : "text-subtle hover:text-fg"
      }`}
    >
      {label}
      {counter}
    </Link>
  )
}
