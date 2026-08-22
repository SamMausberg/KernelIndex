import { Link } from "@/components/quiet-link"
import type { FeedEntry, FeedModel } from "@/lib/catalog"
import { countNoun, formatPrimary } from "@/lib/format"

/** One entry as one line: the fact, then its links. Record breaks lead
 * with the implementation and the number; imports state what the batch
 * brought; corrections and claims are stated as what they are. */
function FeedLine({ entry, isNew }: { entry: FeedEntry; isNew: boolean }) {
  const marker = isNew && <span className="text-accent"> · new</span>
  if (entry.kind === "record")
    return (
      <p className="py-1.5 text-body">
        <Link href={`/implementations/${entry.implementation.slug}`}>
          {entry.implementation.name}
        </Link>
        <span className="text-subtle"> took the record for </span>
        <Link
          href={`/operations/${entry.operation.slug}?workload=${entry.workloadId}&cohort=${encodeURIComponent(entry.cohortKey)}`}
          prefetch={false}
          className="text-fg"
        >
          {entry.operation.name}
        </Link>
        <span className="ml-2 font-mono text-mini text-faint">
          {entry.workloadSummary} · {entry.hardware}
        </span>
        <span className="text-subtle"> at </span>
        <span className="font-mono text-fg">{formatPrimary(entry.value)}</span>
        {entry.improvementPct !== null && (
          <span className="text-subtle">
            , {entry.improvementPct.toFixed(1)}% faster than{" "}
            {entry.previous.implementation.name}
          </span>
        )}
        {" · "}
        <Link href={`/runs/${entry.runId}`} className="text-small">
          Run →
        </Link>
        {marker}
      </p>
    )
  if (entry.kind === "import")
    return (
      <p className="py-1.5 text-body">
        <span className="text-fg">{entry.source.name}</span>
        <span className="text-subtle">
          {" "}
          import · {countNoun(entry.runs, "run")} ·{" "}
          {countNoun(entry.operations, "operation")} ·{" "}
          {entry.hardware.join(", ")}
          {entry.firstRecords > 0 &&
            ` · ${countNoun(entry.firstRecords, "first record")}`}
        </span>
        {marker}
      </p>
    )
  if (entry.kind === "correction")
    return (
      <p className="py-1.5 text-body">
        <Link href={`/implementations/${entry.implementation.slug}`}>
          {entry.implementation.name}
        </Link>
        <span className="text-subtle">
          {" "}
          on {entry.operation.name} {entry.action}
          {entry.reason && `: ${entry.reason}`}
        </span>
        {" · "}
        <Link href={`/runs/${entry.runId}`} className="text-small">
          Run →
        </Link>
        {marker}
      </p>
    )
  return (
    <p className="py-1.5 text-body">
      <Link href={`/projects/${entry.project.slug}`}>{entry.project.name}</Link>
      <span className="text-subtle"> claimed by {entry.by}</span>
      {marker}
    </p>
  )
}

/** Days as blocks with a mono date gutter (the ledger's history idiom);
 * `seenAt` marks entries newer than the reader's watermark. */
export function FeedDays({
  days,
  seenAt = null,
}: {
  days: FeedModel["days"]
  seenAt?: string | null
}) {
  if (days.length === 0)
    return (
      <p className="py-8 text-body text-faint">
        Nothing in the trailing 30 days.
      </p>
    )
  return days.map((day) => (
    <section
      key={day.date}
      className="grid grid-cols-[110px_minmax(0,1fr)] gap-5 border-b border-line py-2.5 max-md:grid-cols-1 max-md:gap-0"
    >
      <div className="py-1.5 font-mono text-small text-faint">{day.date}</div>
      <div className="min-w-0">
        {day.entries.map((entry) => (
          <FeedLine
            key={`${entry.kind}-${entry.at}-${"runId" in entry ? entry.runId : "source" in entry ? entry.source.slug : entry.project.slug}`}
            entry={entry}
            isNew={seenAt !== null && entry.at > seenAt}
          />
        ))}
      </div>
    </section>
  ))
}
