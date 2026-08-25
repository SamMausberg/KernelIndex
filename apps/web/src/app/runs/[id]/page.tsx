import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ApiLink } from "@/components/api-link"
import { EvidenceOpened } from "@/components/beacon"
import { ContextHeader } from "@/components/context-header"
import { CopyButton } from "@/components/copy-button"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { KeyValueList } from "@/components/key-value-list"
import { Section } from "@/components/section"
import { AttestForm } from "@/features/attestations/attest-form"
import { AttestationList } from "@/features/attestations/attestations"
import { ReportForm } from "@/features/reports/report-form"
import { getRunPage } from "@/lib/catalog"
import {
  evidenceLabel,
  formatDateUTC,
  formatPrimary,
  formatPrimaryParts,
  formatSourceNativeMetrics,
  formatSpread,
} from "@/lib/format"

// Run dossiers are immutable once published; ISR on first hit.
export const revalidate = 300
// Without generateStaticParams a dynamic-param route never registers for
// ISR (Next 16 renders it per request, `revalidate` or not); an empty list
// keeps the build DB-free while unknown ids render once and cache.
export function generateStaticParams(): { id: string }[] {
  return []
}

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const model = await getRunPage(id)
  // Fail in metadata so unknown IDs return a real 404, not a soft-404.
  if (!model) notFound()
  return {
    title: `Run ${model.run.id.slice(0, 8)}`,
    description: `Immutable benchmark evidence: ${model.implementation.name} on ${model.operation.name} (${model.workload.label}): protocol, environment, correctness, and source snapshot.`,
    alternates: { canonical: `/runs/${model.run.id}` },
  }
}

