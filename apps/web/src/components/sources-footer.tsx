import { ApiLink } from "@/components/api-link"
import { Link } from "@/components/quiet-link"
import type { SourceRef } from "@/lib/catalog"
import { formatDateUTC } from "@/lib/format"

/** The provenance footer shared by the entity dossiers: which sources back
 * the page, each with its terms, the newest observation date, and — when
 * `api` names the page's /api/v1 twin — the machine link (§16.18). `docs`
 * carries the page's one methodology link (§16 link diet: doc links live
 * here, not repeated through the sections). */
export function SourcesFooter({
  sources,
  lastObservedAt,
  emptyText,
  api,
  docs,
}: {
  sources: SourceRef[]
  lastObservedAt?: string | null
  emptyText?: string
  api?: string
  docs?: { href: string; label: string }
}) {
  return (
    <div className="mt-12 flex flex-wrap items-baseline justify-between gap-5 border-t border-border pt-5 text-small">
      <span className="text-subtle">
        {sources.length > 0 ? (
          <>
            Sources:{" "}
            {sources.map((source, index) => (
              <span key={source.name}>
                {index > 0 && " · "}
                {source.url ? (
                  <a href={source.url}>{source.name}</a>
                ) : (
                  source.name
                )}
                {source.observedAt && ` (${formatDateUTC(source.observedAt)})`}
                {source.license && ` · ${source.license}`}
              </span>
            ))}
          </>
        ) : (
          (emptyText ?? "No source imports yet.")
        )}
      </span>
      <span className="flex items-baseline gap-x-5">
        {lastObservedAt && (
          <span className="font-mono text-small text-faint">
            last observed {formatDateUTC(lastObservedAt)}
          </span>
        )}
        {docs && (
          <Link href={docs.href} className="text-small text-faint">
            {docs.label}
          </Link>
        )}
        {api && <ApiLink path={api} />}
      </span>
    </div>
  )
}
