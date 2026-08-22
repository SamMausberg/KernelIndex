// Maintainer review surface (§14.8, §15.4): pending submissions and claims,
// and the correction write path. Access is decided by the centralized
// policy; signed-out or unprivileged visitors see a refusal, never data.

import { desc, eq, inArray, sql } from "drizzle-orm"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { ContextHeader } from "@/components/context-header"
import { Section } from "@/components/section"
import { authConfigured } from "@/server/auth"
import { db } from "@/server/db/client"
import * as schema from "@/server/db/schema"
import { eventSummary } from "@/server/events"
import { FLASHINFER_SOURCE } from "@/server/import/flashinfer/types"
import { GPUMODE_SOURCE } from "@/server/import/gpumode/types"
import { LIGER_SOURCE } from "@/server/import/liger/types"
import { MLPERF_SOURCE } from "@/server/import/mlperf/types"
import { SOL_SOURCE } from "@/server/import/sol/types"
import {
  canReviewSubmissions,
  sessionUser,
} from "@/server/policy/authorization"
import {
  AttestationHideForm,
  ClaimReviewForm,
  ReportReviewForm,
  RetractForm,
  ReviewForm,
} from "./admin-forms"

/** Declared freshness intervals (§19.9), keyed by source slug. */
const FRESHNESS_DAYS: Record<string, number> = Object.fromEntries(
  [
    SOL_SOURCE,
    GPUMODE_SOURCE,
    FLASHINFER_SOURCE,
    MLPERF_SOURCE,
    LIGER_SOURCE,
  ].map((source) => [source.slug, source.policy.freshnessDays]),
)

export const metadata: Metadata = { title: "Review" }
export const dynamic = "force-dynamic"

