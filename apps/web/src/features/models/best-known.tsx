// The model page's evidence body (§16.21): per operation, the best known
// implementation on the selected GPU, resolved inside one comparison cohort,
// with the stated gaps beneath. Deployability is a filter with reasons,
// never a rank input (§11.8); a non-deployable fastest is labeled, not
// hidden. Rows follow the dense result-row idiom (§16.7).
import { CopyButton } from "@/components/copy-button"
import { Metric } from "@/components/metric"
import { Link } from "@/components/quiet-link"
import { TierChips, TrustCell } from "@/components/trust"
import { deltaVsFastest } from "@/features/answer/answer-slots"
import type { ModelBestKnown, ModelGap, ResultRow } from "@/lib/catalog"
import { countNoun, formatDateUTC, formatPrimary } from "@/lib/format"
import { deployability } from "@/server/policy/deployability"

const GRID =
  "grid grid-cols-[minmax(220px,1.5fr)_minmax(210px,1.3fr)_150px_minmax(190px,1.1fr)_92px_28px] min-w-[940px] items-center gap-x-4"

const GAP_GRID =
  "grid grid-cols-[minmax(200px,1.2fr)_150px_minmax(300px,1.8fr)] items-baseline gap-x-4 min-w-[720px]"

const REASON_WORDS: Record<string, string> = {
  NO_PUBLIC_SOURCE: "no public source",
  NO_INSTALL_RECIPE: "no install recipe",
  LICENSE_UNKNOWN: "license unknown",
}

/** The deployability verdict for one row, in words. */
function reasonsOf(row: ResultRow): string {
  return deployability({
    sourceAvailable: row.sourceAvailable,
    installable: row.installable,
    licenseConcluded: row.license.concluded,
  })
    .reasons.map((code) => REASON_WORDS[code] ?? code)
    .join(", ")
}

/** One plain-English expansion line: where the shown row stands against the
 * cohort's fastest, then the cohort's comparability statement. */
function expansionLine(entry: ModelBestKnown): string {
  const { fastest, deployable } = entry
  const parts: string[] = []
  if (deployable === null) {
    parts.push(
      `No entry in this cohort passes the deployability policy (${reasonsOf(fastest)}); the fastest known is shown.`,
    )
  } else if (deployable.runId !== fastest.runId) {
    const delta = deltaVsFastest(deployable, fastest)
    parts.push(
      `Fastest known in this cohort as of ${formatDateUTC(fastest.lastTestedAt)}: ${fastest.implementation.name}${
        fastest.primary ? ` at ${formatPrimary(fastest.primary)}` : ""
      }, not deployable (${reasonsOf(fastest)}).${
        delta ? ` ${deployable.implementation.name} runs ${delta}.` : ""
      }`,
    )
  } else {
    parts.push("Fastest known in this cohort, and deployable.")
  }
  parts.push(entry.cohort.description)
  if (entry.alternatives > 0)
    parts.push(
      `${entry.alternatives} more ${
        entry.alternatives === 1 ? "entry" : "entries"
      } in this cohort.`,
    )
  return parts.join(" ")
}

