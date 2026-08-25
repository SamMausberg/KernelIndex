"use client"

import { startTransition, useEffect, useState } from "react"
import { ApiLink } from "@/components/api-link"
import { ContextHeader } from "@/components/context-header"
import { Link } from "@/components/quiet-link"
import type { FeedModel } from "@/lib/catalog"
import type { FollowingFeed } from "@/server/follows"
import { FeedDays } from "./feed-rows"

// The feed island (§13.11, records-island pattern): the ISR page renders
// the public feed; "Following" swaps in the reader's narrowed feed from the
// session-authorized /feed/data route, marks what is newer than their
// watermark, and keeps the URL shareable. Nothing here navigates.

type Following = FollowingFeed | "sign-in" | null

export function FeedView({ initial }: { initial: FeedModel }) {
  const [following, setFollowing] = useState(false)
  const [loaded, setLoaded] = useState<Following>(null)

  const load = () => {
    if (loaded !== null) return
    fetch("/feed/data?following=1", { cache: "no-store" })
      .then(async (response) =>
        response.status === 401
          ? ("sign-in" as const)
          : response.ok
            ? ((await response.json()) as FollowingFeed)
            : null,
      )
      .then((result) => {
        if (result !== null) startTransition(() => setLoaded(result))
      })
      .catch(() => {})
  }
  const select = (on: boolean) => {
    startTransition(() => setFollowing(on))
    window.history.replaceState(null, "", on ? "/feed?following=1" : "/feed")
    if (on) load()
  }
  // A deep-linked view applies after hydration (window.location, not
  // useSearchParams, so the public feed stays in the static HTML).
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only URL read
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("following") === "1")
      select(true)
  }, [])

  const view = (on: boolean, label: string) => (
    <Link
      href={on ? "/feed?following=1" : "/feed"}
      prefetch={false}
      onClick={(event) => {
        event.preventDefault()
        select(on)
      }}
      className={`whitespace-nowrap transition-colors hover:text-fg no-underline ${
        following === on ? "text-fg" : "text-subtle"
      }`}
    >
      {label}
    </Link>
  )
  const narrowed = loaded !== null && loaded !== "sign-in" ? loaded : null

  return (
    <>
      {/* No subtitle (2026-08-25): the date gutter shows the window. The
          views are local navigation under the title (records idiom). */}
      <ContextHeader title="Feed">
        <nav
          aria-label="Feed views"
          className="mt-2.5 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-body"
        >
          {view(false, "All")}
          {view(true, "Following")}
        </nav>
      </ContextHeader>
      <main className="shell pb-24">
        {following ? (
          loaded === "sign-in" ? (
            <p className="py-8 text-body text-muted">
              <a href="/signin?next=%2Ffeed%3Ffollowing%3D1">
                Sign in to follow cohorts, operations, projects, GPUs, and
                models →
              </a>
            </p>
          ) : narrowed ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-border-strong pt-5 pb-3 text-small">
                <span className="text-faint">Following</span>
                {narrowed.follows.length === 0 && (
                  <span className="text-subtle">
                    nothing yet. Follow buttons sit on operation, project, GPU,
                    and model pages, on cohorts, and on search results.
                  </span>
                )}
                {narrowed.follows.map((follow) => (
                  <Link
                    key={`${follow.kind}-${follow.key}`}
                    href={follow.href}
                    prefetch={false}
                    className="key text-small text-subtle no-underline hover:text-fg"
                  >
                    {follow.label || follow.key}
                    <span className="ml-1.5 font-mono text-mini text-faint">
                      {follow.kind}
                    </span>
                  </Link>
                ))}
                <Link href="/account#following" className="ml-auto text-small">
                  Manage →
                </Link>
              </div>
              <FeedDays days={narrowed.feed.days} seenAt={narrowed.seenAt} />
            </>
          ) : null
        ) : (
          <div className="pt-3">
            <FeedDays days={initial.days} />
          </div>
        )}
        <div className="mt-11 flex flex-wrap items-baseline justify-between gap-5 border-t border-border pt-5">
          <p className="text-small text-subtle">
            Record breaks rank only inside their own cohort; imports state what
            a batch brought; corrections retract or supersede, never rewrite.{" "}
            <Link href="/docs#records">How records are decided →</Link>
          </p>
          {/* Machine access past the answer (3-second rule). */}
          <span className="flex items-baseline gap-x-5 text-small">
            <a
              href="/records/feed.xml"
              className="text-faint transition-colors hover:text-fg"
            >
              Atom feed
            </a>
            <ApiLink path="/feed" />
          </span>
        </div>
      </main>
    </>
  )
}
