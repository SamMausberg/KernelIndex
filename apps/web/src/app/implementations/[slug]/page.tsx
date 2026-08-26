import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ApiLink } from "@/components/api-link"
import { ContextHeader } from "@/components/context-header"
import { CopyButton } from "@/components/copy-button"
import { ExpandRows } from "@/components/expand-rows"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { ImplName } from "@/components/impl-name"
import { KeyValueList } from "@/components/key-value-list"
import { Metric } from "@/components/metric"
import { Link } from "@/components/quiet-link"
import { Section } from "@/components/section"
import {
  SourceCodeView,
  SourceDiffView,
} from "@/features/implementations/source-view"
import { getImplementationPage } from "@/lib/catalog"
import { countNoun, evidenceLabel, formatDateUTC } from "@/lib/format"
import { splitImplementationName } from "@/lib/names"
import { env } from "@/server/env"

// Implementation dossiers change only on importer runs; ISR on first hit.
export const revalidate = 3600
// Without generateStaticParams a dynamic-param route never registers for
// ISR (Next 16 renders it per request, `revalidate` or not); an empty list
// keeps the build DB-free while unknown slugs render once and cache.
export function generateStaticParams(): { slug: string }[] {
  return []
}

const EVIDENCE_GRID =
  "grid grid-cols-[minmax(260px,1.6fr)_170px_150px_92px_90px_110px] min-w-[870px]"

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const model = await getImplementationPage(slug)
  // Metadata resolves before headers flush: failing here makes the status
  // a real 404 instead of a soft-404 streamed into a 200.
  if (!model) notFound()
  const hardware = model.support.hardware.join(", ")
  return {
    title: model.implementation.name,
    description: `${model.implementation.name}: GPU kernel implementation from ${model.project.name} with install, license, supported hardware${hardware ? ` (${hardware})` : ""}, and benchmark evidence.`,
    alternates: { canonical: `/implementations/${slug}` },
  }
}

