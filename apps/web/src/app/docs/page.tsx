import type { Metadata } from "next"
import Link from "next/link"
import { ContextHeader } from "@/components/context-header"
import { Section } from "@/components/section"
import { SiteHeader } from "@/components/site-header"

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

export default function DocsPage() {
  return (
    <>
      <SiteHeader active="docs" />
      <div className="h-px origin-left animate-scan bg-accent" />
      <ContextHeader
        title="Documentation"
        context="query syntax · comparability · evidence · records"
      />
      <main className="shell-narrow animate-fade-in pb-24 text-[14px] leading-relaxed text-muted">
        <Section id="what" title="What KernelIndex is">
          <p>
            KernelIndex resolves an exact GPU workload to the fastest currently
            known compatible implementation, with source, license, environment,
            benchmark protocol, raw evidence, and an explicit trust level. Names
            are aliases, not identity: results are compared only when their
            workload, protocol, and environment digests actually match.
          </p>
        </Section>

        <Section id="query-syntax" title="Query syntax">
          <p>
            Type anything — an operation name is enough. Recognized hardware,
            dtype, and shape tokens refine the workload; structured syntax is
            optional.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-[3px] border border-border bg-surface px-4 py-3 font-mono text-[12.5px] leading-relaxed">
            {`rmsnorm
rmsnorm B200 bf16 [2048,4096]
rmsnorm gpu:B200 dtype:bf16 shape:[2048,4096] framework=pytorch`}
          </pre>
          <p className="mt-3">
            Today the resolver matches the operation by slug, alias, family,
            then name; shape, dtype, and hardware facets narrow results as the
            full parser lands (Week 4 of the engineering plan). Unrecognized
            text is preserved, never deleted.
          </p>
        </Section>

        <Section id="comparability" title="Why comparable?">
          <p>
            A result ranks only inside a comparison cohort: identical workload
            digest, benchmark protocol, execution environment key, and
            correctness policy. Hardware name or operation label alone never
            establishes comparability. Source-native results (for example
            SOL-ExecBench suite scores) keep their upstream protocol and are
            shown separately — they are never merged into an exact latency
            cohort.
          </p>
        </Section>

        <Section id="ranking" title="How ranking works">
          <p>
            Within a cohort, results are ordered by the protocol's primary
            metric — median latency for kernel cohorts. A strict winner requires
            the paired difference to be statistically defensible; until ranking
            policy v1 ships, ties shown as{" "}
            <span className="font-mono text-[13px]">N=</span> share a rank and
            display order is not a performance claim. Every rank, exclusion, and
            near match carries its reason.
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
            rerun — trusted-publisher status and download counts are source
            trust, not benchmark verification. Deployability (license, install,
            tested hardware) is tracked separately from trust: the fastest
            verified result and the fastest deployable result are often
            different rows.
          </p>
        </Section>

        <Section id="records" title="How records are decided">
          <p>
            A record exists only inside one comparison cohort. The{" "}
            <Link href="/records">records ledger</Link> is derived from
            append-only runs: within a cohort, the record sequence is the
            running minimum of the primary metric in observation order.
            Corrections supersede prior runs and retractions remove them from
            eligibility, so history recomputes without ever rewriting evidence.
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
      </main>
    </>
  )
}
