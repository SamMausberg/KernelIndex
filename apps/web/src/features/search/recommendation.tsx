import { ImplName } from "@/components/impl-name"
import { KeyValueList } from "@/components/key-value-list"
import { Link } from "@/components/quiet-link"
import {
  AnswerSlots,
  answerLabel,
  isUsable,
} from "@/features/answer/answer-slots"
import type { ResultRow, SearchPageModel } from "@/lib/catalog"
import { formatPrimary } from "@/lib/format"

/**
 * The answer, not a ranking (§16.6): the fastest known result and, when it
 * differs, the fastest usable one, beside the cohort's invariant facts.
 * At most one qualifier line follows — the single most relevant faster
 * number outside the headline (§12: the faster number is stated, never
 * hidden), not a stack of caveats.
 */
export function Recommendation({
  top,
  fastest,
  model,
  hiddenFaster = null,
  cohortInferred = false,
}: {
  top: ResultRow
  /** The cohort's pure-latency leader; differs from `top` when a stronger
   * tier surfaced first. */
  fastest: ResultRow | null
  model: SearchPageModel
  /** Cohort leader hidden by the default source filter. */
  hiddenFaster?: ResultRow | null
  /** True when the pinned cohort was selected by evidence density rather
   * than by the query (§12.1) — the facts panel then states the inference. */
  cohortInferred?: boolean
}) {
  const deployable = isUsable(top)
    ? null
    : (model.groups.exact.find(isUsable) ?? null)
  const fasterInCohort =
    fastest &&
    fastest.runId !== top.runId &&
    fastest.primary &&
    top.primary &&
    fastest.primary.value < top.primary.value
      ? fastest
      : null
  const fasterElsewhere = [
    ...model.groups.reported,
    ...model.groups.compatible,
  ].find(
    (row) =>
      row.primary !== null &&
      top.primary !== null &&
      row.primary.value < top.primary.value,
  )
  // Baseline context (§8.14): an unbeaten source baseline is stated as such,
  // never presented as a competitive record; rows that beat one say by how
  // much — the two numbers experts actually think in.
  const exactBaseline = model.groups.exact.find((row) => row.baseline) ?? null
  const allBaseline =
    model.groups.exact.length > 0 && model.groups.exact.every((r) => r.baseline)
  const vsBaseline =
    !top.baseline &&
    exactBaseline?.primary &&
    top.primary &&
    top.primary.value > 0 &&
    exactBaseline.primary.value !== top.primary.value
      ? exactBaseline.primary.value / top.primary.value
      : null
  // One qualifier only, most relevant first: a leader the source filter
  // hides, a faster in-cohort row behind a weaker tier, or a faster number
  // under a different protocol.
  const qualifier = hiddenFaster?.primary
    ? {
        text: "Fastest known without source: ",
        row: hiddenFaster,
        named: false,
      }
    : fasterInCohort?.primary
      ? {
          text: "Fastest overall in this comparison: ",
          row: fasterInCohort,
          named: true,
        }
      : fasterElsewhere?.primary
        ? {
            text: "Faster under a different protocol, not comparable here: ",
            row: fasterElsewhere,
            named: false,
          }
        : null
  return (
    <section className="grid grid-cols-[minmax(0,2.2fr)_minmax(260px,1fr)] gap-10 border-b border-border py-6 max-lg:grid-cols-1">
      <div>
        <AnswerSlots
          top={top}
          topLabel={
            (allBaseline ? "Source baseline · unbeaten" : answerLabel(top)) +
            (fasterInCohort ? " with source" : "")
          }
          deploy={deployable}
          vsBaseline={vsBaseline}
        />
        {qualifier?.row.primary && (
          <p className="mt-3.5 text-body text-subtle">
            {qualifier.text}
            {qualifier.named && (
              <>
                <Link
                  href={`/implementations/${qualifier.row.implementation.slug}`}
                  className="font-mono text-body"
                >
                  <ImplName name={qualifier.row.implementation.name} />
                </Link>{" "}
                at{" "}
              </>
            )}
            <span className="font-mono text-fg">
              {formatPrimary(qualifier.row.primary)}
            </span>
            {qualifier.row.runId && !qualifier.named && (
              <>
                {" "}
                <Link href={`/runs/${qualifier.row.runId}`}>View →</Link>
              </>
            )}
          </p>
        )}
      </div>
      {model.cohort && (
        <div className="border-l border-border pl-9 max-lg:border-l-0 max-lg:pl-0">
          <div className="flex items-baseline justify-between gap-4 text-small">
            <span className="text-subtle">
              {model.cohort.profile === "source_native"
                ? "Ranked under the source's published protocol"
                : "Exact comparison"}
            </span>
            <Link href="/docs#comparability" className="text-small text-faint">
              Why comparable?
            </Link>
          </div>
          <div className="mt-2.5">
            <KeyValueList items={model.cohort.facts} />
          </div>
          {/* Inferred dimensions are stated beside the facts they filled in
              (§12.1, audit 2026-08-25): "h128, batch 24" is never silent. */}
          {cohortInferred && (
            <p className="mt-2.5 text-small text-faint">
              The query left these dimensions open; this is the most-measured of{" "}
              {model.cohortOptions.length} cohorts. The hardware chips above
              switch it.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
