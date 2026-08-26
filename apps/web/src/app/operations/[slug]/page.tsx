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
import { Link } from "@/components/quiet-link"
import { Section } from "@/components/section"
import { SourcesFooter } from "@/components/sources-footer"
import { FollowButton } from "@/features/follow/follow-button"
import { ImplementationsTable } from "@/features/implementations/implementations-table"
import { OperationRecords } from "@/features/operations/operation-records"
import { operationVariant } from "@/features/operations/variant"
import { getOperationPage } from "@/lib/catalog"
import { countNoun } from "@/lib/format"

type Props = { params: Promise<{ slug: string }> }

export const revalidate = 3600
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
  return {
    title: model.operation.name,
    description: model.operation.summary,
    alternates: { canonical: `/operations/${slug}` },
  }
}

export default async function OperationPage({ params }: Props) {
  const { slug } = await params
  const model = await getOperationPage(slug)
  if (!model) notFound()
  const { operation, semantics, coverage } = model

  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <ContextHeader
        title={operation.name}
        meta={
          <>
            {/* One coverage fact; the evidence split lives in the records
                island and the run dossiers (3-second rule). */}
            <span>
              {countNoun(
                coverage.verified + coverage.reproducible + coverage.reported,
                "eligible run",
              )}
            </span>
            <FollowButton
              kind="operation"
              followKey={operation.slug}
              label={operation.name}
              href={`/operations/${operation.slug}`}
              noun="operation"
            />
          </>
        }
      >
        {/* A slim header (§16 header diet): family and summary only. The
            full identity — aliases, model tags, digest, equivalents — lives
            beside Semantics, never before the answer. */}
        <div className="mt-2.5 font-mono text-mini text-subtle">
          {operation.family}
        </div>
        {operation.summary && (
          <p className="mt-3 max-w-[76ch] text-body leading-relaxed text-muted">
            {operation.summary}
          </p>
        )}
      </ContextHeader>

      <main className="shell pb-24">
        <OperationRecords
          slug={operation.slug}
          operationName={operation.name}
          workloads={model.workloads}
          lastObservedAt={coverage.lastObservedAt}
          initial={operationVariant(model)}
        />

        <Section id="implementations" title="Implementations">
          <ImplementationsTable rows={model.implementations} />
        </Section>

        <Section id="semantics" title="Semantics">
          <div className="grid grid-cols-2 gap-10 max-lg:grid-cols-1">
            <div>
              <div className="text-label text-faint uppercase">
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
              <div className="text-label text-faint uppercase">
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
            <pre className="plate mt-5 overflow-x-auto px-4 py-3 font-mono text-small leading-relaxed text-muted">
              {semantics.expression}
            </pre>
          )}
          {/* Identity (moved out of the header, §16 header diet): short, so
              it renders open per the disclosure rule. */}
          <div className="mt-6">
            <div className="text-label text-faint uppercase">Identity</div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1.5 font-mono text-mini text-subtle">
              {operation.aliases.map((alias) => (
                <span key={alias}>
                  <span className="mr-1.5 font-sans text-faint">alias</span>
                  {alias}
                </span>
              ))}
              {operation.models.slice(0, 4).map((model_) => (
                <Link
                  key={model_}
                  href={`/models/${model_}`}
                  prefetch={false}
                  className="text-mini text-subtle transition-colors hover:text-fg"
                >
                  <span className="mr-1.5 font-sans text-faint no-underline">
                    model
                  </span>
                  {model_}
                </Link>
              ))}
              {operation.models.length > 4 && (
                <span className="text-faint">
                  +{operation.models.length - 4} models
                </span>
              )}
              <span className="inline-flex items-baseline gap-1.5">
                <span className="font-sans text-faint">sha256</span>
                {operation.semanticDigest.replace("sha256:", "").slice(0, 12)}…
                <CopyButton text={operation.semanticDigest} />
              </span>
            </div>
            {operation.equivalents.length > 0 && (
              <p className="mt-2 text-small text-subtle">
                Also indexed as{" "}
                {operation.equivalents.map((equivalent, index) => (
                  <span key={equivalent.slug}>
                    {index > 0 && ", "}
                    <Link
                      href={`/operations/${equivalent.slug}`}
                      className="font-mono text-small"
                    >
                      {equivalent.slug}
                    </Link>
                  </span>
                ))}{" "}
                · reviewed as the same computation; every definition's cohorts
                are shown here, ranked separately.
              </p>
            )}
          </div>
        </Section>

        <SourcesFooter
          sources={model.sources}
          lastObservedAt={coverage.lastObservedAt}
          emptyText="No source imports for this operation yet."
          docs={{ href: "/docs#records", label: "How records are decided" }}
          api={`/operations/${operation.slug}`}
        />
      </main>
    </>
  )
}
