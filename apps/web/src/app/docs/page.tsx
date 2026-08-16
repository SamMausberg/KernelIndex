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
  ["start", "Start here"],
  ["what", "What KernelIndex is"],
  ["query-syntax", "Query syntax"],
  ["views", "Views and sorting"],
  ["comparability", "Why comparable?"],
  ["ranking", "How ranking works"],
  ["evidence", "Evidence levels"],
  ["records", "How records are decided"],
  ["data", "Data and API"],
  ["serving", "Serving"],
  ["sources", "Sources and licensing"],
  ["privacy", "Privacy"],
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
        <Section id="start" title="Start here">
          <ol className="list-decimal space-y-2.5 pl-5">
            <li>
              Search in the browser:{" "}
              <Link href="/search?q=rmsnorm%20B200%20bf16">
                <span className="font-mono text-[12.5px]">
                  rmsnorm B200 bf16
                </span>
              </Link>{" "}
              resolves the workload to a ranked, comparable cohort.
            </li>
            <li>
              The same answer over REST:
              <pre className="plate mt-2 overflow-x-auto px-4 py-2.5 font-mono text-[12px]">
                {`curl "https://kernelindex.com/api/v1/search?q=rmsnorm%20B200%20bf16"`}
              </pre>
            </li>
            <li>
              Or through the CLI:{" "}
              <span className="font-mono text-[12.5px]">
                ki search &quot;rmsnorm B200 bf16&quot; --json
              </span>{" "}
              (install and commands under <a href="#data">Data and API</a>).
            </li>
            <li>
              Reading the answer: results rank only inside one comparison cohort
              (<a href="#comparability">why comparable?</a>), every row states
              its evidence level (<a href="#evidence">levels</a>), and
              license/source availability is a separate fact — Reported evidence
              means preserved as published, not rerun by KernelIndex.
            </li>
          </ol>
        </Section>

        <Section id="what" title="What KernelIndex is">
          <p>
            KernelIndex resolves an exact GPU workload to the fastest currently
            known compatible implementation, with source, license, environment,
            benchmark protocol, raw evidence, and an explicit trust level. Names
            are aliases, not identity: results are compared only when their
            workload, protocol, and environment digests actually match. Imported
            identifiers are displayed in humanized form; the canonical slugs and
            digests they alias are preserved unchanged on every detail view.
          </p>
        </Section>

        <Section id="query-syntax" title="Query syntax">
          <p>
            Type anything. An operation name is enough: the search field
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
            <span className="font-mono text-[12.5px]">model:</span>&#32;facet
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
            Other-cohorts views that are never interleaved (the last preserves
            source-protocol cohorts as published; &ldquo;Reported&rdquo; always
            names an evidence level, not a view). Inside a view,{" "}
            <em>Recommended</em>&#32;surfaces the strongest available trust tier
            first (verified, then reproducible, then license + source, then
            source available, then no source) with the cohort&apos;s ranking-v1
            latency order untouched inside each tier, so rank numbers keep their
            cohort meaning. Labeled dividers appear only when tiers actually
            differ, and the availability chips (has source, license known,
            installable, verified) filter on single observable facts.{" "}
            <em>Newest</em>&#32;is a presentation re-sort that never changes a
            row&apos;s cohort rank. The records ledger defaults to newest record
            first, with <em>Largest improvement</em>&#32;(margin over the
            previous record), <em>Most lead changes</em>&#32;(how many times the
            cohort&apos;s record has changed hands; a competition measure, not a
            dispute measure), and operation A–Z. Browse orders the corpus by
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
            metric (the source-declared latency statistic for kernel cohorts)
            under the frozen{" "}
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
          <p className="mt-3">
            Every run dossier carries a <em>Report an issue</em> action, with or
            without an account. A maintainer reviews each report; disagreements
            resolve by evidence and protocol, and an accepted report retracts or
            supersedes the record while its full history stays visible.
          </p>
        </Section>

        <Section id="data" title="Data and API">
          <p>
            Everything visible here is backed by canonical manifests with RFC
            8785 content digests. The public REST API at{" "}
            <span className="font-mono text-[12.5px]">/api/v1</span> returns the
            same resolver decisions as these pages, never scraped HTML,
            documented at{" "}
            <a href="/api/v1/openapi.json" className="font-mono text-[12.5px]">
              /api/v1/openapi.json
            </a>
            . One human and one agent example per capability:
          </p>
          <pre className="plate mt-4 overflow-x-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed text-muted">
            {`# search: a person in a browser, or:
curl "https://kernelindex.com/api/v1/search?q=rmsnorm%20B200%20bf16"

# structured resolution: an agent with an exact workload:
curl -X POST https://kernelindex.com/api/v1/resolve/kernel \\
  -H 'Content-Type: application/json' \\
  -d '{"operation":{"name":"rmsnorm","axes":{"tokens":2048}},
       "environment":{"hardwareProduct":"B200","dtype":"bf16"}}'

# evidence dossiers (same models as the pages):
curl https://kernelindex.com/api/v1/runs/<id-or-digest>
curl "https://kernelindex.com/api/v1/implementations/<slug>?include=source"

# records ledger, cursor-paginated:
curl "https://kernelindex.com/api/v1/records?limit=50"

# the ki CLI (apps/cli): stable --json for machines:
ki search "gemm b200 nvfp4" --json | jq '.groups.exact[0]'
ki manifest digest my-run.yaml

# bulk export (versioned, immutable, zstd JSONL):
curl -L https://kernelindex.com/api/v1/exports/catalog.jsonl.zst`}
          </pre>
          <p className="mt-4">
            <strong className="font-medium text-fg">API keys.</strong> Public
            reads need no key. A key from{" "}
            <Link href="/account">your account</Link> raises the daily quota and
            carries explicit scopes; send it as{" "}
            <span className="font-mono text-[12.5px]">
              Authorization: Bearer ki_…
            </span>{" "}
            (CLI: <span className="font-mono text-[12.5px]">--api-key</span> or{" "}
            <span className="font-mono text-[12.5px]">$KI_API_KEY</span>;{" "}
            <span className="font-mono text-[12.5px]">GET /api/v1/me</span>{" "}
            introspects the key). Quota exhaustion returns 429 with Retry-After;
            keys are stored hash-only and revocable at any time.
          </p>
          <p className="mt-3">
            <strong className="font-medium text-fg">MCP.</strong> Agents can
            speak MCP instead of REST: the read-only server in{" "}
            <span className="font-mono text-[12.5px]">apps/mcp</span> exposes
            search_catalog, resolve_kernel, get_operation, get_implementation,
            get_benchmark_evidence, compare_runs, validate_manifest, and
            get_manifest_schema over stdio (
            <span className="font-mono text-[12.5px]">
              node apps/mcp/src/server.ts
            </span>
            , env <span className="font-mono text-[12.5px]">KI_API</span> /{" "}
            <span className="font-mono text-[12.5px]">KI_API_KEY</span>). Same
            resolver decisions, digests, and caveats as this site — never
            scraped HTML.
          </p>
        </Section>

        <Section id="serving" title="Serving">
          <p>
            <Link href="/serving">Serving</Link> is a separate resolver surface:
            end-to-end LLM serving has different objects (model, stack, launch
            configuration, workload, topology) and different objectives than
            single kernels, so serving results never share a run table,
            comparison key, or leaderboard with kernel records — and there is{" "}
            <em>no universal serving score</em>. Two serving results compare
            only when model, workload, protocol, hardware topology, and quality
            policy all match; each such cohort is shown as its own group.
          </p>
          <p className="mt-3">
            The resolver ranks a cohort only under an explicit objective (e.g.
            maximize tokens/s subject to{" "}
            <span className="font-mono text-[12.5px]">p99 ttft_ms ≤ 450</span>
            ); without one it shows the Pareto frontier. A constraint on a
            metric a result did not report excludes that result with the reason
            stated — nothing is assumed. Declared harness-enforced SLO bounds
            (e.g. MLPerf Server/Interactive TTFT/TPOT limits) can satisfy a
            constraint as cited facts of the benchmark definition; they are
            labeled as such and are never measurements. The API mirrors this at{" "}
            <span className="font-mono text-[12.5px]">
              POST /api/v1/resolve/serving
            </span>{" "}
            and the CLI as{" "}
            <span className="font-mono text-[12.5px]">
              ki resolve serving --manifest req.yaml
            </span>
            .
          </p>
        </Section>

        <Section id="sources" title="Sources and licensing">
          <p>
            Records are imported from{" "}
            <a href="https://huggingface.co/datasets/GPUMODE/kernelbot-data">
              GPU Mode and the KernelBot dataset
            </a>{" "}
            (June 9 Researcher Reciprocity License v1.0: redistribution and
            display with attribution; AI-training use restricted) and the NVIDIA
            SOL-ExecBench public leaderboard API. Mirrored submission source is
            shown under the KernelBot dataset license; each submission&apos;s
            own license remains unknown and is never inferred. Serving results
            are official MLPerf™ Inference closed-division datacenter results
            from the Apache-2.0 per-round result repos, shown unmodified with
            round, submitter, system, and entry ID (MLPerf™ is a trademark of
            MLCommons). Rights holders can request removal at any time and
            contested records are retracted before any dispute.
          </p>
        </Section>

        <Section id="privacy" title="Privacy">
          <p>
            KernelIndex measures answer quality with a handful of first-party
            product events (a search happened, whether it parsed, whether an
            exact answer existed, an evidence page opened, an install command
            was copied) — no cookies, no analytics identifiers, no IP addresses,
            and never the raw query text. Event rows are pruned after 90 days.
            Accounts store only the GitHub-provided name, e-mail, and avatar,
            and can be deleted at any time from{" "}
            <Link href="/account">/account</Link>; published evidence and the
            audit trail are append-only and survive with the account reference
            detached.
          </p>
        </Section>
      </main>
    </>
  )
}
