// Challenges (§2.3): what the index has no good answer for yet, as one
// board — structured requests, priority gaps, model gaps, unbeaten
// baselines, unchallenged and stale records, plus the priority family×GPU
// grid. Each row is facts plus one link (the row itself); a zero stated is
// a fact, never a claim about performance.
import type { Metadata } from "next"
import { ApiLink } from "@/components/api-link"
import { ContextHeader } from "@/components/context-header"
import { ExpandRows } from "@/components/expand-rows"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { Link } from "@/components/quiet-link"
import { Section } from "@/components/section"
import type { Challenge, ChallengeKind } from "@/lib/catalog"
import { getChallenges, getCoveragePage } from "@/lib/catalog"
import { countNoun, formatDateUTC } from "@/lib/format"

export const metadata: Metadata = {
  title: "Challenges",
  description:
    "Where KernelIndex has no good answer yet: requested workloads, priority coverage gaps, unbeaten baselines, unchallenged and stale records.",
  alternates: { canonical: "/challenges" },
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
  "grid grid-cols-[minmax(220px,1.3fr)_130px_minmax(260px,1.7fr)_96px] items-baseline gap-x-4 min-w-[810px]"

/** The whole row is the challenge's one link (latest-breaks pattern): the
 * subject, hardware, gap, and demand are facts; the destination — resolver
 * or cohort — rides the row itself, not a per-row action column. */
function Row({ challenge }: { challenge: Challenge }) {
  return (
    <div
      className={`${GRID} relative border-b border-line py-2.5 transition-colors hover:bg-raised`}
    >
      <Link
        href={challenge.href}
        prefetch={false}
        aria-label={`${
          challenge.operation?.name ?? challenge.family
        }: ${challenge.detail || challenge.kind}`}
        className="absolute inset-0"
      />
      <div className="min-w-0 truncate">
        {challenge.operation ? (
          <span className="text-body text-fg">{challenge.operation.name}</span>
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
    </div>
  )
}

export default async function ChallengesPage() {
  const [model, coverage] = await Promise.all([
    getChallenges(),
    getCoveragePage(),
  ])
  const byKind = new Map<ChallengeKind, Challenge[]>()
  for (const challenge of model.challenges) {
    byKind.set(challenge.kind, [
      ...(byKind.get(challenge.kind) ?? []),
      challenge,
    ])
  }
  const present = KINDS.filter(({ kind }) => (byKind.get(kind) ?? []).length)
  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <ContextHeader
        title="Challenges"
        context="what the index has no good answer for yet"
        meta={
          <span>{countNoun(model.challenges.length, "open challenge")}</span>
        }
      >
        {/* One-line board index: the six kinds with counts, so the whole
            board scans before any table does (3-second rule). */}
        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-small">
          {present.map(({ kind, title }) => (
            <a
              key={kind}
              href={`#${kind.replaceAll("_", "-")}`}
              className="whitespace-nowrap text-subtle transition-colors hover:text-fg no-underline"
            >
              {title}{" "}
              <span className="font-mono text-mini text-faint">
                {(byKind.get(kind) ?? []).length}
              </span>
            </a>
          ))}
        </div>
      </ContextHeader>
      <main className="shell pb-24">
        {present.map(({ kind, title, caption }) => {
          const rows = byKind.get(kind) ?? []
          return (
            <section
              key={kind}
              id={kind.replaceAll("_", "-")}
              className="mt-10"
            >
              <div className="flex flex-wrap items-baseline gap-x-4">
                <h2 className="text-title font-medium">{title}</h2>
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
                </div>
                <ExpandRows
                  cap={8}
                  noun="challenges"
                  rows={rows.map((challenge) => (
                    <Row
                      key={`${challenge.href}·${challenge.hardware ?? ""}·${challenge.detail}`}
                      challenge={challenge}
                    />
                  ))}
                />
              </div>
            </section>
          )
        })}

        {/* The priority family×GPU grid (moved from /gpus): the operations
            an inference engineer asks about first, on the GPUs they ask
            about first. A zero is a stated gap, not a claim. */}
        <Section id="priority" title="Priority coverage">
          <div className="overflow-x-auto">
            <div className="max-w-[720px] min-w-[560px]">
              <div className="grid grid-cols-[minmax(180px,1.4fr)_repeat(3,minmax(96px,0.6fr))] items-baseline gap-x-4 border-b border-border-strong pb-2 font-mono text-label text-faint uppercase">
                <span>Family</span>
                {coverage.hero.gpus.map((gpu) => (
                  <span key={gpu} className="text-right">
                    {gpu.replace("NVIDIA ", "")}
                  </span>
                ))}
                <span className="text-right">All GPUs</span>
              </div>
              {coverage.hero.rows.map((row) => (
                <div
                  key={row.family}
                  className="grid grid-cols-[minmax(180px,1.4fr)_repeat(3,minmax(96px,0.6fr))] items-baseline gap-x-4 border-b border-line py-2.5 text-body"
                >
                  <Link
                    href={`/search?q=${encodeURIComponent(row.family)}`}
                    className="font-mono text-small"
                  >
                    {row.family}
                  </Link>
                  {row.runs.map((runs, index) => (
                    <span
                      key={coverage.hero.gpus[index]}
                      className="text-right font-mono text-small"
                    >
                      {runs === 0 ? (
                        <span className="text-faint">0 · gap</span>
                      ) : (
                        runs.toLocaleString("en-US")
                      )}
                    </span>
                  ))}
                  <span className="text-right font-mono text-small text-subtle">
                    {row.total.toLocaleString("en-US")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <p className="mt-11 border-t border-border pt-5 text-small text-subtle">
          Closing a challenge means publishing evidence: a benchmark run with
          its workload, protocol, environment, and source.{" "}
          <Link href="/submit">Contribute evidence →</Link>{" "}
          <ApiLink path="/challenges" />
        </p>
      </main>
    </>
  )
}
