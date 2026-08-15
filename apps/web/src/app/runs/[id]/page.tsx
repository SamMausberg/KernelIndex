import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ContextHeader } from "@/components/context-header"
import { CopyButton } from "@/components/copy-button"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { KeyValueList } from "@/components/key-value-list"
import { Section } from "@/components/section"
import { getRunPage } from "@/lib/catalog"
import {
  evidenceLabel,
  formatDateUTC,
  formatPrimaryParts,
  formatSpread,
} from "@/lib/format"

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const model = await getRunPage(id)
  return {
    title: model ? `Run ${model.run.id.slice(0, 8)}` : "Benchmark run",
  }
}

export default async function RunPage({ params }: Props) {
  const { id } = await params
  const model = await getRunPage(id)
  if (!model) notFound()
  const passed = model.run.status === "passed"
  const lifecycleNotes = [
    model.lifecycle.retracted &&
      `Retracted ${formatDateUTC(model.lifecycle.retracted.at)}: ${model.lifecycle.retracted.reason}`,
    model.lifecycle.disputed && `Disputed: ${model.lifecycle.disputed.reason}`,
    model.lifecycle.supersededById &&
      "Superseded by a corrected run; preserved for the audit trail.",
    model.lifecycle.stale && "Not retested recently.",
  ].filter((note): note is string => Boolean(note))

  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <div className="scan-line" />
      <ContextHeader
        title={
          <span className="font-mono text-[19px]">
            {model.implementation.name}
          </span>
        }
        context={
          <>
            <Link href={`/operations/${model.operation.slug}`}>
              {model.operation.name}
            </Link>
            {" · "}
            {model.workload.label}
            {" · "}
            <span className="text-faint">run {model.run.id.slice(0, 13)}…</span>
          </>
        }
        meta={
          <>
            <span className={passed ? "text-fg" : "text-warning"}>
              {passed && (
                <span className="mr-1.5 text-[9px] text-success">●</span>
              )}
              {model.run.status.replaceAll("_", " ")}
            </span>
            <span>{evidenceLabel(model.evidence)}</span>
          </>
        }
      />

      {lifecycleNotes.length > 0 && (
        <div className="border-b border-border bg-surface">
          <div className="shell py-2.5">
            {lifecycleNotes.map((note) => (
              <p key={note} className="text-[12.5px] text-warning">
                {note}
              </p>
            ))}
          </div>
        </div>
      )}

      <main className="shell animate-fade-in pb-20">
        <section className="grid grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] gap-11 border-b border-border py-6 max-lg:grid-cols-1">
          <div>
            <div className="font-mono text-[10px] tracking-[0.08em] text-faint uppercase">
              Primary measurement
            </div>
            <div className="mt-3 flex flex-wrap items-baseline gap-4">
              <span className="font-mono text-[34px] leading-none font-medium">
                {formatPrimaryParts(model.primary).value}
                <span className="ml-1.5 text-[19px] font-normal text-subtle">
                  {formatPrimaryParts(model.primary).unit}
                </span>
              </span>
              <span className="font-mono text-[13px] text-subtle">
                {[
                  formatSpread(model.primary),
                  `${model.primary.statistic}${
                    model.primary.sampleCount
                      ? ` of ${model.primary.sampleCount}`
                      : ""
                  }`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <p className="mt-3 text-[13.5px] text-muted">
              {model.cohort.eligible ? (
                <>
                  {model.cohort.rank !== null &&
                    `Rank ${model.cohort.rank} in its comparison cohort · `}
                  {model.cohort.profile === "source_native"
                    ? "source-native cohort"
                    : "strict exact cohort"}
                  {" · observed "}
                  {formatDateUTC(model.run.observedAt)}
                </>
              ) : (
                <>
                  Not eligible to rank:{" "}
                  {model.cohort.ineligibleReasons.join(", ") || "unspecified"}
                </>
              )}
            </p>
            <div className="mt-4 flex items-center gap-2.5">
              <span className="font-mono text-[12px] text-faint">
                {model.run.digest.slice(0, 30)}…
              </span>
              <CopyButton text={model.run.digest} />
            </div>
          </div>
          <div className="border-l border-border pl-9 max-lg:border-l-0 max-lg:pl-0">
            <div className="mb-2.5 text-[12.5px] text-subtle">Identity</div>
            <KeyValueList
              items={[
                { key: "implementation", value: model.implementation.name },
                { key: "project", value: model.project.name },
                {
                  key: "revision",
                  value: model.implementation.revision ?? "unknown",
                },
                { key: "workload", value: model.workload.label },
                {
                  key: "cohort",
                  value: `${model.cohort.comparisonKey.slice(0, 23)}…`,
                },
                {
                  key: "source",
                  value: model.provenance.source.name,
                },
                ...(model.provenance.externalId
                  ? [{ key: "external id", value: model.provenance.externalId }]
                  : []),
              ]}
            />
          </div>
        </section>

        <div className="grid grid-cols-2 gap-x-11 max-lg:grid-cols-1">
          <Section id="correctness" title="Correctness">
            {model.correctness ? (
              <KeyValueList
                items={[
                  { key: "comparator", value: model.correctness.comparator },
                  ...(model.correctness.maxAbsoluteError !== null
                    ? [
                        {
                          key: "max absolute error",
                          value: String(model.correctness.maxAbsoluteError),
                        },
                      ]
                    : []),
                  ...(model.correctness.maxRelativeError !== null
                    ? [
                        {
                          key: "max relative error",
                          value: String(model.correctness.maxRelativeError),
                        },
                      ]
                    : []),
                  ...(model.correctness.matchedRatio !== null
                    ? [
                        {
                          key: "matched ratio",
                          value: String(model.correctness.matchedRatio),
                        },
                      ]
                    : []),
                  {
                    key: "result",
                    value: model.correctness.passed ? "passed" : "failed",
                  },
                ]}
              />
            ) : (
              <p className="text-[13px] text-faint">
                No correctness policy recorded for this run.
              </p>
            )}
          </Section>

          <Section id="workload" title="Workload">
            <KeyValueList
              items={[
                ...Object.entries(model.workload.axes).map(([key, value]) => ({
                  key,
                  value: String(value),
                })),
                ...model.workload.tensors,
                ...model.workload.tolerance,
              ]}
            />
          </Section>

          <Section id="measurements" title="Measurements">
            {model.measurements.length > 0 ? (
              <KeyValueList
                items={model.measurements.map((measurement) => ({
                  key: `${measurement.metric} · ${measurement.statistic}`,
                  value: `${measurement.value} ${measurement.unit}${
                    measurement.sampleCount
                      ? ` · n=${measurement.sampleCount}`
                      : ""
                  }`,
                }))}
              />
            ) : (
              <p className="text-[13px] text-faint">
                Only the primary measurement was published.
              </p>
            )}
          </Section>

          <Section id="protocol" title="Protocol">
            <KeyValueList items={model.protocol} />
          </Section>

          <Section id="environment" title="Environment">
            <KeyValueList items={model.environment} />
          </Section>

          <Section id="artifacts" title="Artifacts">
            {model.artifacts.length > 0 ? (
              <KeyValueList
                items={model.artifacts.map((artifact) => ({
                  key: artifact.role,
                  value: `${artifact.digest.slice(0, 23)}… · ${artifact.mediaType} · ${artifact.availability}`,
                }))}
              />
            ) : (
              <p className="text-[13px] text-faint">
                No artifacts published with this run.
              </p>
            )}
          </Section>
        </div>

        <Section id="manifest" title="Canonical manifest">
          <details className="group">
            <summary className="cursor-pointer list-none text-[12.5px] text-accent [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Show manifest</span>
              <span className="hidden group-open:inline">Hide manifest</span>
            </summary>
            <pre className="plate mt-3 max-h-[480px] overflow-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed text-muted">
              {JSON.stringify(model.manifest, null, 2)}
            </pre>
          </details>
        </Section>

        <div className="mt-12 flex flex-wrap items-baseline justify-between gap-5 border-t border-border pt-5 text-[12.5px]">
          <span className="text-subtle">
            Published {formatDateUTC(model.run.publishedAt)} ·{" "}
            {model.provenance.source.name}
          </span>
          <Link href={`/operations/${model.operation.slug}`}>
            All results for {model.operation.name} →
          </Link>
        </div>
      </main>
    </>
  )
}
