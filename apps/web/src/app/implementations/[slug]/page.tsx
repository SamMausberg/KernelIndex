import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ContextHeader } from "@/components/context-header"
import { CopyButton } from "@/components/copy-button"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { KeyValueList } from "@/components/key-value-list"
import { Metric } from "@/components/metric"
import { Link } from "@/components/quiet-link"
import { Section } from "@/components/section"
import {
  SourceCodeView,
  SourceDiffView,
} from "@/features/implementations/source-view"
import { getImplementationPage } from "@/lib/catalog"
import { evidenceLabel, formatDateShort, formatDateUTC } from "@/lib/format"

// Implementation dossiers change only on importer runs; ISR on first hit.
export const revalidate = 300

const EVIDENCE_GRID =
  "grid grid-cols-[minmax(260px,1.6fr)_170px_150px_90px_110px] min-w-[780px]"

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const model = await getImplementationPage(slug)
  // Metadata resolves before headers flush: failing here makes the status
  // a real 404 instead of a soft-404 streamed into a 200.
  if (!model) notFound()
  return { title: model.implementation.name }
}

export default async function ImplementationPage({ params }: Props) {
  const { slug } = await params
  const model = await getImplementationPage(slug)
  if (!model) notFound()
  const support = [
    ...model.support.hardware,
    ...model.support.architectures,
  ].join(" / ")

  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <div className="scan-line" />
      <ContextHeader
        title={
          model.implementation.name === model.implementation.slug ? (
            <span className="font-mono text-[19px]">
              {model.implementation.name}
            </span>
          ) : (
            <span className="text-[19px]">{model.implementation.name}</span>
          )
        }
        context={
          <>
            {model.implementation.name !== model.implementation.slug && (
              <>
                <span className="font-mono text-[12px]">
                  {model.implementation.slug}
                </span>
                {" · "}
              </>
            )}
            {model.project.name !== model.implementation.name &&
              (model.project.repositoryUrl ? (
                <>
                  <a href={model.project.repositoryUrl}>{model.project.name}</a>
                  {" · "}
                </>
              ) : (
                `${model.project.name} · `
              ))}
            {[
              model.interface.language === "unknown"
                ? null
                : model.interface.language,
              model.license.concluded ??
                model.license.declared ??
                "License unknown",
              support || null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </>
        }
        meta={
          <>
            {model.sourceCode && (
              <a href="#code">
                Kernel source · {model.sourceCode.content.split("\n").length}{" "}
                lines ↓
              </a>
            )}
            <span>{model.trust.summary}</span>
          </>
        }
      />

      <main className="shell animate-fade-in pb-20">
        <Section id="use" title="Use it">
          {/* The deployability verdict first (§16.7): can this be used, in
              one neutral line, before any evidence or provenance. */}
          <p className="mb-4 text-[13.5px] text-fg">
            {model.usage.install
              ? `Installable · ${model.usage.install.kind}`
              : model.source.available
                ? "Source available · no install recipe recorded"
                : "Benchmark submission only · no public source"}
            <span className="text-subtle">
              {" · "}
              {model.license.concluded ??
                model.license.declared ??
                "license unknown"}
            </span>
            {model.source.available && (
              <Link href="#code" className="ml-4 text-[12.5px]">
                View source →
              </Link>
            )}
          </p>
          <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] gap-11 max-lg:grid-cols-1">
            <div>
              {model.usage.install ? (
                <div className="plate flex max-w-[560px] items-center gap-2.5 py-2 pr-2 pl-3">
                  <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-muted">
                    {model.usage.install.command}
                  </code>
                  <CopyButton
                    text={model.usage.install.command}
                    event="install_copied"
                  />
                </div>
              ) : (
                <p className="text-[13px] text-faint">
                  No install recipe recorded for this revision.
                </p>
              )}
              {model.usage.invocationExample && (
                <pre className="plate mt-4 max-w-[560px] overflow-x-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed text-muted">
                  {model.usage.invocationExample}
                </pre>
              )}
              <div className="mt-4 max-w-[560px]">
                <KeyValueList
                  items={[
                    {
                      key: "interface",
                      value: [
                        model.interface.language,
                        model.interface.framework,
                      ]
                        .filter(Boolean)
                        .join(" · "),
                    },
                    ...(model.interface.symbol
                      ? [{ key: "symbol", value: model.interface.symbol }]
                      : []),
                    ...(model.interface.sourcePath
                      ? [{ key: "path", value: model.interface.sourcePath }]
                      : []),
                    ...model.usage.requirements.map((requirement) => ({
                      key: requirement.name,
                      value: requirement.constraint,
                    })),
                  ]}
                />
              </div>
            </div>
            <div className="border-l border-border pl-9 max-lg:border-l-0 max-lg:pl-0">
              <div className="mb-2.5 text-[12.5px] text-subtle">
                Compatibility
              </div>
              <KeyValueList
                items={[
                  {
                    key: "hardware",
                    value: model.support.hardware.join(", ") || "declared only",
                  },
                  {
                    key: "architectures",
                    value: model.support.architectures.join(", ") || "—",
                  },
                  { key: "dtypes", value: model.support.dtypes.join(", ") },
                  ...(model.support.layouts.length > 0
                    ? [
                        {
                          key: "layouts",
                          value: model.support.layouts.join(", "),
                        },
                      ]
                    : []),
                  ...model.support.axes.map((axis, index) => ({
                    key: index === 0 ? "axes" : " ",
                    value: axis,
                  })),
                ]}
              />
            </div>
          </div>
        </Section>

        <Section id="performance" title="Benchmark evidence">
          {/* Purpose-built rows: this page IS the implementation, so each
              row states the workload it was measured on — never its own
              name, rank, or a self-comparison. */}
          <div className="overflow-x-auto">
            {model.bestResults.length > 0 ? (
              <div className="min-w-[780px]">
                <div
                  className={`${EVIDENCE_GRID} border-b border-border-strong text-[11.5px] text-faint`}
                >
                  <div className="py-2">Operation / workload</div>
                  <div className="py-2">Hardware</div>
                  <div className="py-2 pr-3.5 text-right">Latency</div>
                  <div className="py-2">Observed</div>
                  <div />
                </div>
                {model.bestResults.map((row) => (
                  <div
                    key={row.runId ?? row.workloadSummary}
                    className={`${EVIDENCE_GRID} h-[47px] items-center border-b border-line transition-colors hover:bg-raised`}
                  >
                    <div className="min-w-0 truncate pr-3">
                      <Link
                        href={`/operations/${row.operation.slug}`}
                        className="text-[13px] text-fg hover:text-accent-bright"
                      >
                        {row.operation.name}
                      </Link>
                      <span className="ml-2 font-mono text-[11.5px] text-faint">
                        {row.workloadSummary}
                      </span>
                    </div>
                    <div className="truncate pr-3 font-mono text-[12px] text-muted">
                      {row.hardware.model}
                    </div>
                    <div className="pr-3.5 text-right whitespace-nowrap">
                      <Metric
                        primary={row.primary}
                        spread
                        valueClassName="font-mono text-[13.5px] text-fg"
                      />
                    </div>
                    <div className="font-mono text-[11.5px] text-faint">
                      {formatDateShort(row.lastTestedAt)}
                    </div>
                    <div className="pr-1 text-right text-[12.5px]">
                      {row.runId && (
                        <Link href={`/runs/${row.runId}`}>Run →</Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-[13px] text-faint">
                No published measurement for this revision.
              </p>
            )}
          </div>
          <p className="mt-3 text-[12.5px] text-faint">
            {evidenceLabel(model.trust.evidence)} ·{" "}
            <Link href="/docs#evidence">How evidence levels are derived →</Link>
          </p>
        </Section>

        <Section id="source" title="Source and license">
          {/* Same two-column rail as "Use it" so stacked sections share one
              vertical grid line. */}
          <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] gap-11 max-lg:grid-cols-1">
            <KeyValueList
              items={[
                {
                  key: "source",
                  value: model.source.available
                    ? (model.source.url ?? "available")
                    : "not public",
                },
                ...(model.source.commit
                  ? [{ key: "commit", value: model.source.commit }]
                  : []),
                ...(model.source.treeDigest
                  ? [{ key: "tree digest", value: model.source.treeDigest }]
                  : []),
                {
                  key: "revision digest",
                  value: model.implementation.digest,
                },
              ]}
            />
            <div className="border-l border-border pl-9 max-lg:border-l-0 max-lg:pl-0">
              <KeyValueList
                items={[
                  {
                    key: "license declared",
                    value: model.license.declared ?? "unknown",
                  },
                  {
                    key: "license concluded",
                    value: model.license.concluded ?? "unknown",
                  },
                  ...(model.license.evidencePath
                    ? [{ key: "evidence", value: model.license.evidencePath }]
                    : []),
                  ...(model.provenance.authors.length > 0
                    ? [
                        {
                          key: "authors",
                          value: model.provenance.authors.join(", "),
                        },
                      ]
                    : []),
                  ...(model.provenance.importedAt
                    ? [
                        {
                          key: "imported",
                          value: formatDateUTC(model.provenance.importedAt),
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          </div>
        </Section>

        {model.sourceCode && (
          <Section id="code" title="Kernel source">
            <SourceCodeView code={model.sourceCode} />
          </Section>
        )}

        {model.sourceCode?.diff && (
          <Section id="diff" title="Changes from previous submission">
            <SourceDiffView diff={model.sourceCode.diff} />
          </Section>
        )}

        {model.limitations.length > 0 && (
          <Section id="limitations" title="Limitations">
            <ul className="space-y-1.5 text-[13px] text-muted">
              {model.limitations.map((limitation) => (
                <li key={limitation} className="font-mono text-[12.5px]">
                  {limitation}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </main>
    </>
  )
}
