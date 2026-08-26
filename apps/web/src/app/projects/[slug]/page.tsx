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
import { ImplName } from "@/components/impl-name"
import { Metric } from "@/components/metric"
import { Link } from "@/components/quiet-link"
import { Section } from "@/components/section"
import { SourcesFooter } from "@/components/sources-footer"
import { StatStrip } from "@/components/stat-strip"
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
  formatWorkloadSummary,
  shortHardware,
} from "@/lib/format"
import { ClaimPanel } from "./claim-panel"

type Props = { params: Promise<{ slug: string }> }

export const revalidate = 3600
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

// SSR row caps (§16 payload budget): a large project (Liger: 565 records)
// must not ship thousands of DOM rows behind a disclosure; the ledger and
// the API carry the rest, and the cut is stated.
const RECORD_LIMIT = 40
const KERNEL_LIMIT = 40

export default async function ProjectPage({ params }: Props) {
  const { slug } = await params
  const model = await getProjectPage(slug)
  if (!model) notFound()
  const { project, stats, claim } = model
  const individual = project.kind === "individual"
  const records = model.records.slice(0, RECORD_LIMIT)
  const recordsCut = model.records.length - records.length
  const kernels = model.implementations.slice(0, KERNEL_LIMIT)
  const kernelsCut = model.implementations.length - kernels.length

  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <ContextHeader
        title={project.name}
        context={
          <>
            {/* Identity tags are plain text, not keys (§16 pill restraint). */}
            {KIND_LABEL[project.kind]}
            {" · "}
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
          <FollowButton
            kind="project"
            followKey={project.slug}
            label={project.name}
            href={`/projects/${project.slug}`}
            noun="project"
          />
        }
      />

      <main className="shell pb-24">
        {/* The standing before any table (§16 page grammar). The record
            count carries its snapshot: this dossier and the projects index
            cache on separate clocks, so a few minutes of imports can
            legitimately separate their numbers (§16.4). */}
        <StatStrip
          facts={[
            {
              label: "Records held",
              value: model.records.length.toLocaleString("en-US"),
              detail: `as of ${formatInstantUTC(model.recordsAsOf)}`,
            },
            {
              label: individual ? "Entries" : "Kernels",
              value: stats.implementations.toLocaleString("en-US"),
            },
            {
              label: "Runs",
              value: stats.runs.toLocaleString("en-US"),
            },
          ]}
        />
        {claim.state !== "unclaimed" && (
          <p className="pt-3 text-small text-subtle">
            {claim.state === "claimed"
              ? `Claimed${claim.by ? ` by ${claim.by}` : ""}`
              : "Claim pending review"}
          </p>
        )}
        {claim.state === "unclaimed" && (
          <div className="pt-5">
            <ClaimPanel
              slug={project.slug}
              github={project.host?.kind === "github"}
            />
          </div>
        )}

        {/* Titles distinct from the stat-strip labels above, so neither
            reads (nor tests) ambiguously. */}
        <Section id="records" title="Current records">
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
                rows={records.map((holder) => (
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
                        {formatWorkloadSummary(holder.workloadSummary)}
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
                        <ImplName name={holder.current.implementation.name} />
                      </Link>
                    </div>
                    <div className="truncate font-mono text-small text-muted">
                      {shortHardware(holder.hardware)}
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
            {recordsCut > 0 &&
              `${recordsCut} more record${recordsCut === 1 ? "" : "s"} · `}
            <Link href={`/records?f=${encodeURIComponent(project.name)}`}>
              Open in the records ledger →
            </Link>
          </p>
        </Section>

        <Section
          id="kernels"
          title={individual ? "Measured entries" : "Measured kernels"}
        >
          {kernels.length > 0 ? (
            <>
              <ImplementationsTable
                rows={kernels}
                withOperation
                cap={10}
                noun={individual ? "entries" : "kernels"}
              />
              {kernelsCut > 0 && (
                <p className="mt-3 text-small text-faint">
                  Showing {KERNEL_LIMIT} of {model.implementations.length}; the
                  full list is in the API dossier below.
                </p>
              )}
            </>
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
