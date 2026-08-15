// Contributor surface (§15.7 minimal): own submissions and project claims.

import { desc, eq } from "drizzle-orm"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { ContextHeader } from "@/components/context-header"
import { Section } from "@/components/section"
import { authConfigured } from "@/server/auth"
import { db } from "@/server/db/client"
import * as schema from "@/server/db/schema"
import { sessionUser } from "@/server/policy/authorization"
import { ClaimForm } from "./claim-form"

export const metadata: Metadata = { title: "Account" }
export const dynamic = "force-dynamic"

export default async function AccountPage() {
  const user = authConfigured ? await sessionUser(await headers()) : null
  if (user === null) {
    return (
      <main className="shell-narrow pt-16 pb-20">
        <p className="text-[13.5px] text-muted">
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
  const [mine, claims] = await Promise.all([
    db()
      .select()
      .from(schema.submissions)
      .where(eq(schema.submissions.userId, user.id))
      .orderBy(desc(schema.submissions.createdAt)),
    db()
      .select()
      .from(schema.projectClaims)
      .where(eq(schema.projectClaims.userId, user.id)),
  ])
  return (
    <>
      <div className="scan-line" />
      <ContextHeader
        title={user.name}
        context={user.roles.length > 0 ? user.roles.join(" · ") : "contributor"}
        meta={
          <a href="/api/auth/sign-out" className="text-subtle">
            Sign out
          </a>
        }
      />
      <main className="shell animate-fade-in pb-20">
        <Section id="submissions" title="Your submissions">
          {mine.length === 0 && (
            <p className="text-[13px] text-faint">
              None yet — <a href="/submit">submit evidence</a>.
            </p>
          )}
          {mine.map((submission) => (
            <p
              key={submission.id}
              className="border-b border-line py-2 font-mono text-[12.5px] text-subtle"
            >
              {submission.createdAt.toISOString().slice(0, 10)} ·{" "}
              {submission.id.slice(0, 13)}… · {submission.state}
              {submission.reviewNote && ` · ${submission.reviewNote}`}
            </p>
          ))}
        </Section>
        <Section id="claims" title="Project claims">
          {claims.map((claim) => (
            <p
              key={claim.id}
              className="border-b border-line py-2 font-mono text-[12.5px] text-subtle"
            >
              {claim.evidenceUrl} · {claim.state}
            </p>
          ))}
          <div className="mt-3">
            <ClaimForm />
          </div>
        </Section>
      </main>
    </>
  )
}
