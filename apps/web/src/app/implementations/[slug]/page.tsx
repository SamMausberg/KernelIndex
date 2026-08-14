import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ContextHeader } from "@/components/context-header"
import { CopyButton } from "@/components/copy-button"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { KeyValueList } from "@/components/key-value-list"
import { Section } from "@/components/section"
import { SiteHeader } from "@/components/site-header"
import { ResultRowItem, ResultTableHead } from "@/features/search/result-row"
import { getImplementationPage } from "@/lib/catalog"
import { evidenceLabel, formatDateUTC } from "@/lib/format"

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const model = await getImplementationPage(slug)
  return { title: model ? model.implementation.name : "Implementation" }
}

export default async function ImplementationPage({ params }: Props) {
  const { slug } = await params
  const model = await getImplementationPage(slug)
  if (!model) notFound()
  const best = model.bestResults[0]?.primary ?? null
  const support = [
    ...model.support.hardware,
    ...model.support.architectures,
  ].join(" / ")

  return (
    <>
      <SiteHeader />
      {model.illustrative && <IllustrativeNotice />}
      <div className="h-px origin-left animate-scan bg-accent" />
      <ContextHeader
        title={
          <span className="font-mono text-[19px]">
            {model.implementation.name}
          </span>
        }
        context={
          <>
            {model.project.repositoryUrl ? (
              <a href={model.project.repositoryUrl}>{model.project.name}</a>
            ) : (
              model.project.name
            )}
            {" · "}
            {[
              model.interface.language,
              model.license.concluded ??
                model.license.declared ??
                "License unknown",
              support || null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </>
        }
        meta={<span>{model.trust.summary}</span>}
      />

      <main className="shell animate-fade-in pb-20">
        <Section id="use" title="Use it">
          <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] gap-11 max-lg:grid-cols-1">
            <div>
              {model.usage.install ? (
                <div className="flex max-w-[560px] items-center gap-2.5 rounded-[3px] border border-border bg-surface py-2 pr-2 pl-3">
                  <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-muted">
                    {model.usage.install.command}
                  </code>
                  <CopyButton text={model.usage.install.command} />
                </div>
              ) : (
                <p className="text-[13px] text-warning">
                  No verified install recipe for this revision.
                </p>
              )}
              {model.usage.invocationExample && (
                <pre className="mt-4 max-w-[560px] overflow-x-auto rounded-[3px] border border-border bg-surface px-4 py-3 font-mono text-[12.5px] leading-relaxed text-muted">
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
          <div className="overflow-x-auto">
            {model.bestResults.length > 0 ? (
              <>
                <ResultTableHead />
                {model.bestResults.map((row) => (
                  <ResultRowItem
                    key={row.runId ?? row.workloadSummary}
                    row={row}
                    best={best}
                  />
                ))}
              </>
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
          <div className="grid grid-cols-2 gap-10 max-lg:grid-cols-1">
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
        </Section>

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
