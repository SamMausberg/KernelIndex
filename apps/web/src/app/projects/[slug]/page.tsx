// Project dossier (§16.9's sibling, §15.3): one entity page for libraries,
// competition authors, and vendors — standing as records held, every
// measured implementation, activity, provenance, and the claim state. A
// claimed author project is that person's public profile. ISR like every
// dossier; the claim panel is a session-free island.
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ContextHeader } from "@/components/context-header"
import { ExpandRows } from "@/components/expand-rows"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { Metric } from "@/components/metric"
import { Link } from "@/components/quiet-link"
import { Section } from "@/components/section"
import { SourcesFooter } from "@/components/sources-footer"
import { FollowButton } from "@/features/follow/follow-button"
import { MonthlyActivity } from "@/features/hardware/activity"
import { ImplementationsTable } from "@/features/implementations/implementations-table"
import { RecordSpark } from "@/features/records/timeline"
import { getProjectPage } from "@/lib/catalog"
import {
  countNoun,
  formatDateUTC,
  formatImprovement,
  formatInstantUTC,
  formatPrimary,
} from "@/lib/format"
import { ClaimPanel } from "./claim-panel"

type Props = { params: Promise<{ slug: string }> }

export const revalidate = 300
// Without generateStaticParams a dynamic-param route never registers for
// ISR (Next 16 renders it per request, `revalidate` or not); an empty list
// keeps the build DB-free while unknown slugs render once and cache.
export function generateStaticParams(): { slug: string }[] {
  return []
}

const KIND_LABEL = {
  library: "Library",
  individual: "Competition author",
  vendor: "Vendor",
} as const

const RECORD_GRID =
  "grid grid-cols-[minmax(230px,1.5fr)_92px_180px_minmax(175px,1.1fr)_minmax(135px,0.9fr)_96px] items-center gap-x-4 min-w-[980px]"

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const model = await getProjectPage(slug)
  // Fail in metadata so unknown slugs return a real 404, not a soft-404.
  if (!model) notFound()
  return {
    title: model.project.name,
    description: `${model.project.name} on KernelIndex: ${countNoun(model.records.length, "current record")}, ${countNoun(model.stats.implementations, "measured kernel")}, with license, hardware, and benchmark evidence for every row.`,
    alternates: { canonical: `/projects/${slug}` },
  }
}

