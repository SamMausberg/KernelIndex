// Legal (§14.10, §18.5): terms, privacy, source licensing, takedown — in
// plain language. The source facts mirror docs/source-policy.md; keep the
// two in sync. Not a substitute for legal review before monetization.
import type { Metadata } from "next"
import Link from "next/link"
import { ContextHeader } from "@/components/context-header"
import { Section } from "@/components/section"

export const metadata: Metadata = {
  title: "Legal",
  description:
    "KernelIndex terms, data licensing, and the source policy governing imported benchmark results.",
  alternates: { canonical: "/legal" },
}

/** Takedown/legal contact. Swap to a kernelindex.com mailbox once email
 * forwarding exists; everything on this page reads it from here. */
const LEGAL_CONTACT = {
  label: "GitHub issues",
  url: "https://github.com/SamMausberg/KernelIndex/issues",
}

const SOURCES = [
  {
    name: "NVIDIA SOL-ExecBench",
    url: "https://research.nvidia.com/benchmarks/sol-execbench",
    terms:
      "Harness and examples are Apache-2.0. Leaderboard facts come from the site's own public API and are shown with attribution. NVIDIA trademarks are used only to name the source.",
  },
  {
    name: "GPU Mode and the KernelBot dataset",
    url: "https://huggingface.co/datasets/GPUMODE/kernelbot-data",
    terms:
      "Researcher Reciprocity License v1.0. It grants display and distribution with attribution, which this site provides. Each submission's own code license is shown as unknown unless declared.",
  },
  {
    name: "FlashInfer-Bench",
    url: "https://huggingface.co/datasets/flashinfer-ai/flashinfer-trace",
    terms:
      "Apache-2.0, at a pinned dataset revision. Model-generated solutions are always labeled llm-generated with the generating model named.",
  },
  {
    name: "Liger-Kernel benchmarks",
    url: "https://github.com/linkedin/Liger-Kernel",
    terms:
      "BSD-2-Clause. The committed benchmark CSV, imported only for kernels whose semantics were verified against the producing script.",
  },
  {
    name: "MLPerf™ Inference",
    url: "https://mlcommons.org/benchmarks/inference-datacenter/",
    terms:
      "Official result repos, Apache-2.0. Results are shown unmodified and always name the round, submitter, and system. MLPerf™ is a trademark of MLCommons.",
  },
] as const

export default function LegalPage() {
  return (
    <>
      <ContextHeader
        title="Legal"
        context="terms · privacy · source licenses · takedown"
      />
      <main className="shell-narrow pb-24 text-body leading-relaxed text-muted">
        <Section id="terms" title="Terms of use">
          <p>
            KernelIndex is a free public index of GPU performance evidence. The
            numbers are third-party claims, preserved as published. They are
            provided as-is, with no warranty, and are not advice; verify before
            you rely on one.
          </p>
          <p className="mt-3">
            Accounts and API keys are free. Don't abuse them: quotas apply, and
            keys used to disrupt the service can be revoked. You can delete your
            account yourself at any time from{" "}
            <Link href="/account">your account</Link>.
          </p>
          <p className="mt-3">
            These terms are governed by the laws of British Columbia, Canada.
          </p>
        </Section>

        <Section id="privacy" title="Privacy">
          <p>
            Signing in stores the name and email your OAuth provider shares. No
            password is created or stored. Deleting your account removes your
            identity, sessions, keys, and watches immediately.
          </p>
          <p className="mt-3">
            The site keeps a small set of first-party counters: a search
            happened, a result was opened. No cookies for tracking, no IDs, no
            IP addresses, no query text. Counters are deleted after 90 days.
            Vercel, the hosting provider, additionally counts page views for us
            (Web Analytics): cookieless and aggregate, with no persistent
            visitor ID. Issue reports store only what you type, and contact
            details are optional.
          </p>
          <p className="mt-3">
            Questions or requests about your data:{" "}
            <a href={LEGAL_CONTACT.url}>{LEGAL_CONTACT.label}</a>.
          </p>
        </Section>

        <Section id="sources" title="Source licenses">
          <p className="mb-4">
            Every record names its source. What each source permits, and how it
            is credited:
          </p>
          <dl className="space-y-4">
            {SOURCES.map((source) => (
              <div key={source.name}>
                <dt className="text-body text-fg">
                  <a href={source.url}>{source.name}</a>
                </dt>
                <dd className="mt-0.5 text-body text-subtle">{source.terms}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-body text-subtle">
            Live counts and freshness per source are in{" "}
            <Link href="/docs#sources">Sources and licensing</Link>.
          </p>
        </Section>

        <Section id="takedown" title="Takedown">
          <p>
            If you hold rights to something indexed here and want it removed,
            say so at <a href={LEGAL_CONTACT.url}>{LEGAL_CONTACT.label}</a>.
            Contested records are retracted immediately, before any dispute is
            resolved. The audit trail is preserved.
          </p>
        </Section>
      </main>
    </>
  )
}
