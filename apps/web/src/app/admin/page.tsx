// Maintainer review surface (§14.8, §15.4): pending submissions and claims,
// and the correction write path. Access is decided by the centralized
// policy; signed-out or unprivileged visitors see a refusal, never data.

import { desc, eq, inArray } from "drizzle-orm"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { ContextHeader } from "@/components/context-header"
import { Section } from "@/components/section"
import { authConfigured } from "@/server/auth"
import { db } from "@/server/db/client"
import * as schema from "@/server/db/schema"
import {
  canReviewSubmissions,
  sessionUser,
} from "@/server/policy/authorization"
import { ClaimReviewForm, RetractForm, ReviewForm } from "./admin-forms"

export const metadata: Metadata = { title: "Review" }
export const dynamic = "force-dynamic"

export default async function AdminPage() {
  const user = authConfigured ? await sessionUser(await headers()) : null
  if (user === null || !canReviewSubmissions(user)) {
    return (
      <main className="shell-narrow pt-16 pb-20">
        <p className="text-[13.5px] text-muted">
          Review requires the site_admin role.{" "}
          {authConfigured ? (
            <a href="/api/auth/sign-in/social?provider=github">
              Sign in with GitHub
            </a>
          ) : (
            "Sign-in is not configured on this deployment."
          )}
        </p>
      </main>
    )
  }

  const [pending, claims, recentAudit] = await Promise.all([
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
      .from(schema.auditEvents)
      .orderBy(desc(schema.auditEvents.at))
      .limit(20),
  ])

  return (
    <>
      <div className="scan-line" />
      <ContextHeader
        title="Review"
        context={`${pending.length} submissions pending · ${claims.length} claims pending`}
        meta={<span>signed in as {user.name}</span>}
      />
      <main className="shell animate-fade-in pb-20">
        <Section id="submissions" title="Submissions awaiting review">
          {pending.length === 0 && (
            <p className="text-[13px] text-faint">Nothing pending.</p>
          )}
          {pending.map((submission) => (
            <div
              key={submission.id}
              className="border-b border-line py-3 text-[13px]"
            >
              <div className="flex flex-wrap items-baseline gap-4">
                <span className="font-mono text-[12px]">{submission.id}</span>
                <span className="text-faint">
                  by {submission.userId} · {submission.state}
                </span>
              </div>
              <pre className="plate mt-2 max-h-[200px] overflow-auto px-3 py-2 font-mono text-[11.5px] text-subtle">
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
            <p className="text-[13px] text-faint">Nothing pending.</p>
          )}
          {claims.map(({ claim, project }) => (
            <div
              key={claim.id}
              className="border-b border-line py-3 text-[13px]"
            >
              <div className="flex flex-wrap items-baseline gap-4">
                <span>{project.name}</span>
                <a href={claim.evidenceUrl} className="font-mono text-[12px]">
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

        <Section id="corrections" title="Retract a run">
          <p className="mb-3 text-[12.5px] text-subtle">
            Retraction marks evidence invalid without deleting it (§10.7); the
            run page keeps resolving and the ledger records the transition.
          </p>
          <RetractForm />
        </Section>

        <Section id="audit" title="Recent audit events">
          {recentAudit.map((event) => (
            <p
              key={event.id}
              className="border-b border-line py-1.5 font-mono text-[12px] text-subtle"
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
