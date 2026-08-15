import type { Metadata } from "next"
import Link from "next/link"
import { ContextHeader } from "@/components/context-header"
import { Section } from "@/components/section"

export const metadata: Metadata = { title: "Docs" }

const EVIDENCE_LEVELS = [
  [
    "Reported",
    "A traceable source claims the result and KernelIndex preserved the source snapshot exactly as published.",
  ],
  [
    "Reproducible",
    "Code, exact revision, workload, protocol, environment, and raw evidence are complete enough for a competent rerun.",
  ],
  [
    "Verified",
    "A controlled KernelIndex runner produced a passing result under an approved protocol.",
  ],
  [
    "Replicated",
    "At least two approved, independent runner identities reproduced an eligible result.",
  ],
] as const

const SECTIONS = [
  ["what", "What KernelIndex is"],
  ["query-syntax", "Query syntax"],
  ["views", "Views and sorting"],
  ["comparability", "Why comparable?"],
  ["ranking", "How ranking works"],
  ["evidence", "Evidence levels"],
  ["records", "How records are decided"],
  ["data", "Data and API"],
] as const

export default function DocsPage() {
  return (
    <>
      <div className="scan-line" />
      <ContextHeader
        title="Documentation"
        context="query syntax · comparability · evidence · records"
      />
      {/* Quiet section index on very wide screens (§16.3); the anchored
          headings remain the navigation everywhere else. */}
      <nav
        aria-label="Sections"
        className="fixed top-28 right-10 hidden w-52 2xl:block"
      >
        {SECTIONS.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="block py-1 text-[12px] text-faint transition-colors hover:text-fg hover:no-underline"
          >
            {label}
          </a>
        ))}
      </nav>
      <main className="shell-narrow animate-fade-in pb-24 text-[14px] leading-relaxed text-muted">
        <Section id="what" title="What KernelIndex is">
          <p>
            KernelIndex resolves an exact GPU workload to the fastest currently
            known compatible implementation, with source, license, environment,
            benchmark protocol, raw evidence, and an explicit trust level. Names
            are aliases, not identity: results are compared only when their
            workload, protocol, and environment digests actually match. Imported
            identifiers are displayed in humanized form — the canonical slugs
            and digests they alias are preserved unchanged on every detail view.
          </p>
        </Section>

        <Section id="query-syntax" title="Query syntax">
          <p>
            Type anything. An operation name is enough — the search field
            suggests matching operations as you type, and picking one submits an
            exact <span className="font-mono text-[12.5px]">op:</span> query.
            When several operations plausibly match and none dominates, the
            result page lists them instead of guessing. Recognized hardware,
            dtype, and shape tokens refine the workload; structured syntax is
            optional.
          </p>
          <pre className="plate mt-3 overflow-x-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed">
            {`rmsnorm
rmsnorm B200 bf16 [2048,4096] tokens=2048
model:deepseek-v3
op:004-gemm-n128-k2048
rmsnorm gpu:B200 dtype:bf16 shape:[2048,4096] framework=pytorch trust:verified`}
          </pre>
          <p className="mt-3">
            The operation resolves by slug, alias, and family first, then
            full-text and typo-tolerant matching. Structured filters accept{" "}
            <span className="font-mono text-[12.5px]">key:value</span> or{" "}
            <span className="font-mono text-[12.5px]">key=value</span> with the
            keys{" "}
            <span className="font-mono text-[12.5px]">
              op family model gpu arch dtype shape layout framework language
              cuda trust license source installable
            </span>
            , plus <span className="font-mono text-[12.5px]">name=integer</span>{" "}
            axis bindings such as{" "}
            <span className="font-mono text-[12.5px]">tokens=2048</span>. A{" "}
            <span className="font-mono text-[12.5px]">model:</span> facet
            resolves operations tagged with that model&apos;s workloads, alone
            or beside free text. Workload and environment facets decide exact
            versus compatible; trust, license, source, and installable filter
            rows without ever reclassifying evidence. An unknown filter returns
            a correction hint, never silent free text.
          </p>
        </Section>

        <Section id="views" title="Views and sorting">
          <p>
            Search groups evidence into Exact, Compatible, Supported, and
            Reported views that are never interleaved. Inside a view,{" "}
            <em>Recommended</em> is the default order — ranking-v1 for the exact
            cohort — and <em>Most verified</em>, <em>Deployable first</em>, and{" "}
            <em>Newest</em> are presentation re-sorts that never change a
            row&apos;s cohort rank. The records ledger defaults to newest record
            first, with <em>Largest improvement</em> (margin over the previous
            record), <em>Most lead changes</em> (how many times the
            cohort&apos;s record has changed hands — a competition measure, not
            a dispute measure), and operation A–Z. Browse orders the corpus by
            indexed run count, recent activity, or name. No sort ever ranks
            incomparable workloads against each other by latency.
          </p>
        </Section>

        <Section id="comparability" title="Why comparable?">
          <p>
            A result ranks only inside a comparison cohort: identical workload
            digest, benchmark protocol, execution environment key, and
            correctness policy. Hardware name or operation label alone never
            establishes comparability. Source-native results (for example
            SOL-ExecBench suite scores) keep their upstream protocol and are
            shown separately, never merged into an exact latency cohort.
          </p>
        </Section>

        <Section id="ranking" title="How ranking works">
          <p>
            Within a cohort, results are ordered by the protocol's primary
            metric (median latency for kernel cohorts) under the frozen{" "}
            <span className="font-mono text-[13px]">ranking-v1</span> policy.
            Two runs receive a strict order only when their declared confidence
            intervals separate; overlapping intervals (and equal values) share a
            rank shown as <span className="font-mono text-[13px]">N=</span>, and
            display order inside a tie follows trust, recency, then stable ID,
            never a hidden performance tiebreaker. Source-native cohorts keep
            the upstream ordering and tie only on equal values. Every rank,
            exclusion, and near match carries a structured reason code such as{" "}
            <span className="font-mono text-[12.5px]">
              RETRACTED, SUPERSEDED, MISSING_PRIMARY_METRIC
            </span>
            .
          </p>
        </Section>

        <Section id="evidence" title="Evidence levels">
          <div className="mt-1">
            {EVIDENCE_LEVELS.map(([label, description]) => (
              <div
                key={label}
                className="grid grid-cols-[130px_minmax(0,1fr)] gap-4 border-b border-line py-2.5"
              >
                <span className="text-[13px] text-fg">{label}</span>
                <span className="text-[13px]">{description}</span>
              </div>
            ))}
          </div>
          <p className="mt-3">
            Badges are derived from stored facts; a submitter can never choose
            one. Imported results are <em>Reported</em> until independently
            rerun. Trusted-publisher status and download counts are source
            trust, not benchmark verification. Deployability (license, install,
            tested hardware) is tracked separately from trust: the fastest
            verified result and the fastest deployable result are often
            different rows.
          </p>
        </Section>

        <Section id="records" title="How records are decided">
          <p>
            A record exists only inside one comparison cohort. The{" "}
            <Link href="/records">records ledger</Link> reads an append-only
            record-event log derived at publication time: within a cohort, the
            record sequence is the running minimum of the primary metric in
            observation order. Corrections supersede prior runs and retractions
            remove them from eligibility, so the visible sequence recomputes
            without ever rewriting evidence. Two runs can be inspected side by
            side on the <Link href="/compare">compare page</Link>, which
            declares a winner only inside one cohort.
          </p>
        </Section>

        <Section id="data" title="Data and API">
          <p>
            Everything visible here is backed by canonical manifests with RFC
            8785 content digests. The public REST API, exports, CLI, and MCP
            interface arrive with the contribution beta; agents will receive the
            same resolver semantics as these pages, never scraped HTML.
          </p>
        </Section>

        <Section id="sources" title="Sources and licensing">
          <p>
            Records are imported from{" "}
            <a href="https://huggingface.co/datasets/GPUMODE/kernelbot-data">
              GPU Mode and the KernelBot dataset
            </a>{" "}
            (June 9 Researcher Reciprocity License v1.0 — redistribution and
            display with attribution; AI-training use restricted) and the NVIDIA
            SOL-ExecBench public leaderboard API. Mirrored submission source is
            shown under the KernelBot dataset license; each submission&apos;s
            own license remains unknown and is never inferred. Rights holders
            can request removal at any time and contested records are retracted
            before any dispute.
          </p>
        </Section>
      </main>
    </>
  )
}
