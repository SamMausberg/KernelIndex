// GPU dossier (§16.4): what the index knows about one hardware model —
// records currently held on it, coverage by operation family, and the
// sources behind the evidence. Records come from the same ledger model the
// records page renders.
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ContextHeader } from "@/components/context-header"
import { ExpandRows } from "@/components/expand-rows"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { Metric } from "@/components/metric"
import { Link } from "@/components/quiet-link"
import { Section } from "@/components/section"
import { SourcesFooter } from "@/components/sources-footer"
import { StatStrip } from "@/components/stat-strip"
import { FollowButton } from "@/features/follow/follow-button"
import { MonthlyActivity } from "@/features/hardware/activity"
import { RecordSpark } from "@/features/records/timeline"
import { getHardwarePage } from "@/lib/catalog"
import { formatDateUTC } from "@/lib/format"

type Props = { params: Promise<{ slug: string }> }

export const revalidate = 300
// Without generateStaticParams a dynamic-param route never registers for
// ISR (Next 16 renders it per request, `revalidate` or not); an empty list
// keeps the build DB-free while unknown slugs render once and cache.
export function generateStaticParams(): { slug: string }[] {
  return []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const model = await getHardwarePage(slug)
  if (!model) notFound()
  return {
    title: model.hardware.model,
    description: `GPU kernel benchmark evidence on ${model.hardware.model}: ${model.stats.runs} published runs across ${model.stats.operations} operations, with source, license, and protocol for every record.`,
    alternates: { canonical: `/gpus/${slug}` },
  }
}

const RECORD_GRID =
  "grid grid-cols-[minmax(240px,1.5fr)_92px_150px_minmax(180px,1.2fr)_96px] items-center gap-x-4 min-w-[840px]"
const RECORD_LIMIT = 40

export default async function GpuPage({ params }: Props) {
  const { slug } = await params
  const model = await getHardwarePage(slug)
  if (!model) notFound()
  const records = model.records.slice(0, RECORD_LIMIT)
  const overflow = model.records.length - records.length

  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <ContextHeader
        title={model.hardware.model}
        context={model.hardware.architecture ?? undefined}
        meta={
          <FollowButton
            kind="gpu"
            followKey={model.hardware.model}
            label={model.hardware.model}
            href={`/gpus/${slug}`}
            noun="GPU"
          />
        }
      />

      <main className="shell pb-24">
        {/* The page's reading before any table (§16 page grammar): what the
            index holds for this GPU, in three numbers. */}
        <StatStrip
          facts={[
            {
              label: "Records held",
              value: model.records.length.toLocaleString("en-US"),
            },
            {
              label: "Runs",
              value: model.stats.runs.toLocaleString("en-US"),
            },
            {
              label: "Operations",
              value: model.stats.operations.toLocaleString("en-US"),
              detail: `${model.stats.implementations.toLocaleString("en-US")} implementations`,
            },
          ]}
        />
        <Section id="records" title="Records held on this GPU">
          {records.length > 0 ? (
            <div className="overflow-x-auto">
              <div
                className={`${RECORD_GRID} border-b border-border-strong pb-2 font-mono text-label text-faint uppercase`}
              >
                {/* Evidence lives on the run dossier (§16 row diet). */}
                <div>Operation · workload</div>
                <div>History</div>
                <div className="pr-3.5 text-right">Record</div>
                <div>Implementation</div>
                <div className="text-right">Since</div>
              </div>
              <ExpandRows
                cap={12}
                noun="records"
                rows={records.map((holder) => (
                  <div
                    key={holder.cohortKey}
                    className={`${RECORD_GRID} border-b border-line py-3 transition-colors hover:bg-raised`}
                  >
                    <div className="min-w-0 truncate">
                      {/* Straight to the record's cohort, never the
                          operation's default workload (§16.12). */}
                      <Link
                        href={`/operations/${holder.operation.slug}?workload=${holder.workloadId}&cohort=${encodeURIComponent(holder.cohortKey)}`}
                        prefetch={false}
                        className="text-body"
                      >
                        {holder.operation.name}
                      </Link>
                      <span className="ml-2 font-mono text-mini text-faint">
                        {holder.workloadSummary}
                      </span>
                    </div>
                    <div>
                      <RecordSpark history={holder.history} />
                    </div>
                    <div className="pr-3.5 text-right whitespace-nowrap">
                      <Metric
                        primary={holder.current.primary}
                        valueClassName="font-mono text-body text-fg"
                      />
                    </div>
                    <div className="min-w-0 truncate">
                      <Link
                        href={`/implementations/${holder.current.implementation.slug}`}
                        prefetch={false}
                        className="text-small"
                      >
                        {holder.current.implementation.name}
                      </Link>
                    </div>
                    <div className="text-right font-mono text-mini text-faint">
                      {formatDateUTC(holder.since)}
                    </div>
                  </div>
                ))}
              />
            </div>
          ) : (
            <p className="py-2 text-body text-faint">
              No current records on this GPU under the default source-backed
              filter.
            </p>
          )}
          <p className="mt-3 text-small text-faint">
            {overflow > 0 &&
              `${overflow} more record${overflow === 1 ? "" : "s"} · `}
            <Link
              href={`/records?hw=${encodeURIComponent(model.hardware.model)}`}
            >
              Open in the records ledger →
            </Link>
          </p>
        </Section>

        <Section id="coverage" title="Coverage by operation family">
          {/* Length carries the share (single hue, §16.2 viz tokens); the
              printed numbers stay the record of fact. */}
          <div className="overflow-x-auto">
            <div className="grid min-w-[720px] grid-cols-[minmax(180px,1fr)_minmax(160px,1.2fr)_repeat(3,100px)] items-baseline gap-x-4 border-b border-border-strong pb-2 font-mono text-label text-faint uppercase">
              <div>Family</div>
              <div />
              <div className="text-right">Operations</div>
              <div className="text-right">Runs</div>
              <div className="text-right">With source</div>
            </div>
            {model.families.map((family) => (
              <div
                key={family.family}
                className="grid min-w-[720px] grid-cols-[minmax(180px,1fr)_minmax(160px,1.2fr)_repeat(3,100px)] items-center gap-x-4 border-b border-line py-2.5"
              >
                <div className="font-mono text-small text-muted">
                  {family.family}
                </div>
                <div aria-hidden="true" className="flex items-center">
                  <span
                    className="block h-[9px]"
                    style={{
                      width: `${Math.max((family.runs / (model.families[0]?.runs || 1)) * 100, 1)}%`,
                      background: "var(--color-viz-1)",
                    }}
                  />
                </div>
                <div className="text-right font-mono text-small text-subtle">
                  {family.operations.toLocaleString("en-US")}
                </div>
                <div className="text-right font-mono text-small text-subtle">
                  {family.runs.toLocaleString("en-US")}
                </div>
                <div className="text-right font-mono text-small text-subtle">
                  {family.withSource.toLocaleString("en-US")}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section id="activity" title="Record activity">
          <MonthlyActivity records={model.records} />
        </Section>

        <SourcesFooter
          sources={model.sources}
          lastObservedAt={model.stats.lastObservedAt}
        />
      </main>
    </>
  )
}
