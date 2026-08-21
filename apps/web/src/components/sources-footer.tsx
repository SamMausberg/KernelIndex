import type { SourceRef } from "@/lib/catalog"
import { formatDateUTC } from "@/lib/format"

/** The provenance footer shared by operation and GPU pages: which sources
 * back the page, each with its terms, and the newest observation date. */
export function SourcesFooter({
  sources,
  lastObservedAt,
  emptyText,
}: {
  sources: SourceRef[]
  lastObservedAt?: string | null
  emptyText?: string
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
      {lastObservedAt && (
        <span className="font-mono text-small text-faint">
          last observed {formatDateUTC(lastObservedAt)}
        </span>
      )}
    </div>
  )
}
