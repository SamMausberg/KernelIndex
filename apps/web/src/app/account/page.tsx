// Contributor surface (§15.7 minimal): own submissions and project claims.

import { desc, eq } from "drizzle-orm"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { ContextHeader } from "@/components/context-header"
import { Section } from "@/components/section"
import { listApiKeys } from "@/server/api-keys"
import { authConfigured } from "@/server/auth"
import { db } from "@/server/db/client"
import * as schema from "@/server/db/schema"
import { sessionUser } from "@/server/policy/authorization"
import { watchFeed } from "@/server/watches"
import { ClaimForm } from "./claim-form"
import { CreateKeyForm, RevokeKeyForm } from "./key-forms"
import { markSeenAction, unwatchAction } from "./seen-action"

export const metadata: Metadata = { title: "Account" }
export const dynamic = "force-dynamic"

export default async function AccountPage() {
  const user = authConfigured ? await sessionUser(await headers()) : null
  if (user === null) {
    return (
      <>
        <ContextHeader
          title="Account"
          context="submissions and project claims live here once you are signed in"
        />
        <main className="shell pt-8 pb-20">
          <p className="max-w-[64ch] text-[13.5px] text-muted">
            {authConfigured ? (
              <a href="/api/auth/sign-in/social?provider=github">
                Sign in with GitHub
              </a>
            ) : (
              <>
                Sign-in is not configured on this deployment. Evidence can still
                be contributed through the{" "}
                <a href="/submit">registry PR path</a>.
              </>
            )}
          </p>
        </main>
      </>
    )
  }
  const [mine, claims, keys, feed] = await Promise.all([
    db()
      .select()
      .from(schema.submissions)
      .where(eq(schema.submissions.userId, user.id))
      .orderBy(desc(schema.submissions.createdAt)),
    db()
      .select()
      .from(schema.projectClaims)
      .where(eq(schema.projectClaims.userId, user.id)),
    listApiKeys(user.id),
    watchFeed(user.id),
  ])
  const unseen = feed.records.length + feed.submissions.length
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
        <Section id="changes" title="Changes">
          {unseen === 0 && (
            <p className="text-[13px] text-faint">
              Nothing new on your watched cohorts or submissions. Watch a cohort
              from any operation page.
            </p>
          )}
          {feed.records.map((event) => (
            <p
              key={`${event.runId}-${event.cause}`}
              className="border-b border-line py-2 text-[13px]"
            >
              <a href={`/operations/${event.operation.slug}`}>
                {event.operation.name}
              </a>{" "}
              <span className="text-subtle">
                record {event.cause === "retraction" ? "reassigned" : "beaten"}{" "}
                by {event.implementation}
              </span>
              {event.value !== null && (
                <span className="ml-2 font-mono text-[12.5px] text-fg">
                  {event.value} {event.unit}
                </span>
              )}
              <span className="ml-2 font-mono text-[11.5px] text-faint">
                {event.at.slice(0, 10)}
              </span>{" "}
              <a href={`/runs/${event.runId}`} className="text-[12.5px]">
                Run →
              </a>
            </p>
          ))}
          {feed.submissions.map((submission) => (
            <p
              key={submission.id}
              className="border-b border-line py-2 text-[13px]"
            >
              <span className="font-mono text-[12.5px]">
                {submission.id.slice(0, 13)}…
              </span>{" "}
              <span className="text-subtle">
                submission moved to {submission.state}
              </span>
              <span className="ml-2 font-mono text-[11.5px] text-faint">
                {submission.at.slice(0, 10)}
              </span>
            </p>
          ))}
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            {unseen > 0 && (
              <form action={markSeenAction}>
                <button
                  type="submit"
                  className="key cursor-pointer px-2.5 py-[3px] text-[12px] text-subtle hover:text-fg"
                >
                  Mark all seen
                </button>
              </form>
            )}
            {feed.watched.map((watch) => (
              <form
                key={watch.comparisonKey}
                action={unwatchAction}
                className="inline-flex items-center gap-1.5 text-[12px]"
              >
                <input
                  type="hidden"
                  name="comparisonKey"
                  value={watch.comparisonKey}
                />
                <a href={`/operations/${watch.slug}`} className="text-subtle">
                  {watch.operation}
                </a>
                <button
                  type="submit"
                  aria-label={`Unwatch ${watch.operation}`}
                  className="cursor-pointer text-faint transition-colors hover:text-fg"
                >
                  ✕
                </button>
              </form>
            ))}
          </div>
        </Section>
        <Section id="submissions" title="Your submissions">
          {mine.length === 0 && (
            <p className="text-[13px] text-faint">
              None yet. <a href="/submit">Submit evidence</a>.
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
        <Section id="api-keys" title="API keys">
          <p className="mb-3 max-w-[70ch] text-[12.5px] text-subtle">
            Keys authenticate /api/v1 as a bearer token (
            <span className="font-mono text-[12px]">
              Authorization: Bearer ki_…
            </span>
            ). Public reads need no key; a key raises your quota and carries
            explicit scopes. The secret is shown once at creation and stored
            only as a hash.
          </p>
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line py-2 text-[12.5px]"
            >
              <span className="font-mono text-[12px]">{key.prefix}…</span>
              <span className={key.revokedAt ? "text-faint" : undefined}>
                {key.name}
              </span>
              <span className="font-mono text-[11.5px] text-faint">
                {key.scopes.join(" ")}
              </span>
              <span className="text-faint">
                {key.usedToday}/{key.quotaPerDay} today
                {key.lastUsedAt &&
                  ` · last used ${key.lastUsedAt.toISOString().slice(0, 10)}`}
              </span>
              {key.revokedAt ? (
                <span className="text-faint">revoked</span>
              ) : (
                <RevokeKeyForm id={key.id} />
              )}
            </div>
          ))}
          <div className="mt-3">
            <CreateKeyForm />
          </div>
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
