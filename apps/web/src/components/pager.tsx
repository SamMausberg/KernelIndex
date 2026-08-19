import { Link } from "@/components/quiet-link"

/**
 * The page strip under every paged table — one implementation for search,
 * browse, and the ledger. `onNavigate` makes paging an instant client
 * transition where an island owns the state; the href keeps deep links and
 * no-JS paging working either way.
 */
export function Pager({
  page,
  pageCount,
  hrefFor,
  onNavigate,
}: {
  page: number
  pageCount: number
  hrefFor: (page: number) => string
  onNavigate?: (page: number) => void
}) {
  if (pageCount <= 1) return null
  const arm = (target: number, label: string, enabled: boolean) =>
    enabled ? (
      <Link
        href={hrefFor(target)}
        prefetch={false}
        onClick={
          onNavigate &&
          ((event) => {
            event.preventDefault()
            onNavigate(target)
          })
        }
      >
        {label}
      </Link>
    ) : (
      <span className="text-ghost">{label}</span>
    )
  return (
    <div className="mt-4 flex items-baseline gap-5 text-small">
      {arm(page - 1, "← Previous", page > 1)}
      <span className="font-mono text-small text-faint">
        page {page} of {pageCount}
      </span>
      {arm(page + 1, "Next →", page < pageCount)}
    </div>
  )
}