export default async function ProjectPage({ params }: Props) {
  const { slug } = await params
  const model = await getProjectPage(slug)
  if (!model) notFound()
  const { project, stats, claim } = model
  const individual = project.kind === "individual"

  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <ContextHeader
        title={project.name}
        context={
          <>
            <span className="key mr-2 text-mini text-subtle">
              {KIND_LABEL[project.kind]}
            </span>
            {project.repositoryUrl ? (
              <a href={project.repositoryUrl}>
                {project.host?.id ?? project.repositoryUrl}
              </a>
            ) : (
              (project.host?.id ?? null)
            )}
            {project.host && " · "}
            {project.licenses.length > 0
              ? project.licenses.join(", ")
              : "license unknown"}
          </>
        }
        meta={
          <>
            {/* The record count carries its snapshot: this dossier and the
                projects index cache on separate clocks, so a few minutes of
                imports can legitimately separate their numbers (§16.4). */}
            <span className={model.records.length > 0 ? "text-fg" : undefined}>
              {countNoun(model.records.length, "record")}
              <span className="text-faint">
                {" "}
                as of {formatInstantUTC(model.recordsAsOf)}
              </span>{" "}
              ·{" "}
              {countNoun(
                stats.implementations,
                individual ? "entry" : "kernel",
              )}{" "}
              · {stats.runs.toLocaleString("en-US")} runs
            </span>
            {claim.state === "claimed" && (
              <span>Claimed{claim.by ? ` by ${claim.by}` : ""}</span>
            )}
            {claim.state === "pending" && <span>Claim pending review</span>}
            <FollowButton
              kind="project"
              followKey={project.slug}
              label={project.name}
              href={`/projects/${project.slug}`}
              noun="project"
            />
          </>
        }
      />

      <main className="shell pb-24">
        {claim.state === "unclaimed" && (
          <div className="pt-5">
            <ClaimPanel
              slug={project.slug}
              github={project.host?.kind === "github"}
            />
          </div>
        )}

        <Section id="records" title="Records held">
          {model.records.length > 0 ? (
            <div className="overflow-x-auto">
              <div
                className={`${RECORD_GRID} border-b border-border-strong pb-2 font-mono text-label text-faint uppercase`}
              >
                <div>Operation · workload</div>
                <div>History</div>
                <div className="pr-3.5 text-right">Record</div>
                <div>Implementation</div>
                <div>Hardware</div>
                <div className="text-right">Since</div>
              </div>
              <ExpandRows
                cap={10}
                noun="records"
                rows={model.records.map((holder) => (
                  <div
                    key={holder.cohortKey}
                    className={`${RECORD_GRID} border-b border-line py-3 transition-colors hover:bg-raised`}
                  >
                    <div className="min-w-0 truncate">
                      {/* Straight to the record's cohort (§16.12). */}
                      <Link
                        href={`/operations/${holder.operation.slug}?workload=${holder.workloadId}&cohort=${encodeURIComponent(holder.cohortKey)}`}
                        prefetch={false}
                        className="text-body"
                      >
                        {holder.operation.name}
                      </Link>
                      <span className="ml-2 font-mono text-mini text-faint">
                        {holder.workloadSummary}
                      </span>
                    </div>
                    <div>
                      <RecordSpark history={holder.history} />
                    </div>
                    <div className="pr-3.5 text-right whitespace-nowrap">
                      <Metric
                        primary={holder.current.primary}
                        valueClassName="font-mono text-body text-fg"
                      />
                      {formatImprovement(holder.history[0]?.improvementPct) &&
                        holder.history[0]?.previousValue && (
                          <div className="font-mono text-mini text-faint">
                            {formatImprovement(
                              holder.history[0].improvementPct,
                            )}{" "}
                            · was{" "}
                            {formatPrimary(holder.history[0].previousValue)}
                          </div>
                        )}
                    </div>
                    <div className="min-w-0 truncate">
                      <Link
                        href={`/implementations/${holder.current.implementation.slug}`}
                        prefetch={false}
                        className="text-small"
                      >
                        {holder.current.implementation.name}
                      </Link>
                    </div>
                    <div className="truncate font-mono text-small text-muted">
                      {holder.hardware}
                    </div>
                    <div className="text-right font-mono text-mini text-faint">
                      {formatDateUTC(holder.since)}
                    </div>
                  </div>
                ))}
              />
            </div>
          ) : (
            <p className="py-2 text-body text-faint">
              No current records under the default source-backed filter.
            </p>
          )}
          <p className="mt-3 text-small text-faint">
            <Link href={`/records?f=${encodeURIComponent(project.name)}`}>
              Open in the records ledger →
            </Link>
          </p>
        </Section>

        <Section id="kernels" title={individual ? "Entries" : "Kernels"}>
          {model.implementations.length > 0 ? (
            <ImplementationsTable
              rows={model.implementations}
              withOperation
              cap={10}
              noun={individual ? "entries" : "kernels"}
            />
          ) : (
            <p className="py-2 text-body text-faint">
              No eligible measurement for this project yet.
            </p>
          )}
        </Section>

        {model.records.length > 0 && (
          <Section id="activity" title="Record activity">
            <MonthlyActivity records={model.records} />
          </Section>
        )}

        <SourcesFooter
          sources={model.sources}
          lastObservedAt={stats.lastObservedAt}
          api={`/projects/${project.slug}`}
        />
      </main>
    </>
  )
}
