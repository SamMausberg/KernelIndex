// Serving run dossier (§16.13): what was measured, under which cohort
// identity, by which harness — with the MLPerf attribution line and the
// canonical manifest one disclosure away. Mirrors /runs/[id].
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { EvidenceOpened } from "@/components/beacon"
import { ContextHeader } from "@/components/context-header"
import { CopyButton } from "@/components/copy-button"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { KeyValueList } from "@/components/key-value-list"
import { Section } from "@/components/section"
import { ReportForm } from "@/features/reports/report-form"
import { getServingRunPage } from "@/lib/catalog"
import { servingEnabled } from "@/server/env"

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
  const model = await getServingRunPage(id)
  // Fail in metadata so unknown IDs return a real 404, not a soft-404.
  if (!model) notFound()
  return {
    title: `Serving run ${model.run.id.slice(0, 8)}`,
    description: `LLM serving benchmark evidence: ${model.model.name} on ${model.stack.name} — configuration, workload, protocol, and metrics as published.`,
  }
}

export default async function ServingRunPage({ params }: Props) {
  if (!servingEnabled) notFound()
  const { id } = await params
  const model = await getServingRunPage(id)
  if (!model) notFound()

  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <EvidenceOpened kind="serving_run" />
      <ContextHeader
        title={
          <span className="text-title">{model.configuration.summary}</span>
        }
        context={
          <>
            {model.model.name}
            {" · "}
            {model.workload.name}
            {" · "}
            <span className="text-faint">run {model.run.id.slice(0, 13)}…</span>
          </>
        }
        meta={<span>{model.run.status} · Reported evidence</span>}
      />

      {model.lifecycle.retracted && (
        <div className="border-b border-border bg-surface">
          <div className="shell py-2.5">
            <p className="text-small text-warning">
              Retracted {model.lifecycle.retracted.at.slice(0, 10)}:{" "}
              {model.lifecycle.retracted.reason}
            </p>
          </div>
        </div>
      )}

      <main className="shell animate-fade-in pb-24">
        <section className="grid grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] gap-10 border-b border-border py-6 max-lg:grid-cols-1">
          <div>
            <div className="font-mono text-label text-faint uppercase">
              Measurements
            </div>
            <div className="mt-3 max-w-[560px]">
              <KeyValueList
                items={model.measurements.map((m) => ({
                  key: `${m.metric} · ${m.statistic}`,
                  value: `${m.value.toLocaleString("en-US")} ${m.unit}`,
                }))}
              />
            </div>
            <p className="mt-3 max-w-[76ch] text-body text-muted">
              {model.cohort.description} · observed{" "}
              {model.run.observedAt.slice(0, 10)}
            </p>
            {model.caveats.length > 0 && (
              <p className="mt-2 text-small text-subtle">
                {model.caveats.join(". ")}.
              </p>
            )}
          </div>
          <div className="border-l border-border pl-9 max-lg:border-l-0 max-lg:pl-0">
            <div className="mb-2.5 text-small text-subtle">Identity</div>
            <KeyValueList
              items={[
                { key: "model", value: model.model.name },
                { key: "stack", value: model.stack.name },
                { key: "workload", value: model.workload.name },
                {
                  key: "topology",
                  value: `${model.topology.perNode}× ${model.topology.acceleratorModel}${
                    model.topology.nodes > 1
                      ? ` × ${model.topology.nodes} nodes`
                      : ""
                  }`,
                },
                { key: "harness", value: model.harness },
                { key: "quality policy", value: model.cohort.qualityPolicy },
                {
                  key: "comparison key",
                  value: `${model.cohort.key.slice(0, 23)}…`,
                },
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
          <Section id="configuration" title="Launch configuration">
            <KeyValueList
              items={[
                ...(model.configuration.dtype
                  ? [{ key: "dtype", value: model.configuration.dtype }]
                  : []),
                ...(model.configuration.quantization
                  ? [
                      {
                        key: "quantization",
                        value: model.configuration.quantization,
                      },
                    ]
                  : []),
                ...model.configuration.facts,
              ]}
            />
          </Section>
          <Section id="workload" title="Workload">
            <KeyValueList
              items={[
                { key: "name", value: model.workload.name },
                {
                  key: "streaming",
                  value: model.workload.streaming ? "yes" : "no",
                },
                {
                  key: "load generation",
                  value: model.workload.loadGeneration,
                },
              ]}
            />
          </Section>
        </div>

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
            Cite this result (permalink, digest, access date)
          </span>
          <CopyButton
            text={[
              `${model.configuration.summary} — ${model.model.name}, ${model.workload.name}.`,
              ...(model.measurements[0]
                ? [
                    `${model.measurements[0].value.toLocaleString("en-US")} ${model.measurements[0].unit} (${model.measurements[0].metric}, ${model.measurements[0].statistic}).`,
                  ]
                : []),
              `${model.attribution.line}.`,
              `KernelIndex serving run ${model.run.id}, ${model.run.digest}.`,
              `https://kernelindex.com/serving-runs/${model.run.id}.`,
              `Accessed ${new Date().toISOString().slice(0, 10)}.`,
            ].join(" ")}
            event="citation_copied"
          />
        </div>
        <div className="mt-4">
          <ReportForm targetKind="serving_run" targetId={model.run.id} />
        </div>

        <div className="mt-12 flex flex-wrap items-baseline justify-between gap-5 border-t border-border pt-5 text-small">
          <span className="text-subtle">
            {model.attribution.url ? (
              <a href={model.attribution.url}>{model.attribution.line}</a>
            ) : (
              model.attribution.line
            )}
            {" · shown unmodified as published"}
          </span>
          <Link href="/serving">All serving results →</Link>
        </div>
      </main>
    </>
  )
}