export default async function AdminPage() {
  const user = authConfigured ? await sessionUser(await headers()) : null
  if (user === null || !canReviewSubmissions(user)) {
    return (
      <main className="shell-narrow pt-16 pb-24">
        <p className="text-body text-muted">
          Review requires the site_admin role.{" "}
          {authConfigured ? (
            <a href="/signin?next=/admin">Sign in with GitHub</a>
          ) : (
            "Sign-in is not configured on this deployment."
          )}
        </p>
      </main>
    )
  }

  const [
    pending,
    claims,
    openReports,
    recentAudit,
    sourceRows,
    metrics,
    attestations,
  ] = await Promise.all([
    db()
      .select()
      .from(schema.submissions)
      .where(
        inArray(schema.submissions.state, ["ready_for_review", "in_review"]),
      )
      .orderBy(desc(schema.submissions.createdAt)),
    db()
      .select({
        claim: schema.projectClaims,
        project: { name: schema.projects.name, slug: schema.projects.slug },
      })
      .from(schema.projectClaims)
      .innerJoin(
        schema.projects,
        eq(schema.projectClaims.projectId, schema.projects.id),
      )
      .where(eq(schema.projectClaims.state, "pending")),
    db()
      .select()
      .from(schema.reports)
      .where(eq(schema.reports.state, "open"))
      .orderBy(desc(schema.reports.createdAt)),
    db()
      .select()
      .from(schema.auditEvents)
      .orderBy(desc(schema.auditEvents.at))
      .limit(20),
    db().execute(sql`
      select s.slug, s.kind, max(ss.fetched_at) last_fetched,
        (select count(*) from benchmark_runs r
           where r.source_id = s.id and r.published_at is not null) runs
      from sources s left join source_snapshots ss on ss.source_id = s.id
      group by s.id order by s.slug`) as Promise<
      {
        slug: string
        kind: string
        last_fetched: Date | null
        runs: number
      }[]
    >,
    eventSummary(30),
    db()
      .select()
      .from(schema.attestations)
      .where(eq(schema.attestations.state, "published"))
      .orderBy(desc(schema.attestations.createdAt))
      .limit(20),
  ])

  const sources = sourceRows.map((row) => {
    const declared = FRESHNESS_DAYS[row.slug]
    const last = row.last_fetched ? new Date(row.last_fetched) : null
    const state =
      last === null
        ? "never fetched"
        : declared !== undefined &&
            Date.now() - last.getTime() > declared * 86_400_000
          ? "stale"
          : "fresh"
    return { ...row, last, state, declared }
  })

  return (
    <>
      <ContextHeader
        title="Review"
        context={`${pending.length} submissions pending · ${claims.length} claims pending · ${openReports.length} reports open`}
        meta={<span>signed in as {user.name}</span>}
      />
      <main className="shell animate-fade-in pb-24">
        <Section id="submissions" title="Submissions awaiting review">
          {pending.length === 0 && (
            <p className="text-body text-faint">Nothing pending.</p>
          )}
          {pending.map((submission) => (
            <div
              key={submission.id}
              className="border-b border-line py-3 text-body"
            >
              <div className="flex flex-wrap items-baseline gap-4">
                <span className="font-mono text-small">{submission.id}</span>
                <span className="text-faint">
                  by {submission.userId} · {submission.state}
                </span>
              </div>
              <pre className="plate mt-2 max-h-[200px] overflow-auto px-3 py-2 font-mono text-mini text-subtle">
                {JSON.stringify(submission.validationReport, null, 2)}
              </pre>
              <div className="mt-2">
                <ReviewForm id={submission.id} />
              </div>
            </div>
          ))}
        </Section>

        <Section id="claims" title="Project claims">
          {claims.length === 0 && (
            <p className="text-body text-faint">Nothing pending.</p>
          )}
          {claims.map(({ claim, project }) => (
            <div key={claim.id} className="border-b border-line py-3 text-body">
              <div className="flex flex-wrap items-baseline gap-4">
                <span>{project.name}</span>
                <a href={claim.evidenceUrl} className="font-mono text-small">
                  {claim.evidenceUrl}
                </a>
                <span className="text-faint">by {claim.userId}</span>
              </div>
              <div className="mt-2">
                <ClaimReviewForm id={claim.id} />
              </div>
            </div>
          ))}
        </Section>

        <Section id="reports" title="Open reports">
          {openReports.length === 0 && (
            <p className="text-body text-faint">Nothing open.</p>
          )}
          {openReports.map((report) => (
            <div
              key={report.id}
              className="border-b border-line py-3 text-body"
            >
              <div className="flex flex-wrap items-baseline gap-4">
                <a
                  href={`/${report.targetKind === "serving_run" ? "serving-runs" : "runs"}/${report.targetId}`}
                  className="font-mono text-small"
                >
                  {report.targetKind}/{report.targetId.slice(0, 13)}…
                </a>
                <span className="text-warning">{report.reason}</span>
                <span className="text-faint">
                  {report.createdAt.toISOString().slice(0, 10)} ·{" "}
                  {report.userId ?? "anonymous"}
                  {report.contact && ` · ${report.contact}`}
                </span>
                {report.evidenceUrl && (
                  <a href={report.evidenceUrl} className="text-small">
                    evidence
                  </a>
                )}
              </div>
              <p className="mt-1.5 max-w-[80ch] whitespace-pre-wrap text-small text-subtle">
                {report.detail}
              </p>
              <div className="mt-2">
                <ReportReviewForm id={report.id} />
              </div>
            </div>
          ))}
        </Section>

        <Section id="attestations" title="Recent attestations">
          {attestations.length === 0 && (
            <p className="text-body text-faint">None published.</p>
          )}
          {attestations.map((row) => (
            <div key={row.id} className="border-b border-line py-3 text-body">
              <div className="flex flex-wrap items-baseline gap-4">
                <a href={`/runs/${row.runId}`} className="font-mono text-small">
                  run/{row.runId.slice(0, 13)}…
                </a>
                <span className="font-mono text-small text-subtle">
                  {row.type}
                </span>
                <span className="text-faint">
                  {row.createdAt.toISOString().slice(0, 10)} · {row.author}
                </span>
                {row.evidenceUrl && (
                  <a href={row.evidenceUrl} className="text-small">
                    evidence
                  </a>
                )}
              </div>
              <p className="mt-1.5 max-w-[80ch] whitespace-pre-wrap text-small text-subtle">
                {row.body}
              </p>
              <div className="mt-2">
                <AttestationHideForm id={row.id} />
              </div>
            </div>
          ))}
        </Section>

        <Section id="sources" title="Sources">
          <p className="mb-3 text-small text-subtle">
            Freshness against each source's declared interval (§19.9). The
            durable review report is registry/reports/source-health.json,
            refreshed by the weekly import workflow.
          </p>
          {sources.map((source) => (
            <div
              key={source.slug}
              className="flex flex-wrap items-baseline gap-4 border-b border-line py-2 text-body"
            >
              <span className="font-mono text-small">{source.slug}</span>
              <span className="text-faint">{source.kind}</span>
              <span
                className={
                  source.state === "fresh" ? "text-subtle" : "text-warning"
                }
              >
                {source.state}
              </span>
              <span className="text-faint">
                {Number(source.runs)} published runs
                {source.last &&
                  ` · fetched ${source.last.toISOString().slice(0, 10)}`}
                {source.declared !== undefined &&
                  ` · interval ${source.declared}d`}
              </span>
            </div>
          ))}
        </Section>

        <Section id="metrics" title="Product metrics · 30 days">
          <p className="mb-3 text-small text-subtle">
            First-party §20.5 events: no cookies, no identity, coarse facets
            only; rows prune after 90 days. The north star (§20.4) is the share
            of parseable searches answered with at least one exact,
            evidence-backed row.
          </p>
          {(() => {
            const parsed = metrics.searches.total - metrics.searches.parseErrors
            const rate = (part: number) =>
              parsed === 0 ? "n/a" : `${Math.round((part / parsed) * 100)}%`
            return (
              <div className="flex flex-wrap gap-x-8 gap-y-2 text-body">
                <span>
                  exact useful resolution{" "}
                  <span className="font-mono text-fg">
                    {rate(metrics.searches.exact)}
                  </span>
                </span>
                <span>
                  bracketed{" "}
                  <span className="font-mono text-fg">
                    {rate(metrics.searches.nearest)}
                  </span>
                </span>
                <span>
                  zero-result{" "}
                  <span className="font-mono text-fg">
                    {rate(metrics.searches.zero)}
                  </span>
                </span>
                <span>
                  searches{" "}
                  <span className="font-mono text-fg">
                    {metrics.searches.total}
                  </span>{" "}
                  <span className="text-faint">
                    ({metrics.searches.parseErrors} parse errors)
                  </span>
                </span>
              </div>
            )
          })()}
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5">
            {metrics.counts.length === 0 && (
              <span className="text-body text-faint">No events yet.</span>
            )}
            {metrics.counts.map((row) => (
              <span
                key={row.event}
                className="font-mono text-small text-subtle"
              >
                {row.event} <span className="text-fg">{row.total}</span>
              </span>
            ))}
          </div>
        </Section>

        <Section id="corrections" title="Retract a run">
          <p className="mb-3 text-small text-subtle">
            Retraction marks evidence invalid without deleting it (§10.7); the
            run page keeps resolving and the ledger records the transition.
          </p>
          <RetractForm />
        </Section>

        <Section id="audit" title="Recent audit events">
          {recentAudit.map((event) => (
            <p
              key={event.id}
              className="border-b border-line py-1.5 font-mono text-small text-subtle"
            >
              {event.at.toISOString().slice(0, 19)} · {event.actor} ·{" "}
              {event.action} · {event.targetKind}/{event.targetId.slice(0, 13)}…
              {event.reason && ` · ${event.reason}`}
            </p>
          ))}
        </Section>
      </main>
    </>
  )
}
