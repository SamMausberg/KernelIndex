// Model dossier (§16.21): pick a model and a GPU and read the best known
// deployable implementation per operation, the stated coverage gaps,
// evidence quality, and source links. Every "best" is scoped to one
// comparison cohort on the selected GPU (§11.1); kernel and serving
// evidence never merge (§8.16). Dynamic: the GPU selection is the URL.
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { after } from "next/server"
import { FilterChip } from "@/components/chip"
import { ContextHeader } from "@/components/context-header"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { Link } from "@/components/quiet-link"
import { Section } from "@/components/section"
import { SourcesFooter } from "@/components/sources-footer"
import { BestKnownTable, GapTable } from "@/features/models/best-known"
import { getModelPage } from "@/lib/catalog"
import { recordEvent } from "@/server/events"

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ gpu?: string }>
}

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { slug } = await params
  const { gpu } = await searchParams
  const model = await getModelPage(slug, gpu)
  // Fail in metadata so unknown slugs return a real 404, not a soft-404.
  if (!model) notFound()
  return {
    title: slug,
    description: `Best known GPU kernel implementations for ${slug}: per-operation records with evidence quality, deployability, coverage gaps, and source links.`,
  }
}

function RelatedTags({ tags }: { tags: string[] }) {
  return (
    <p className="text-small text-faint">
      Related tags:{" "}
      {tags.map((tag, index) => (
        <span key={tag}>
          {index > 0 && " · "}
          <Link href={`/models/${tag}`} className="font-mono text-small">
            {tag}
          </Link>
        </span>
      ))}
    </p>
  )
}

export default async function ModelPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { gpu } = await searchParams
  const model = await getModelPage(slug, gpu)
  if (!model) notFound()
  const entries = model.groups.flatMap((group) => group.entries)
  const undeployable = entries.filter((entry) => entry.deployable === null)
  // §20.5: coarse resolution counters only, no query text.
  after(() =>
    recordEvent("model_resolved", {
      resolved: model.resolved,
      hasGaps: model.gaps.length + undeployable.length > 0,
      deployableReturned: entries.some((entry) => entry.deployable !== null),
    }),
  )

  if (!model.resolved) {
    return (
      <>
        {model.illustrative && <IllustrativeNotice />}
        <ContextHeader
          title={<span className="font-mono">{slug}</span>}
          context="no operation carries this model tag"
        />
        <main className="shell animate-fade-in pt-7 pb-24">
          <p className="max-w-[76ch] text-body text-muted">
            No indexed operation declares workload provenance for{" "}
            <span className="font-mono">model:{slug}</span>. Model tags are
            exact; a close variant may be indexed under its own tag.
          </p>
          <div className="mt-4 space-y-2">
            {model.model.relatedTags.length > 0 && (
              <RelatedTags tags={model.model.relatedTags} />
            )}
            {model.serving && (
              <p className="text-small text-subtle">
                Serving evidence exists for this model ·{" "}
                {model.serving.runs.toLocaleString("en-US")} runs.{" "}
                <Link
                  href={`/serving?model=${encodeURIComponent(model.serving.slug)}`}
                >
                  Open the serving resolver →
                </Link>
              </p>
            )}
            <p className="text-small text-subtle">
              <Link href="/models">All models →</Link>
            </p>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <ContextHeader
        title={<span className="font-mono">{slug}</span>}
        context="best known per operation on the selected GPU · workload provenance declared by sources"
        meta={
          <span>
            {model.stats.operations.toLocaleString("en-US")} operations ·{" "}
            {model.stats.families.toLocaleString("en-US")} families ·{" "}
            {model.stats.runs.toLocaleString("en-US")} eligible runs
          </span>
        }
      >
        {model.gpus.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-label text-faint uppercase">
              GPU
            </span>
            {model.gpus.map((entry) => (
              <FilterChip
                key={entry.model}
                href={`/models/${slug}?gpu=${encodeURIComponent(entry.model)}`}
                on={entry.model === model.selectedGpu}
                label={entry.model}
                count={entry.runs}
              />
            ))}
          </div>
        )}
      </ContextHeader>

      <main className="shell animate-fade-in pb-24">
        {gpu !== undefined &&
          model.selectedGpu !== null &&
          gpu !== model.selectedGpu && (
            <p className="pt-4 text-small text-faint">
              No eligible runs on {gpu}; showing {model.selectedGpu}, the
              most-measured GPU for this model.
            </p>
          )}

        {model.groups.length > 0 && model.selectedGpu !== null && (
          <Section id="best" title={`Best known on ${model.selectedGpu}`}>
            <p className="mb-4 max-w-[76ch] text-small text-faint">
              Each row resolves inside one comparison cohort: same workload,
              protocol, and environment throughout. Numbers from different
              cohorts are never merged. Open a row for the cohort, the
              fastest-versus-deployable gap, and the adoption path.
            </p>
            <BestKnownTable groups={model.groups} />
          </Section>
        )}

        {(model.gaps.length > 0 || undeployable.length > 0) && (
          <Section
            id="gaps"
            title={
              model.selectedGpu
                ? `Coverage gaps on ${model.selectedGpu}`
                : "Coverage gaps"
            }
          >
            <GapTable
              gaps={model.gaps}
              undeployable={undeployable}
              selectedGpu={model.selectedGpu ?? ""}
            />
            <p className="mt-3 text-small text-faint">
              A gap is a stated absence of eligible evidence, not a claim about
              performance. <Link href="/submit">Contribute evidence →</Link>
            </p>
          </Section>
        )}

        {model.serving && (
          <Section id="serving" title="Serving">
            <p className="max-w-[76ch] text-body text-muted">
              End-to-end serving evidence exists for this model ·{" "}
              {model.serving.runs.toLocaleString("en-US")} runs, a separate
              corpus with its own resolver.{" "}
              <Link
                href={`/serving?model=${encodeURIComponent(model.serving.slug)}`}
              >
                Open the serving resolver →
              </Link>
            </p>
          </Section>
        )}

        {model.model.relatedTags.length > 0 && (
          <div className="mt-10">
            <RelatedTags tags={model.model.relatedTags} />
          </div>
        )}

        <SourcesFooter sources={model.sources} />
      </main>
    </>
  )
}
