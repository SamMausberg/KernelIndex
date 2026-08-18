// Operation dossier (§16.6): ISR — the server always renders the default
// workload/cohort variant from CDN cache, and the records island applies any
// deep-linked selection after loading its variant from /operations/[slug]/
// data. Selections never make this page dynamic (records pattern, §16.12).
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ContextHeader } from "@/components/context-header"
import { CopyButton } from "@/components/copy-button"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { KeyValueList } from "@/components/key-value-list"
import { Metric } from "@/components/metric"
import { Link } from "@/components/quiet-link"
import { Section } from "@/components/section"
import { AvailabilityCell, EvidenceCell } from "@/components/trust"
import { OperationRecords } from "@/features/operations/operation-records"
import { operationVariant } from "@/features/operations/variant"
import { getOperationPage } from "@/lib/catalog"
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
  const model = await getOperationPage(slug)
  // Fail in metadata so unknown slugs return a real 404, not a soft-404.
  if (!model) notFound()
  return { title: model.operation.name }
}

export default async function OperationPage({ params }: Props) {
  const { slug } = await params
  const model = await getOperationPage(slug)
  if (!model) notFound()
  const { operation, semantics, coverage } = model

  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <div className="scan-line" />
      <ContextHeader
        title={operation.name}
        meta={
          <span>
            {coverage.verified} verified · {coverage.reproducible} reproducible
            · {coverage.reported} reported
          </span>
        }
      >
        {/* Identity as machined tags behind a disclosure (§16.7 progressive
            disclosure): the family stays visible; aliases, model provenance,
            and the semantic digest are one click away, never the lead. */}
        <details className="group mt-2.5">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 [&::-webkit-details-marker]:hidden">
            <span className="key px-2 py-[3px] text-[11.5px] text-subtle">
              {operation.family}
            </span>
            <span className="text-[11.5px] text-faint transition-colors group-open:hidden hover:text-fg">
              identity ›
            </span>
            <span className="hidden text-[11.5px] text-faint transition-colors hover:text-fg group-open:inline">
              identity ⌄
            </span>
          </summary>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {operation.aliases.map((alias) => (
              <span
                key={alias}
                className="key px-2 py-[3px] font-mono text-[11.5px] text-subtle"
              >
                <span className="mr-1.5 font-sans text-faint">alias</span>
                {alias}
              </span>
            ))}
            {operation.models.slice(0, 4).map((model_) => (
              <span
                key={model_}
                className="key px-2 py-[3px] font-mono text-[11.5px] text-subtle"
              >
                <span className="mr-1.5 font-sans text-faint">model</span>
                {model_}
              </span>
            ))}
            {operation.models.length > 4 && (
              <span className="text-[11.5px] text-faint">
                +{operation.models.length - 4} models
              </span>
            )}
            <span className="key px-2 py-[3px] font-mono text-[11.5px] text-subtle">
              <span className="mr-1.5 font-sans text-faint">sha256</span>
              {operation.semanticDigest.replace("sha256:", "").slice(0, 12)}…
            </span>
            <CopyButton text={operation.semanticDigest} />
          </div>
        </details>
        {operation.summary && (
          <p className="mt-3 max-w-[76ch] text-[13.5px] leading-relaxed text-muted">
            {operation.summary}
          </p>
        )}
      </ContextHeader>

      <main className="shell animate-fade-in pb-20">
        <OperationRecords
          slug={operation.slug}
          workloads={model.workloads}
          lastObservedAt={coverage.lastObservedAt}
          initial={operationVariant(model)}
        />

        <Section id="implementations" title="Implementations">
          <div className="overflow-x-auto">
            <div className="grid min-w-[940px] grid-cols-[minmax(240px,1.6fr)_150px_150px_92px_minmax(150px,1fr)] border-b border-border-strong text-[11.5px] text-faint">
              <div className="py-2">Implementation</div>
              <div className="py-2">Runtime</div>
              <div className="py-2 pr-3.5 text-right">Best latency</div>
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
                className="grid min-w-[940px] grid-cols-[minmax(240px,1.6fr)_150px_150px_92px_minmax(150px,1fr)] items-center border-b border-line transition-colors hover:bg-raised"
              >
                <div className="min-w-0 truncate py-3 pr-3">
                  <Link
                    href={`/implementations/${impl.slug}`}
                    className="text-[13px]"
                  >
                    {impl.name}
                  </Link>
                  {impl.project.name !== impl.name && (
                    <span className="ml-2 text-[12px] text-faint">
                      {impl.project.name}
                    </span>
                  )}
                </div>
                <div className="py-3 font-mono text-[12px] text-subtle">
                  {[impl.language, impl.framework]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </div>
                <div className="py-3 pr-3.5 text-right whitespace-nowrap">
                  <Metric
                    primary={impl.bestPrimary}
                    valueClassName="font-mono text-[13px] text-fg"
                  />
                </div>
                <div className="py-3">
                  <EvidenceCell row={impl} />
                </div>
                <div className="py-3">
                  <AvailabilityCell row={impl} />
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
                {model.sources.map((source, index) => (
                  <span key={source.name}>
                    {index > 0 && " · "}
                    {source.url ? (
                      <a href={source.url}>{source.name}</a>
                    ) : (
                      source.name
                    )}
                    {source.observedAt &&
                      ` (${formatDateUTC(source.observedAt)})`}
                    {source.license && ` · ${source.license}`}
                  </span>
                ))}
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
