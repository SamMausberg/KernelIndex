// Challenges (§2.3): what the index has no good answer for yet, as one
// board — structured requests, priority gaps, model gaps, unbeaten
// baselines, unchallenged and stale records. Three facts and two actions
// per row; a zero stated is a fact, never a claim about performance.
import type { Metadata } from "next"
import { ApiLink } from "@/components/api-link"
import { ContextHeader } from "@/components/context-header"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { Link } from "@/components/quiet-link"
import type { Challenge, ChallengeKind } from "@/lib/catalog"
import { getChallenges } from "@/lib/catalog"
import { countNoun, formatDateUTC } from "@/lib/format"

export const metadata: Metadata = {
  title: "Challenges",
  description:
    "Where KernelIndex has no good answer yet: requested workloads, priority coverage gaps, unbeaten baselines, unchallenged and stale records.",
}
export const revalidate = 300

const KINDS: { kind: ChallengeKind; title: string; caption: string }[] = [
  {
    kind: "requested",
    title: "Requested workloads",
    caption: "asked for on no-answer searches over 90 days",
  },
  {
    kind: "gap",
    title: "Priority gaps",
    caption: "high-demand families with zero runs on a priority GPU",
  },
  {
    kind: "model_gap",
    title: "Model gaps",
    caption: "measured on one priority GPU but not the other",
  },
  {
    kind: "unbeaten_baseline",
    title: "Unbeaten baselines",
    caption: "the source's own reference; nobody has entered against it",
  },
  {
    kind: "unchallenged",
    title: "Unchallenged records",
    caption: "single-entry cohorts",
  },
  {
    kind: "stale",
    title: "Stale records",
    caption: "not re-observed in 180 days",
  },
]

const GRID =
  "grid grid-cols-[minmax(220px,1.3fr)_130px_minmax(260px,1.7fr)_96px_110px] items-baseline gap-x-4 min-w-[920px]"

function Row({ challenge }: { challenge: Challenge }) {
  return (
    <div className={`${GRID} border-b border-line py-2.5`}>
      <div className="min-w-0 truncate">
        {challenge.operation ? (
          <Link href={`/operations/${challenge.operation.slug}`}>
            {challenge.operation.name}
          </Link>
        ) : (
          <span className="font-mono text-small text-muted">
            {challenge.family}
          </span>
        )}
      </div>
      <div className="truncate font-mono text-small text-subtle">
        {challenge.hardware ? challenge.hardware.replace("NVIDIA ", "") : "—"}
      </div>
      <div className="min-w-0 truncate text-small text-subtle">
        {challenge.detail || "—"}
      </div>
      <div className="text-right font-mono text-small">
        {challenge.count > 0 ? (
          <span className="text-fg">{challenge.count}×</span>
        ) : challenge.since ? (
          <span className="text-faint">{formatDateUTC(challenge.since)}</span>
        ) : (
          <span className="text-faint">—</span>
        )}
      </div>
      <div className="text-right">
        <Link href={challenge.href} prefetch={false} className="action">
          {challenge.kind === "gap" || challenge.kind === "requested"
            ? "Resolve →"
            : "Cohort →"}
        </Link>
      </div>
    </div>
  )
}

export default async function ChallengesPage() {
  const model = await getChallenges()
  const byKind = new Map<ChallengeKind, Challenge[]>()
  for (const challenge of model.challenges) {
    byKind.set(challenge.kind, [
      ...(byKind.get(challenge.kind) ?? []),
      challenge,
    ])
  }
  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <ContextHeader
        title="Challenges"
        context="what the index has no good answer for yet"
        meta={
          <>
            <span>{countNoun(model.challenges.length, "open challenge")}</span>
            <ApiLink path="/challenges" />
          </>
        }
      />
      <main className="shell pb-24">
        {KINDS.map(({ kind, title, caption }) => {
          const rows = byKind.get(kind) ?? []
          if (rows.length === 0) return null
          return (
            <section
              key={kind}
              id={kind.replaceAll("_", "-")}
              className="mt-10"
            >
              <div className="flex flex-wrap items-baseline gap-x-4">
                <h2 className="text-lead font-medium">{title}</h2>
                <span className="text-small text-faint">{caption}</span>
              </div>
              <div className="mt-3 overflow-x-auto">
                <div
                  className={`${GRID} border-b border-border-strong font-mono text-label text-faint uppercase`}
                >
                  <div className="py-2">Operation / family</div>
                  <div className="py-2">GPU</div>
                  <div className="py-2">What is missing</div>
                  <div className="py-2 text-right">Since / asks</div>
                  <div />
                </div>
                {rows.map((challenge) => (
                  <Row
                    key={`${challenge.href}·${challenge.hardware ?? ""}·${challenge.detail}`}
                    challenge={challenge}
                  />
                ))}
              </div>
            </section>
          )
        })}
        <p className="mt-11 border-t border-border pt-5 text-small text-subtle">
          Closing a challenge means publishing evidence: a benchmark run with
          its workload, protocol, environment, and source.{" "}
          <Link href="/submit">Contribute evidence →</Link>
        </p>
      </main>
    </>
  )
}
