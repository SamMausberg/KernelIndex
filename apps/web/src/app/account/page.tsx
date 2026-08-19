// Contributor surface (§15.7 minimal): own submissions and project claims.

import { desc, eq } from "drizzle-orm"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { ContextHeader } from "@/components/context-header"
import { Section } from "@/components/section"
import { SignOutButton } from "@/components/sign-out-button"
import { listApiKeys } from "@/server/api-keys"
import { authConfigured } from "@/server/auth"
import { db } from "@/server/db/client"
import * as schema from "@/server/db/schema"
import { sessionUser } from "@/server/policy/authorization"
import { watchFeed } from "@/server/watches"
import { ClaimForm } from "./claim-form"
import { DeleteAccountForm } from "./delete-form"
import { CreateKeyForm, RevokeKeyForm } from "./key-forms"
import { markSeenAction, unwatchAction } from "./seen-action"

/** Shown once, before the account has any keys, watches, or submissions. */
const FIRST_STEPS = [
  ["Watch a record", "any operation page has Watch cohort under its record"],
  ["Create an API key", "raises your /api/v1 quota; scoped and revocable"],
  ["Point an agent here", "MCP and CLI setup lives in the docs"],
] as const

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
        <main className="shell pt-8 pb-24">
          <p className="max-w-[64ch] text-body text-muted">
            {authConfigured ? (
              <a href="/signin">Sign in with GitHub</a>
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
  const firstRun =
    mine.length === 0 && keys.length === 0 && feed.watched.length === 0
  return (
    <>
      <ContextHeader
        title={user.name}
        context={[
          user.email,
          user.roles.length > 0 ? user.roles.join(" · ") : "contributor",
        ].join(" · ")}
        meta={<SignOutButton />}
      />
      <main className="shell animate-fade-in pb-24">
        {firstRun && (
          <div className="mt-8 border border-border px-5 py-4">
            <div className="font-mono text-label text-faint uppercase">
              First steps
            </div>
            <dl className="mt-3 space-y-2.5">
              {FIRST_STEPS.map(([term, detail]) => (
                <div key={term} className="flex gap-3 text-body">
                  <dt className="w-[150px] shrink-0 text-fg">{term}</dt>
                  <dd className="text-subtle">{detail}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-small text-faint">
              Start from the <a href="/records">records ledger</a>, or read the{" "}
              <a href="/docs#agents">agent quickstart</a>.
            </p>
          </div>
        )}
        <Section id="changes" title="Changes">
          {unseen === 0 && (
            <p className="text-body text-faint">
              Nothing new on your watched cohorts or submissions. Watch a cohort
              from any operation page.
            </p>
          )}
          {feed.records.map((event) => (
            <p
              key={`${event.runId}-${event.cause}`}
              className="border-b border-line py-2 text-body"
            >
              <a href={`/operations/${event.operation.slug}`}>
                {event.operation.name}
              </a>{" "}
              <span className="text-subtle">
                record {event.cause === "retraction" ? "reassigned" : "beaten"}{" "}
                by {event.implementation}
              </span>
              {event.value !== null && (
                <span className="ml-2 font-mono text-small text-fg">
                  {event.value} {event.unit}
                </span>
              )}
              <span className="ml-2 font-mono text-mini text-faint">
                {event.at.slice(0, 10)}
              </span>{" "}
              <a href={`/runs/${event.runId}`} className="text-small">
                Run →
              </a>
            </p>
          ))}
          {feed.submissions.map((submission) => (
            <p
              key={submission.id}
              className="border-b border-line py-2 text-body"
            >
              <span className="font-mono text-small">
                {submission.id.slice(0, 13)}…
              </span>{" "}
              <span className="text-subtle">
                submission moved to {submission.state}
              </span>
              <span className="ml-2 font-mono text-mini text-faint">
                {submission.at.slice(0, 10)}
              </span>
            </p>
          ))}
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            {unseen > 0 && (
              <form action={markSeenAction}>
                <button
                  type="submit"
                  className="key cursor-pointer px-2.5 py-1 text-small text-subtle hover:text-fg"
                >
                  Mark all seen
                </button>
              </form>
            )}
            {feed.watched.map((watch) => (
              <form
                key={watch.comparisonKey}
                action={unwatchAction}
                className="inline-flex items-center gap-1.5 text-small"
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
            <p className="text-body text-faint">
              None yet. <a href="/submit">Submit evidence</a>.
            </p>
          )}
          {mine.map((submission) => (
            <p
              key={submission.id}
              className="border-b border-line py-2 font-mono text-small text-subtle"
            >
              {submission.createdAt.toISOString().slice(0, 10)} ·{" "}
              {submission.id.slice(0, 13)}… · {submission.state}
              {submission.reviewNote && ` · ${submission.reviewNote}`}
            </p>
          ))}
        </Section>
        <Section id="api-keys" title="API keys">
          <p className="mb-3 max-w-[70ch] text-small text-subtle">
            Send a key as{" "}
            <span className="font-mono text-small">
              Authorization: Bearer ki_…
            </span>
            . Reads need no key — a key raises your quota. The secret shows once
            and is stored as a hash.
          </p>
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line py-2 text-small"
            >
              <span className="font-mono text-small">{key.prefix}…</span>
              <span className={key.revokedAt ? "text-faint" : undefined}>
                {key.name}
              </span>
              <span className="font-mono text-mini text-faint">
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
              className="border-b border-line py-2 font-mono text-small text-subtle"
            >
              {claim.evidenceUrl} · {claim.state}
            </p>
          ))}
          <div className="mt-3">
            <ClaimForm />
          </div>
        </Section>
        <Section id="delete" title="Delete account">
          <DeleteAccountForm email={user.email} />
        </Section>
      </main>
    </>
  )
}