export default async function RunPage({ params }: Props) {
  const { id } = await params
  const model = await getRunPage(id)
  if (!model) notFound()
  const passed = model.run.status === "passed"
  // The exact cohort this run ranks in, as the operation island's URL: the
  // dossier is never a dead end toward its comparison (§16.10).
  const cohortHref = `/operations/${model.operation.slug}?workload=${model.workload.id}&cohort=${encodeURIComponent(model.cohort.comparisonKey)}`
  const head = model.cohort.headRunId
  const lifecycleNotes = [
    model.lifecycle.retracted &&
      `Retracted ${formatDateUTC(model.lifecycle.retracted.at)}: ${model.lifecycle.retracted.reason}`,
    model.lifecycle.disputed && `Disputed: ${model.lifecycle.disputed.reason}`,
    model.lifecycle.supersededById &&
      "Superseded by a corrected run; preserved for the audit trail.",
    model.lifecycle.stale && "Not re-observed recently.",
  ].filter((note): note is string => Boolean(note))

  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <EvidenceOpened kind="run" />
      <ContextHeader
        title={
          model.implementation.name === model.implementation.slug ? (
            <span className="font-mono">{model.implementation.name}</span>
          ) : (
            model.implementation.name
          )
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
                <span className="mr-1.5 text-label text-success">●</span>
              )}
              {model.run.status.replaceAll("_", " ")}
            </span>
            <span>{evidenceLabel(model.evidence)} evidence</span>
          </>
        }
      />

      {lifecycleNotes.length > 0 && (
        <div className="border-b border-border bg-surface">
          <div className="shell py-2.5">
            {lifecycleNotes.map((note) => (
              <p key={note} className="text-small text-warning">
                {note}
              </p>
            ))}
          </div>
        </div>
      )}

      <main className="shell pb-24">
        <section className="grid grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] gap-10 border-b border-border py-6 max-lg:grid-cols-1">
          <div>
            <div className="font-mono text-label text-faint uppercase">
              Primary measurement
            </div>
            <div className="mt-3 flex flex-wrap items-baseline gap-4">
              <span className="font-mono text-readout font-medium">
                {formatPrimaryParts(model.primary).value}
                <span className="ml-1.5 text-title font-normal text-subtle">
                  {formatPrimaryParts(model.primary).unit}
                </span>
              </span>
              <span className="font-mono text-body text-subtle">
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
            <p className="mt-3 text-body text-muted">
              {model.cohort.eligible ? (
                <>
                  {model.cohort.rank !== null && (
                    <>
                      <Link href={cohortHref}>
                        Rank {model.cohort.rank} in its comparison group
                      </Link>
                      {" · "}
                    </>
                  )}
                  {model.cohort.profile === "source_native"
                    ? "source-native comparison"
                    : "strict exact comparison"}
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
            {head !== null && head !== model.run.id && (
              <p className="mt-2 text-small">
                <Link
                  href={`/compare?run=${head}&run=${model.run.id}`}
                  className="action"
                >
                  Compare with #1 →
                </Link>
              </p>
            )}
            {model.sourceNativeMetrics && (
              <p className="mt-3 font-mono text-small text-subtle">
                {formatSourceNativeMetrics(model.sourceNativeMetrics)}
              </p>
            )}
          </div>
          <div className="border-l border-border pl-9 max-lg:border-l-0 max-lg:pl-0">
            <div className="mb-2.5 text-small text-subtle">Identity</div>
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
                  key: "comparison key",
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
            <div className="mt-3 flex items-center gap-2.5">
              <span className="font-mono text-small text-faint">
                {model.run.digest.slice(0, 30)}…
              </span>
              <CopyButton text={model.run.digest} />
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-x-10 max-lg:grid-cols-1">
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
              <p className="text-body text-faint">
                {passed
                  ? "Marked passed by the source; the correctness policy was not published."
                  : "No correctness policy recorded for this run."}
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
                  value: `${formatPrimary({
                    metric: measurement.metric,
                    unit: measurement.unit,
                    statistic: measurement.statistic,
                    value: measurement.value,
                    sampleCount: measurement.sampleCount,
                    uncertainty: null,
                  })}${
                    measurement.sampleCount
                      ? ` · n=${measurement.sampleCount}`
                      : ""
                  }`,
                }))}
              />
            ) : (
              <p className="text-body text-faint">
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
              <p className="text-body text-faint">
                No artifacts published with this run.
              </p>
            )}
          </Section>
        </div>

        {/* §16.10 Replications: community knowledge accumulates beside the
            evidence and never changes its level (§8.14). */}
        <Section id="replications" title="Replications and notes">
          <AttestationList rows={model.attestations} />
          <p className="mt-2.5 text-small text-faint">
            Community attestations. They never change the evidence level; only a
            KernelIndex-controlled rerun does.
          </p>
          <div className="mt-3">
            <AttestForm runId={model.run.id} />
          </div>
        </Section>

        <Section id="manifest" title="Canonical manifest">
          <details className="group">
            <summary className="cursor-pointer list-none text-small text-accent [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Show manifest</span>
              <span className="hidden group-open:inline">Hide manifest</span>
            </summary>
            <pre className="plate mt-3 max-h-[480px] overflow-auto px-4 py-3 font-mono text-mini leading-relaxed text-muted">
              {JSON.stringify(model.manifest, null, 2)}
            </pre>
          </details>
        </Section>

        <div className="mt-10 flex items-center gap-2.5">
          <span className="text-small text-faint">
            Cite this record (permalink, digest, access date)
          </span>
          <CopyButton
            text={[
              `${model.implementation.name} · ${model.operation.name}, ${model.workload.label}.`,
              `${formatPrimary(model.primary)} (${model.primary.statistic}).`,
              `Reported by ${model.provenance.source.name}.`,
              `KernelIndex run ${model.run.id}, ${model.run.digest}.`,
              `https://kernelindex.com/runs/${model.run.id}.`,
              `Accessed ${new Date().toISOString().slice(0, 10)}.`,
            ].join(" ")}
            event="citation_copied"
          />
        </div>
        <div className="mt-4">
          <ReportForm targetKind="run" targetId={model.run.id} />
        </div>

        <div className="mt-12 flex flex-wrap items-baseline justify-between gap-5 border-t border-border pt-5 text-small">
          <span className="text-subtle">
            Published {formatDateUTC(model.run.publishedAt)} ·{" "}
            {model.provenance.source.url ? (
              <a href={model.provenance.source.url}>
                {model.provenance.source.name}
              </a>
            ) : (
              model.provenance.source.name
            )}
            {model.provenance.source.license &&
              ` · ${model.provenance.source.license}`}
          </span>
          <span className="flex items-baseline gap-x-5">
            <Link href={cohortHref}>
              All results for {model.operation.name} →
            </Link>
            <ApiLink path={`/runs/${model.run.id}`} />
          </span>
        </div>
      </main>
    </>
  )
}
