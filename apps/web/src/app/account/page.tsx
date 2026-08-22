// Contributor surface (§15.7 minimal): follows, own submissions, project
// claims, and API keys. What changed lives on /feed.

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
import { listFollows } from "@/server/follows"
import { sessionUser } from "@/server/policy/authorization"
import { DeleteAccountForm } from "./delete-form"
import { CreateKeyForm, RevokeKeyForm } from "./key-forms"
import { unfollowAction } from "./unfollow-action"

/** Shown once, before the account has any keys, follows, or submissions. */
const FIRST_STEPS = [
  ["Follow a cohort", "any operation page has Follow under its record"],
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
  const [mine, claims, keys, follows] = await Promise.all([
    db()
      .select()
      .from(schema.submissions)
      .where(eq(schema.submissions.userId, user.id))
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
      .where(eq(schema.projectClaims.userId, user.id)),
    listApiKeys(user.id),
    listFollows(user.id),
  ])
  const firstRun =
    mine.length === 0 && keys.length === 0 && follows.length === 0
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
              Start from the <a href="/feed">feed</a>, or read the{" "}
              <a href="/docs#agents">agent quickstart</a>.
            </p>
          </div>
        )}
        <Section id="following" title="Following">
          {follows.length === 0 && (
            <p className="text-body text-faint">
              Nothing yet. Follow buttons sit on operation, project, GPU, and
              model pages, on cohorts, and on search results.
            </p>
          )}
          {follows.map((follow) => (
            <form
              key={`${follow.kind}-${follow.key}`}
              action={unfollowAction}
              className="flex items-baseline gap-3 border-b border-line py-2 text-body"
            >
              <input type="hidden" name="kind" value={follow.kind} />
              <input type="hidden" name="key" value={follow.key} />
              <a href={follow.href}>{follow.label || follow.key}</a>
              <span className="font-mono text-mini text-faint">
                {follow.kind}
              </span>
              <button
                type="submit"
                aria-label={`Unfollow ${follow.label || follow.key}`}
                className="ml-auto cursor-pointer text-faint transition-colors hover:text-fg"
              >
                ✕
              </button>
            </form>
          ))}
          <p className="mt-3 text-small">
            <a href="/feed?following=1">Open your feed →</a>
          </p>
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
            . Reads need no key; a key raises your quota. The secret shows once
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
        <Section id="claims" title="Your projects">
          {claims.length === 0 && (
            <p className="text-body text-faint">
              None yet. Claim a project from its page: GitHub-hosted projects
              are yours in one click as the repository owner.
            </p>
          )}
          {claims.map(({ claim, project }) => (
            <p key={claim.id} className="border-b border-line py-2 text-body">
              <a href={`/projects/${project.slug}`}>{project.name}</a>
              <span className="ml-2 font-mono text-small text-subtle">
                {claim.state}
                {claim.reviewNote && ` · ${claim.reviewNote}`}
              </span>
            </p>
          ))}
        </Section>
        <Section id="delete" title="Delete account">
          <DeleteAccountForm email={user.email} />
        </Section>
      </main>
    </>
  )
}