export default async function ImplementationPage({ params }: Props) {
  const { slug } = await params
  const model = await getImplementationPage(slug)
  if (!model) notFound()
  // What it was actually measured on — declared support is a claim, this is
  // evidence (§11.8): distinct GPUs from the eligible runs on this revision.
  const testedOn = [...new Set(model.bestResults.map((r) => r.hardware.model))]

  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <ContextHeader
        // Readable display name up top (2026-08-25 review), canonical id in
        // muted mono on the context line whenever the two differ.
        title={
          model.implementation.name === model.implementation.slug ? (
            <span className="font-mono">
              <ImplName name={model.implementation.name} />
            </span>
          ) : (
            <ImplName name={model.implementation.name} />
          )
        }
        // Three facts (§16 meta diet): who ships it, in what, under which
        // license. Slug echo and the support matrix live in "Use it".
        context={
          <>
            {splitImplementationName(model.implementation.name) && (
              <>
                <span className="font-mono text-faint">
                  {model.implementation.name}
                </span>
                {" · "}
              </>
            )}
            {model.project.name !== model.implementation.name &&
              (model.project.repositoryUrl ? (
                <>
                  <a href={model.project.repositoryUrl}>{model.project.name}</a>
                  {" · "}
                </>
              ) : (
                `${model.project.name} · `
              ))}
            {[
              model.interface.language === "unknown"
                ? null
                : model.interface.language,
              model.license.concluded ??
                model.license.declared ??
                "License unknown",
            ]
              .filter(Boolean)
              .join(" · ")}
          </>
        }
        meta={
          <>
            {model.sourceCode && (
              <a href="#code">
                Kernel source · {model.sourceCode.content.split("\n").length}{" "}
                lines ↓
              </a>
            )}
            {/* Standing (§16.9): records held now, inside their own cohorts. */}
            {model.standing.records > 0 && (
              <span className="text-fg">
                holds {countNoun(model.standing.records, "record")}
              </span>
            )}
          </>
        }
      />

      <main className="shell pb-24">
        <Section id="use" title="Use it">
          {/* The usability verdict first (§16.7): can this be used, in one
              neutral factual line, before any evidence or provenance. The
              ladder states observable facts — "deployable" was retired with
              policy v2 because it promised more than the facts prove. */}
          <p className="mb-4 text-body text-fg">
            {model.usage.install
              ? `Installable · ${model.usage.install.kind} · ${
                  model.usage.install.pinned
                    ? "pinned to the measured build"
                    : "unpinned"
                }`
              : model.sourceCode
                ? "Vendorable · source mirrored"
                : model.source.available
                  ? "Source available upstream"
                  : "Benchmark submission only · no public source"}
            <span className="text-subtle">
              {" · "}
              {model.license.concluded ??
                model.license.declared ??
                "license unknown"}
            </span>
            {model.source.available && (
              <Link href="#code" className="ml-4 text-small">
                View source →
              </Link>
            )}
          </p>
          <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] gap-10 max-lg:grid-cols-1">
            <div>
              {model.usage.install ? (
                <>
                  <div className="plate flex max-w-[560px] items-center gap-2.5 py-2 pr-2 pl-3">
                    <code className="min-w-0 flex-1 truncate font-mono text-small text-muted">
                      {model.usage.install.command}
                    </code>
                    <CopyButton
                      text={model.usage.install.command}
                      event="install_copied"
                    />
                  </div>
                  <p className="mt-2 max-w-[560px] text-small text-subtle">
                    {model.usage.install.pinned
                      ? "Pinned: this command installs the newest release the evidence below measured."
                      : "Unpinned: installs the current release, not necessarily the measured build."}
                  </p>
                </>
              ) : model.sourceCode ? (
                /* No package exists, but the code does (§8.13): vendoring is
                   the honest adoption path for most of the corpus. */
                <div className="max-w-[560px]">
                  <p className="text-body text-muted">
                    No package. Vendor the mirrored source:{" "}
                    {model.sourceCode.content.split("\n").length} lines
                    {model.sourceCode.license &&
                      `, ${model.sourceCode.license}`}
                    {model.source.commit &&
                      `, pinned at ${model.source.commit.slice(0, 7)}`}
                    .
                  </p>
                  <div className="plate mt-2.5 flex items-center gap-2.5 py-2 pr-2 pl-3">
                    <span className="min-w-0 flex-1 truncate font-mono text-small text-muted">
                      {model.sourceCode.fileName ?? "kernel source"}
                    </span>
                    <CopyButton
                      text={model.sourceCode.content}
                      event="install_copied"
                    />
                  </div>
                  <div className="plate mt-2 flex items-center gap-2.5 py-2 pr-2 pl-3">
                    <code className="min-w-0 flex-1 truncate font-mono text-small text-muted">
                      {`curl "${env.SITE_ORIGIN ?? "https://kernelindex.com"}/api/v1/implementations/${model.implementation.slug}?include=source"`}
                    </code>
                    <CopyButton
                      text={`curl "${env.SITE_ORIGIN ?? "https://kernelindex.com"}/api/v1/implementations/${model.implementation.slug}?include=source"`}
                      event="install_copied"
                    />
                  </div>
                </div>
              ) : (
                <p className="text-body text-faint">
                  No install recipe recorded for this revision.
                </p>
              )}
              {model.usage.invocationExample && (
                <pre className="plate mt-4 max-w-[560px] overflow-x-auto px-4 py-3 font-mono text-small leading-relaxed text-muted">
                  {model.usage.invocationExample}
                </pre>
              )}
              <div className="mt-4 max-w-[560px]">
                <KeyValueList
                  items={[
                    {
                      key: "interface",
                      value: [
                        model.interface.language,
                        model.interface.framework,
                      ]
                        .filter(Boolean)
                        .join(" · "),
                    },
                    // The pinned revision the evidence applies to — the
                    // install above yields exactly this code, not "latest".
                    ...(model.source.commit
                      ? [
                          {
                            key: "revision",
                            value: model.source.commit.slice(0, 12),
                          },
                        ]
                      : []),
                    ...(model.interface.symbol
                      ? [{ key: "symbol", value: model.interface.symbol }]
                      : []),
                    ...(model.interface.sourcePath
                      ? [{ key: "path", value: model.interface.sourcePath }]
                      : []),
                    ...model.usage.requirements.map((requirement) => ({
                      key: requirement.name,
                      value: requirement.constraint,
                    })),
                  ]}
                />
              </div>
            </div>
            <div className="border-l border-border pl-9 max-lg:border-l-0 max-lg:pl-0">
              <div className="mb-2.5 text-small text-subtle">Compatibility</div>
              <KeyValueList
                items={[
                  ...(testedOn.length > 0
                    ? [{ key: "measured on", value: testedOn.join(", ") }]
                    : []),
                  {
                    key: "declared hardware",
                    value: model.support.hardware.join(", ") || "declared only",
                  },
                  {
                    key: "architectures",
                    value: model.support.architectures.join(", ") || "—",
                  },
                  { key: "dtypes", value: model.support.dtypes.join(", ") },
                  ...(model.support.layouts.length > 0
                    ? [
                        {
                          key: "layouts",
                          value: model.support.layouts.join(", "),
                        },
                      ]
                    : []),
                  ...model.support.axes.map((axis, index) => ({
                    key: index === 0 ? "axes" : " ",
                    value: axis,
                  })),
                ]}
              />
            </div>
          </div>
        </Section>

        <Section id="performance" title="Benchmark evidence">
          {/* Purpose-built rows: this page IS the implementation, so each
              row states the workload it was measured on — never its own
              name, rank, or a self-comparison. The full sweep collapses so
              Source and Kernel source stay within reach (§16.7). */}
          {model.bestResults.length > 0 && (
            <p className="mb-3 text-small text-subtle">
              {model.bestResults.length} measurement
              {model.bestResults.length === 1 ? "" : "s"} across{" "}
              {new Set(model.bestResults.map((r) => r.hardware.model)).size} GPU
              {new Set(model.bestResults.map((r) => r.hardware.model)).size ===
              1
                ? ""
                : "s"}
              , fastest first.
            </p>
          )}
          <div className="overflow-x-auto">
            {model.bestResults.length > 0 ? (
              <div className="min-w-[870px]">
                <div
                  className={`${EVIDENCE_GRID} border-b border-border-strong font-mono text-label text-faint uppercase`}
                >
                  <div className="py-2">Operation / workload</div>
                  <div className="py-2">Hardware</div>
                  <div className="py-2 pr-3.5 text-right">Latency</div>
                  <div className="py-2">Rank</div>
                  <div className="py-2">Observed</div>
                  <div />
                </div>
                <ExpandRows
                  cap={10}
                  noun="measurements"
                  rows={model.bestResults.map((row) => (
                    <div
                      key={row.runId ?? row.workloadSummary}
                      className={`${EVIDENCE_GRID} row-cv h-12 items-center border-b border-line transition-colors hover:bg-raised`}
                    >
                      <div className="min-w-0 truncate pr-3">
                        <Link
                          href={`/operations/${row.operation.slug}`}
                          className="text-body text-fg hover:text-accent-bright"
                        >
                          {row.operation.name}
                        </Link>
                        <span className="ml-2 font-mono text-mini text-faint">
                          {row.workloadSummary}
                        </span>
                      </div>
                      <div className="truncate pr-3 font-mono text-small text-muted">
                        {row.hardware.model}
                      </div>
                      <div className="pr-3.5 text-right whitespace-nowrap">
                        <Metric
                          primary={row.primary}
                          spread
                          valueClassName="font-mono text-body text-fg"
                        />
                      </div>
                      {/* Rank inside the row's own cohort (§16.9): the
                          competitive fact the latency alone never states. */}
                      <div
                        className={`font-mono text-mini whitespace-nowrap ${
                          row.rank === 1 ? "text-fg" : "text-faint"
                        }`}
                      >
                        {row.rank === null
                          ? "—"
                          : `#${row.rank}${row.tiedWithPrevious ? "=" : ""}${
                              row.cohortSize ? ` of ${row.cohortSize}` : ""
                            }`}
                        {row.attestations > 0 && (
                          <span className="ml-1.5 text-faint">
                            · {row.attestations} note
                            {row.attestations === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-mini text-faint">
                        {formatDateUTC(row.lastTestedAt)}
                      </div>
                      <div className="pr-1 text-right text-small">
                        {row.runId && (
                          <Link href={`/runs/${row.runId}`}>Run →</Link>
                        )}
                      </div>
                    </div>
                  ))}
                />
              </div>
            ) : (
              <p className="py-6 text-body text-faint">
                No published measurement for this revision.
              </p>
            )}
          </div>
          <p className="mt-3 text-small text-faint">
            {evidenceLabel(model.trust.evidence)} ·{" "}
            <Link href="/docs#evidence">How evidence levels are derived →</Link>
          </p>
        </Section>

        <Section id="source" title="Source and license">
          {/* Same two-column rail as "Use it" so stacked sections share one
              vertical grid line. */}
          <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] gap-10 max-lg:grid-cols-1">
            <KeyValueList
              items={[
                {
                  key: "source",
                  value: model.source.available
                    ? (model.source.url ?? "available")
                    : "not public",
                },
                ...(model.source.commit
                  ? [{ key: "commit", value: model.source.commit }]
                  : []),
                ...(model.source.treeDigest
                  ? [{ key: "tree digest", value: model.source.treeDigest }]
                  : []),
                {
                  key: "revision digest",
                  value: model.implementation.digest,
                },
              ]}
            />
            <div className="border-l border-border pl-9 max-lg:border-l-0 max-lg:pl-0">
              <KeyValueList
                items={[
                  {
                    key: "license declared",
                    value: model.license.declared ?? "unknown",
                  },
                  {
                    key: "license concluded",
                    value: model.license.concluded ?? "unknown",
                  },
                  ...(model.license.evidencePath
                    ? [{ key: "evidence", value: model.license.evidencePath }]
                    : []),
                  ...(model.provenance.authors.length > 0
                    ? [
                        {
                          key: "authors",
                          value: model.provenance.authors.join(", "),
                        },
                      ]
                    : []),
                  ...(model.provenance.importedAt
                    ? [
                        {
                          key: "imported",
                          value: formatDateUTC(model.provenance.importedAt),
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          </div>
        </Section>

        {model.techniques.length > 0 && (
          <Section id="techniques" title="Techniques">
            {/* Hard facts only (§8.7): each trait names the source line that
                proves it. Searchable as tech:<trait>. */}
            <p className="mb-3 text-small text-subtle">
              Extracted from the mirrored source by pattern, never inferred.
              Each row cites its line.
            </p>
            <div className="max-w-[760px]">
              {model.techniques.map((technique) => (
                <div
                  key={technique.trait}
                  className="grid grid-cols-[170px_minmax(0,1fr)] items-baseline gap-x-4 border-b border-line py-1.5 text-small max-md:grid-cols-1"
                >
                  <Link
                    href={`/search?q=${encodeURIComponent(
                      [
                        model.bestResults[0]
                          ? `op:${model.bestResults[0].operation.slug}`
                          : null,
                        `tech:${technique.trait}`,
                      ]
                        .filter(Boolean)
                        .join(" "),
                    )}`}
                    prefetch={false}
                    className="font-mono text-small"
                  >
                    {technique.trait}
                    {technique.value !== null && (
                      <span className="text-subtle"> = {technique.value}</span>
                    )}
                  </Link>
                  <code className="truncate font-mono text-mini text-faint">
                    {technique.evidence}
                  </code>
                </div>
              ))}
            </div>
          </Section>
        )}

        {model.sourceCode && (
          <Section id="code" title="Kernel source">
            <SourceCodeView code={model.sourceCode} />
          </Section>
        )}

        {model.sourceCode?.diff && (
          <Section id="diff" title="Changes from previous submission">
            <SourceDiffView diff={model.sourceCode.diff} />
          </Section>
        )}

        {model.limitations.length > 0 && (
          <Section id="limitations" title="Limitations">
            <ul className="space-y-1.5 text-body text-muted">
              {model.limitations.map((limitation) => (
                <li key={limitation} className="font-mono text-small">
                  {limitation}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Trust summary and the machine twin, past the answer (§16 3-second
            rule): the chips beside each result already carry the detail. */}
        <div className="mt-12 flex flex-wrap items-baseline justify-between gap-5 border-t border-border pt-5">
          <p className="text-small text-subtle">{model.trust.summary}</p>
          <ApiLink
            path={`/implementations/${model.implementation.slug}${
              model.sourceCode ? "?include=source" : ""
            }`}
          />
        </div>
      </main>
    </>
  )
}
