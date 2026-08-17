// GPU dossier (§16.4): what the index knows about one hardware model —
// records currently held on it, coverage by operation family, and the
// sources behind the evidence. Records come from the same ledger model the
// records page renders.
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ContextHeader } from "@/components/context-header"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { Metric } from "@/components/metric"
import { Section } from "@/components/section"
import { EvidenceCell } from "@/components/trust"
import { getHardwarePage } from "@/lib/catalog"
import { formatDateShort, formatDateUTC } from "@/lib/format"

type Props = { params: Promise<{ slug: string }> }

export const revalidate = 300

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const model = await getHardwarePage(slug)
  if (!model) notFound()
  return { title: model.hardware.model }
}

const RECORD_GRID =
  "grid grid-cols-[minmax(240px,1.5fr)_150px_minmax(180px,1.2fr)_92px_96px] items-center gap-x-4 min-w-[860px]"
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
      <div className="scan-line" />
      <ContextHeader
        title={model.hardware.model}
        meta={
          <span>
            {model.stats.runs.toLocaleString("en-US")} runs ·{" "}
            {model.stats.operations.toLocaleString("en-US")} operations ·{" "}
            {model.stats.implementations.toLocaleString("en-US")}{" "}
            implementations
          </span>
        }
      >
        {model.hardware.architecture && (
          <span className="key mt-2.5 inline-block px-2 py-[3px] font-mono text-[11.5px] text-subtle">
            {model.hardware.architecture}
          </span>
        )}
      </ContextHeader>

      <main className="shell animate-fade-in pb-20">
        <Section id="records" title="Records held on this GPU">
          {records.length > 0 ? (
            <div className="overflow-x-auto">
              <div
                className={`${RECORD_GRID} border-b border-border-strong pb-2 text-[11.5px] text-faint`}
              >
                <div>Operation · workload</div>
                <div className="pr-3.5 text-right">Record</div>
                <div>Implementation</div>
                <div>Evidence</div>
                <div className="text-right">Since</div>
              </div>
              {records.map((holder) => (
                <div
                  key={holder.cohortKey}
                  className={`${RECORD_GRID} border-b border-line py-3 transition-colors hover:bg-raised`}
                >
                  <div className="min-w-0 truncate">
                    <Link
                      href={`/operations/${holder.operation.slug}`}
                      className="text-[13px]"
                    >
                      {holder.operation.name}
                    </Link>
                    <span className="ml-2 font-mono text-[11.5px] text-faint">
                      {holder.workloadSummary}
                    </span>
                  </div>
                  <div className="pr-3.5 text-right whitespace-nowrap">
                    <Metric
                      primary={holder.current.primary}
                      valueClassName="font-mono text-[13px] text-fg"
                    />
                  </div>
                  <div className="min-w-0 truncate">
                    <Link
                      href={`/implementations/${holder.current.implementation.slug}`}
                      className="text-[12.5px]"
                    >
                      {holder.current.implementation.name}
                    </Link>
                  </div>
                  <EvidenceCell row={holder.current} />
                  <div className="text-right font-mono text-[11.5px] text-faint">
                    {formatDateShort(holder.since)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-2 text-[13px] text-faint">
              No current records on this GPU under the default source-backed
              filter.
            </p>
          )}
          <p className="mt-3 text-[12.5px] text-faint">
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
          <div className="overflow-x-auto">
            <div className="grid min-w-[560px] grid-cols-[minmax(200px,1.4fr)_repeat(3,110px)] items-baseline gap-x-4 border-b border-border-strong pb-2 text-[11.5px] text-faint">
              <div>Family</div>
              <div className="text-right">Operations</div>
              <div className="text-right">Runs</div>
              <div className="text-right">With source</div>
            </div>
            {model.families.map((family) => (
              <div
                key={family.family}
                className="grid min-w-[560px] grid-cols-[minmax(200px,1.4fr)_repeat(3,110px)] items-baseline gap-x-4 border-b border-line py-2.5"
              >
                <div className="font-mono text-[12.5px] text-muted">
                  {family.family}
                </div>
                <div className="text-right font-mono text-[12.5px] text-subtle">
                  {family.operations.toLocaleString("en-US")}
                </div>
                <div className="text-right font-mono text-[12.5px] text-subtle">
                  {family.runs.toLocaleString("en-US")}
                </div>
                <div className="text-right font-mono text-[12.5px] text-subtle">
                  {family.withSource.toLocaleString("en-US")}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <div className="mt-12 flex flex-wrap items-baseline justify-between gap-5 border-t border-border pt-5 text-[12.5px]">
          <span className="text-subtle">
            Sources:{" "}
            {model.sources.map((source, index) => (
              <span key={source.name}>
                {index > 0 && " · "}
                {source.url ? (
                  <a href={source.url}>{source.name}</a>
                ) : (
                  source.name
                )}
                {source.license && ` · ${source.license}`}
              </span>
            ))}
          </span>
          {model.stats.lastObservedAt && (
            <span className="font-mono text-[12px] text-faint">
              last observed {formatDateUTC(model.stats.lastObservedAt)}
            </span>
          )}
        </div>
      </main>
    </>
  )
}
