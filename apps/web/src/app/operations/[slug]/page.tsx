import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ContextHeader } from "@/components/context-header"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { KeyValueList } from "@/components/key-value-list"
import { Section } from "@/components/section"
import { ResultRowItem, ResultTableHead } from "@/features/search/result-row"
import { getOperationPage } from "@/lib/catalog"
import { evidenceLabel, formatDateUTC, formatPrimary } from "@/lib/format"

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ workload?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const model = await getOperationPage(slug)
  return { title: model ? model.operation.name : "Operation" }
}

export default async function OperationPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { workload } = await searchParams
  const model = await getOperationPage(slug, { workload })
  if (!model) notFound()
  const { operation, semantics, coverage } = model
  const best = model.records[0]?.primary ?? null

  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <div className="scan-line" />
      <ContextHeader
        title={operation.name}
        context={
          <>
            {operation.family}
            {operation.aliases.length > 0 && (
              <> · aliases {operation.aliases.join(", ")}</>
            )}
            {" · "}
            <span className="text-faint">
              {operation.semanticDigest.slice(0, 23)}…
            </span>
          </>
        }
        meta={
          <span>
            {coverage.verified} verified · {coverage.reproducible} reproducible
            · {coverage.reported} reported
          </span>
        }
      >
        {operation.summary && (
          <p className="mt-1.5 max-w-[72ch] text-[13px] text-subtle">
            {operation.summary}
          </p>
        )}
      </ContextHeader>

      <main className="shell animate-fade-in pb-20">
        <Section id="records" title="Current records">
          {model.workloads.length > 1 && (
            <div className="mb-3 flex flex-wrap items-baseline gap-x-5 gap-y-1.5 text-[12.5px]">
              <span className="text-faint">Workload</span>
              {model.workloads.map((option) => (
                <Link
                  key={option.id}
                  href={`/operations/${operation.slug}?workload=${option.id}`}
                  className={`font-mono text-[12px] transition-colors hover:text-fg hover:no-underline ${
                    option.id === model.selectedWorkloadId
                      ? "text-accent"
                      : "text-subtle"
                  }`}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          )}
          {model.cohort && (
            <p className="mb-1 font-mono text-[12px] text-faint">
              {model.cohort.facts.map((fact) => fact.value).join(" · ")}
            </p>
          )}
          <div className="overflow-x-auto">
            {model.records.length > 0 ? (
              <>
                <ResultTableHead />
                {model.records.map((row) => (
                  <ResultRowItem
                    key={row.runId ?? row.implementation.slug}
                    row={row}
                    best={best}
                  />
                ))}
              </>
            ) : (
              <p className="py-6 text-[13px] text-faint">
                No published measurement for the selected workload.
              </p>
            )}
          </div>
        </Section>

        <Section id="implementations" title="Implementations">
          <div className="overflow-x-auto">
            <div className="grid min-w-[900px] grid-cols-[minmax(240px,1.6fr)_150px_150px_140px_minmax(150px,1fr)] border-b border-border-strong text-[11.5px] text-faint">
              <div className="py-2">Implementation</div>
              <div className="py-2">Runtime</div>
              <div className="py-2 pr-3.5 text-right">Best median</div>
              <div className="py-2">Evidence</div>
              <div className="py-2">Availability</div>
            </div>
            {/* Slugs can repeat when an implementation appears once per
                revision or evidence source; the list is server-rendered and
                never reordered, so the index is a safe disambiguator. */}
            {model.implementations.map((impl, index) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: static read-only rows
                key={`${impl.slug}-${index}`}
                className="grid min-w-[900px] grid-cols-[minmax(240px,1.6fr)_150px_150px_140px_minmax(150px,1fr)] items-center border-b border-line transition-colors hover:bg-raised"
              >
                <div className="min-w-0 truncate py-3 pr-3">
                  <Link
                    href={`/implementations/${impl.slug}`}
                    className="font-mono text-[13px]"
                  >
                    {impl.name}
                  </Link>
                  <span className="ml-2 text-[12px] text-faint">
                    {impl.project.name}
                  </span>
                </div>
                <div className="py-3 font-mono text-[12px] text-subtle">
                  {[impl.language, impl.framework]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </div>
                <div className="py-3 pr-3.5 text-right font-mono text-[13px]">
                  {impl.bestPrimary ? formatPrimary(impl.bestPrimary) : "—"}
                </div>
                <div className="py-3 text-[12.5px] text-subtle">
                  {evidenceLabel(impl.evidence)}
                </div>
                <div className="truncate py-3 text-[12.5px] text-subtle">
                  {impl.license.concluded ??
                    impl.license.declared ??
                    "License unknown"}
                  {" · "}
                  {impl.installable
                    ? "installable"
                    : impl.sourceAvailable
                      ? "source only"
                      : "no source"}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section id="semantics" title="Semantics">
          <div className="grid grid-cols-2 gap-10 max-lg:grid-cols-1">
            <div>
              <div className="text-[11.5px] tracking-[0.03em] text-faint uppercase">
                Inputs and outputs
              </div>
              <div className="mt-2">
                <KeyValueList
                  items={[...semantics.inputs, ...semantics.outputs].map(
                    (binding) => ({
                      key: binding.name,
                      value: `${binding.dtype} ${binding.shape}${
                        binding.layout ? ` · ${binding.layout}` : ""
                      }`,
                    }),
                  )}
                />
              </div>
            </div>
            <div>
              <div className="text-[11.5px] tracking-[0.03em] text-faint uppercase">
                Axes and behavior
              </div>
              <div className="mt-2">
                <KeyValueList
                  items={[
                    ...semantics.axes.map((axis) => ({
                      key: axis.name,
                      value:
                        axis.value !== null
                          ? `${axis.role} = ${axis.value}`
                          : (axis.constraint ?? axis.role),
                    })),
                    { key: "determinism", value: semantics.determinism },
                    ...semantics.constraints.map((constraint, index) => ({
                      key: index === 0 ? "constraints" : " ",
                      value: constraint,
                    })),
                  ]}
                />
              </div>
            </div>
          </div>
          {semantics.expression && (
            <pre className="plate mt-5 overflow-x-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed text-muted">
              {semantics.expression}
            </pre>
          )}
        </Section>

        <div className="mt-12 flex flex-wrap items-baseline justify-between gap-5 border-t border-border pt-5 text-[12.5px]">
          <span className="text-subtle">
            {model.sources.length > 0 ? (
              <>
                Sources:{" "}
                {model.sources
                  .map(
                    (source) =>
                      `${source.name}${source.observedAt ? ` (${formatDateUTC(source.observedAt)})` : ""}`,
                  )
                  .join(" · ")}
              </>
            ) : (
              "No source imports for this operation yet."
            )}
          </span>
          {coverage.lastObservedAt && (
            <span className="font-mono text-[12px] text-faint">
              last observed {formatDateUTC(coverage.lastObservedAt)}
            </span>
          )}
        </div>
      </main>
    </>
  )
}
