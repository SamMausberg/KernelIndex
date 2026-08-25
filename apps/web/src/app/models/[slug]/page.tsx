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
import { FollowButton } from "@/features/follow/follow-button"
import { BestKnownTable, GapTable } from "@/features/models/best-known"
import { getModelPage } from "@/lib/catalog"
import { countNoun } from "@/lib/format"
import { servingEnabled } from "@/server/env"
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
    // One canonical per model: GPU selections are views of this page.
    alternates: { canonical: `/models/${slug}` },
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
        <main className="shell pt-7 pb-24">
          <p className="max-w-[76ch] text-body text-muted">
            No operation is tagged{" "}
            <span className="font-mono">model:{slug}</span> yet. Tags are exact;
            a close variant may be indexed under its own tag.
          </p>
          <div className="mt-4 space-y-2">
            {model.model.relatedTags.length > 0 && (
              <RelatedTags tags={model.model.relatedTags} />
            )}
            {servingEnabled && model.serving && (
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
        context="best known per operation on the selected GPU"
        meta={
          <>
            <span>
              {countNoun(model.stats.operations, "operation")} ·{" "}
              {model.stats.families}{" "}
              {model.stats.families === 1 ? "family" : "families"} ·{" "}
              {model.stats.runs.toLocaleString("en-US")} eligible runs
            </span>
            <FollowButton
              kind="model"
              followKey={slug}
              label={slug}
              href={`/models/${slug}`}
              noun="model"
            />
          </>
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

      <main className="shell pb-24">
        {Boolean(gpu) &&
          model.selectedGpu !== null &&
          gpu !== model.selectedGpu && (
            <p className="pt-4 text-small text-faint">
              No eligible runs on {gpu}; showing {model.selectedGpu}, the
              most-measured GPU for this model.
            </p>
          )}

        {/* The page's verdict in one sentence (§16 page grammar), before
            any table: how much of this model is answered on this GPU. */}
        {model.selectedGpu !== null && (
          <p className="border-b border-border py-5 text-lead">
            <span className="text-fg">
              {entries.filter((entry) => entry.deployable !== null).length} of{" "}
              {model.stats.operations} operations
            </span>{" "}
            <span className="text-muted">
              have a usable best known on {model.selectedGpu}
            </span>
            {model.gaps.length + undeployable.length > 0 && (
              <span className="text-subtle">
                {" "}
                · {model.gaps.length + undeployable.length} without one
              </span>
            )}
          </p>
        )}

        {model.groups.length > 0 && model.selectedGpu !== null && (
          <Section id="best" title={`Best known on ${model.selectedGpu}`}>
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
            {/* One action per section (§16 link diet); contributing is
                reachable from the challenges board itself. */}
            <p className="mt-3 text-small text-faint">
              No eligible evidence yet for these operations.{" "}
              <Link href="/challenges">Challenges →</Link>
            </p>
          </Section>
        )}

        {servingEnabled && model.serving && (
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

        <SourcesFooter
          sources={model.sources}
          docs={{ href: "/docs#comparability", label: "How comparison works" }}
          api={`/models/${slug}${
            model.selectedGpu
              ? `?gpu=${encodeURIComponent(model.selectedGpu)}`
              : ""
          }`}
        />
      </main>
    </>
  )
}