function EntryRow({ entry }: { entry: ModelBestKnown }) {
  const shown = entry.deployable ?? entry.fastest
  // When the deployable pick trails a faster non-deployable entry, the
  // collapsed row states the multiple too — the expansion is not the only
  // place the gap is visible (§2.2: no unqualified bests).
  const delta =
    entry.deployable !== null && entry.deployable.runId !== entry.fastest.runId
      ? deltaVsFastest(entry.deployable, entry.fastest)
      : null
  const operationHref = `/operations/${entry.operation.slug}?workload=${entry.workloadId}&cohort=${encodeURIComponent(entry.cohort.comparisonKey)}`
  return (
    <details className="group row-cv border-b border-line">
      <summary
        className={`${GRID} h-12 cursor-pointer list-none transition-colors hover:bg-raised focus-visible:bg-raised [&::-webkit-details-marker]:hidden`}
      >
        <div className="min-w-0 truncate">
          <Link
            href={`/operations/${entry.operation.slug}`}
            className="text-body text-fg hover:text-accent-bright"
          >
            {entry.operation.name}
          </Link>
          <span className="ml-2 font-mono text-mini text-faint">
            {shown.workloadSummary}
          </span>
        </div>
        <div className="min-w-0 truncate pr-3">
          <Link
            href={`/implementations/${shown.implementation.slug}`}
            className="text-body"
          >
            {shown.implementation.name}
          </Link>
          {entry.deployable === null ? (
            <span className="ml-2 font-mono text-label text-faint uppercase">
              not deployable
            </span>
          ) : (
            <>
              {delta && (
                <span className="ml-2 font-mono text-mini text-faint">
                  {delta}
                </span>
              )}
              {shown.project.name !== shown.implementation.name && (
                <span className="ml-2 text-small text-faint">
                  {shown.project.name}
                </span>
              )}
            </>
          )}
        </div>
        <div className="pr-3.5 text-right whitespace-nowrap">
          <Metric
            primary={shown.primary}
            spread
            valueClassName="font-mono text-body text-fg"
          />
        </div>
        <TrustCell row={shown} />
        {/* Staleness is a fact, not a warning (§16.16). */}
        <div className="font-mono text-mini text-faint">
          <span className="whitespace-nowrap">
            {formatDateUTC(shown.lastTestedAt)}
          </span>
          {shown.stale && <span className="block text-subtle">stale</span>}
        </div>
        <div
          aria-hidden="true"
          className="pr-1 text-right font-mono text-small text-faint transition-transform group-open:rotate-90"
        >
          ›
        </div>
      </summary>

      <div className="border-t border-line bg-surface py-3.5 pr-4 pl-6 max-md:pl-4">
        <p className="max-w-[96ch] text-small text-muted">
          {expansionLine(entry)}
        </p>
        {shown.install && (
          <div className="plate mt-3 flex max-w-[520px] items-center gap-2.5 py-2 pr-2 pl-3">
            <code className="min-w-0 flex-1 truncate font-mono text-small text-muted">
              {shown.install.command}
            </code>
            <CopyButton text={shown.install.command} event="install_copied" />
          </div>
        )}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-6 gap-y-2">
          <TierChips row={shown} />
          <span className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <Link href={operationHref} className="action">
              Cohort on the operation page →
            </Link>
            {shown.sourceAvailable && (
              <Link
                href={`/implementations/${shown.implementation.slug}#code`}
                className="action"
              >
                View source →
              </Link>
            )}
            {!shown.install && shown.sourceAvailable && (
              <Link
                href={`/implementations/${shown.implementation.slug}#use`}
                className="action"
              >
                Vendor the source →
              </Link>
            )}
            {shown.runId && (
              <Link href={`/runs/${shown.runId}`} className="action">
                Run detail →
              </Link>
            )}
          </span>
        </div>
      </div>
    </details>
  )
}

/** Best-known table grouped by family: engraved column header once, then a
 * quiet family caption over each group's disclosure rows. */
export function BestKnownTable({
  groups,
}: {
  groups: { family: string; entries: ModelBestKnown[] }[]
}) {
  return (
    <div className="overflow-x-auto">
      <div
        className={`${GRID} border-b border-border-strong font-mono text-label text-faint uppercase`}
      >
        <div className="py-2">Operation · workload</div>
        <div className="py-2">Best known</div>
        <div className="py-2 pr-3.5 text-right">Record</div>
        <div className="py-2">Trust</div>
        <div className="py-2">Observed</div>
        <div />
      </div>
      {groups.map((group) => (
        <div key={group.family} className="min-w-[940px]">
          <div className="border-b border-line pt-4 pb-1.5 font-mono text-small text-muted">
            {group.family}
            <span className="ml-2 text-faint">
              {countNoun(group.entries.length, "operation")}
            </span>
          </div>
          {group.entries.map((entry) => (
            <EntryRow key={entry.operation.slug} entry={entry} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Stated gaps on the selected GPU (§2.3): unmeasured operations first,
 * then measured operations with no deployable entry. Facts, not warnings. */
export function GapTable({
  gaps,
  undeployable,
  selectedGpu,
}: {
  gaps: ModelGap[]
  undeployable: ModelBestKnown[]
  selectedGpu: string
}) {
  const row = (slug: string, name: string, family: string, status: string) => (
    <div key={slug} className={`${GAP_GRID} border-b border-line py-2.5`}>
      <div className="min-w-0 truncate">
        <Link href={`/operations/${slug}`} className="text-body">
          {name}
        </Link>
      </div>
      <div className="font-mono text-small text-subtle">{family}</div>
      <div className="text-small text-faint">{status}</div>
    </div>
  )
  return (
    <div className="overflow-x-auto">
      <div
        className={`${GAP_GRID} border-b border-border-strong pb-2 font-mono text-label text-faint uppercase`}
      >
        <div>Operation</div>
        <div>Family</div>
        <div>Status</div>
      </div>
      {gaps.map((gap) => {
        const elsewhere = gap.measuredOn.filter(
          (model) => model !== selectedGpu,
        )
        return row(
          gap.operation.slug,
          gap.operation.name,
          gap.family,
          elsewhere.length > 0
            ? `0 eligible runs on ${selectedGpu} · measured on ${elsewhere.join(", ")}`
            : "0 eligible runs · gap",
        )
      })}
      {undeployable.map((entry) =>
        row(
          entry.operation.slug,
          entry.operation.name,
          entry.family,
          `measured · no deployable entry (${reasonsOf(entry.fastest)})`,
        ),
      )}
    </div>
  )
}
