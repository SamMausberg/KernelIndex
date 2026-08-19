import type { Metadata } from "next"
import Link from "next/link"
import { ContextHeader } from "@/components/context-header"
import { Section } from "@/components/section"

export const metadata: Metadata = { title: "Docs" }

const EVIDENCE_LEVELS = [
  [
    "Reported",
    "A source published it. KernelIndex keeps the snapshot exactly as published and never reruns it.",
  ],
  [
    "Reproducible",
    "Everything needed to rerun it — code, revision, workload, protocol, environment, raw evidence — is present.",
  ],
  ["Verified", "A KernelIndex-controlled runner reran it and it passed."],
  ["Replicated", "Two independent KernelIndex runners reproduced it."],
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
  ["agents", "Agents"],
  ["serving", "Serving"],
  ["sources", "Sources and licensing"],
  ["versions", "Versions"],
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
      {/* Quiet section index on very wide screens (§16.3), positioned below
          the header band so it never overlaps it; the anchored headings
          remain the navigation everywhere else. */}
      <nav
        aria-label="Sections"
        className="fixed top-40 right-10 hidden w-52 2xl:block"
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
              returns a ranked list of runs that measured the same thing.
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
              (commands under <a href="#data">Data and API</a>).
            </li>
            <li>
              Every row states how comparable it is (
              <a href="#comparability">why?</a>), how trustworthy it is (
              <a href="#evidence">evidence</a>), and whether you can get the
              code.
            </li>
          </ol>
        </Section>

        <Section id="what" title="What KernelIndex is">
          <p>
            An index of GPU kernel benchmark results. You describe a workload;
            it returns the fastest known implementations, with code, license,
            environment, and evidence for every number. Results are compared
            only when they measured the same thing the same way — never by name.
          </p>
        </Section>

        <Section id="query-syntax" title="Query syntax">
          <p>
            Type anything. An operation name is enough; hardware, dtype, and
            shape tokens narrow it. If several operations match, you pick one —
            nothing is guessed.
          </p>
          <pre className="plate mt-3 overflow-x-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed">
            {`rmsnorm
rmsnorm B200 bf16 [2048,4096] tokens=2048
model:deepseek-v3
op:004-gemm-n128-k2048
rmsnorm gpu:B200 dtype:bf16 shape:[2048,4096] framework=pytorch trust:verified`}
          </pre>
          <p className="mt-3">
            Filters take{" "}
            <span className="font-mono text-[12.5px]">key:value</span> or{" "}
            <span className="font-mono text-[12.5px]">key=value</span>. Keys:{" "}
            <span className="font-mono text-[12.5px]">
              op family model gpu arch dtype shape layout framework language
              cuda trust license source installable
            </span>
            , plus axis bindings like{" "}
            <span className="font-mono text-[12.5px]">tokens=2048</span>.
            Workload and hardware filters decide what counts as an exact match;
            trust and license filters only hide rows. A typo in a filter gets a
            correction hint, not a silent guess.
          </p>
        </Section>

        <Section id="views" title="Views and sorting">
          <p>
            Results split into four views that never mix: <em>Exact</em>{" "}
            (matches your request), <em>Compatible</em> (close, with the
            differences listed), <em>Supported</em> (claims support, no
            measurement), and <em>Other cohorts</em> (measured under a different
            protocol).
          </p>
          <p className="mt-3">
            <em>Recommended</em> puts the strongest evidence first without
            touching ranks. <em>Newest</em> re-sorts the display; ranks keep
            their meaning. No sort ever compares runs from different cohorts by
            speed.
          </p>
        </Section>

        <Section id="comparability" title="Why comparable?">
          <p>
            A cohort is a set of runs that measured the same thing the same way:
            same workload, same protocol, same environment, same correctness
            bar. Ranks exist only inside a cohort. A matching GPU name or
            operation name alone proves nothing, so it ranks nothing.
          </p>
        </Section>

        <Section id="ranking" title="How ranking works">
          <p>
            Inside a cohort, runs are ordered by latency under the frozen{" "}
            <span className="font-mono text-[13px]">ranking-v1</span> policy.
            Two runs too close to call — overlapping confidence intervals —
            share a rank, shown as{" "}
            <span className="font-mono text-[13px]">N=</span>. Every exclusion
            carries a reason code, like{" "}
            <span className="font-mono text-[12.5px]">RETRACTED</span> or{" "}
            <span className="font-mono text-[12.5px]">
              MISSING_PRIMARY_METRIC
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
            Levels are derived from stored facts — a submitter can't pick one.
            Whether you can actually use a kernel (license, install, hardware)
            is a separate fact: the fastest result and the fastest one you can
            deploy are often different rows.
          </p>
        </Section>

        <Section id="records" title="How records are decided">
          <p>
            A record is the fastest eligible run in one cohort, nothing more.
            The <Link href="/records">ledger</Link> replays the append-only run
            history, so a record can be beaten or retracted but never edited.
            Any two runs can be put side by side on{" "}
            <Link href="/compare">compare</Link>; it declares a winner only
            inside one cohort.
          </p>
          <p className="mt-3">
            Some sources ship their own baseline implementations. A baseline
            that is the only entry in its cohort is coverage, not a competitive
            record: the ledger hides these by default and labels them{" "}
            <em>baseline · unbeaten</em> when shown. The default order lists
            cohorts whose record has actually been displaced first.
          </p>
          <p className="mt-3">
            Every run page has <em>Report an issue</em> — no account needed. An
            accepted report retracts or supersedes the record; the history stays
            visible.
          </p>
        </Section>

        <Section id="data" title="Data and API">
          <p>
            The API returns the same answers as these pages. Reference:{" "}
            <Link href="/docs/api">/docs/api</Link>; machine contract:{" "}
            <a href="/api/v1/openapi.json" className="font-mono text-[12.5px]">
              /api/v1/openapi.json
            </a>
            .
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
curl -L https://kernelindex.com/api/v1/exports/catalog.jsonl.zst

# README badge: current records held by an implementation (SVG):
![KernelIndex](https://kernelindex.com/badges/implementations/<slug>.svg)`}
          </pre>
          <p className="mt-4">
            <strong className="font-medium text-fg">API keys.</strong> Reads
            need no key. A key from <Link href="/account">your account</Link>{" "}
            raises the daily quota — send it as{" "}
            <span className="font-mono text-[12.5px]">
              Authorization: Bearer ki_…
            </span>{" "}
            (CLI: <span className="font-mono text-[12.5px]">--api-key</span> or{" "}
            <span className="font-mono text-[12.5px]">$KI_API_KEY</span>). Over
            quota returns 429 with Retry-After. Keys are stored as hashes and
            revocable anytime.
          </p>
          <p className="mt-3">
            <strong className="font-medium text-fg">MCP.</strong> Agents can use
            MCP instead of REST — the setup is under{" "}
            <a href="#agents">Agents</a>. Same answers, same caveats.
          </p>
        </Section>

        <Section id="agents" title="Agents">
          <p>
            Point an agent at <a href="/llms.txt">/llms.txt</a> — one page
            saying what this index can claim, and every machine surface.
            One-paste MCP setup from a repository checkout:
          </p>
          <pre className="plate mt-4 overflow-x-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed text-muted">
            {`{
  "mcpServers": {
    "kernelindex": {
      "command": "node",
      "args": ["apps/mcp/src/server.ts"],
      "cwd": "/path/to/KernelIndex",
      "env": { "KI_API": "https://kernelindex.com/api/v1" }
    }
  }
}`}
          </pre>
          <p className="mt-4">
            REST, the CLI, MCP, the bulk export, and the{" "}
            <a href="/records/feed.xml">Atom feed</a> all return the same
            answers as these pages — machines never get a weaker explanation.
          </p>
        </Section>

        <Section id="serving" title="Serving">
          <p>
            <Link href="/serving">Serving</Link> covers whole LLM deployments,
            not single kernels, so it has its own tables and its own comparisons
            — there is no universal serving score. Results compare only when
            model, workload, protocol, hardware, and quality bar all match.
          </p>
          <p className="mt-3">
            Pick an objective (say, maximize tokens/s under{" "}
            <span className="font-mono text-[12.5px]">p99 ttft_ms ≤ 450</span>)
            and the cohort ranks under it; pick none and you get the trade-off
            frontier. A run missing a bounded metric is excluded with the reason
            stated. API:{" "}
            <span className="font-mono text-[12.5px]">
              POST /api/v1/resolve/serving
            </span>
            ; CLI:{" "}
            <span className="font-mono text-[12.5px]">
              ki resolve serving --manifest req.yaml
            </span>
            .
          </p>
        </Section>

        <Section id="sources" title="Sources and licensing">
          <p>
            Kernel results come from{" "}
            <a href="https://huggingface.co/datasets/GPUMODE/kernelbot-data">
              GPU Mode and the KernelBot dataset
            </a>
            , the NVIDIA SOL-ExecBench public leaderboard, FlashInfer-Bench, and
            the{" "}
            <a href="https://github.com/linkedin/Liger-Kernel">Liger-Kernel</a>{" "}
            benchmark suite. Serving results are official MLPerf™ Inference
            results, shown unmodified (MLPerf™ is a trademark of MLCommons).
            Each source's license and required credit is on{" "}
            <Link href="/legal">Legal</Link>; live counts and limits on{" "}
            <Link href="/coverage">Coverage</Link>. Rights holders can have
            anything removed — contested records come down first, questions
            after.
          </p>
        </Section>

        <Section id="versions" title="Versions">
          <p>
            Semantics change only by publishing a new version. Current:
            manifests{" "}
            <span className="font-mono text-[12.5px]">
              kernelindex.dev/v1alpha1
            </span>{" "}
            (
            <a href="https://github.com/SamMausberg/KernelIndex/tree/main/registry/schemas">
              schemas
            </a>
            ), ranking{" "}
            <span className="font-mono text-[12.5px]">ranking-v1</span>,
            deployability{" "}
            <span className="font-mono text-[12.5px]">deployability-v1</span>,
            serving <span className="font-mono text-[12.5px]">serving-v1</span>.
            Every response names the version it ranked under; every import
            records its parser version. Published runs and their digests never
            change. Method history:{" "}
            <a href="https://github.com/SamMausberg/KernelIndex/commits/main/docs/ENGINEERING_DESIGN.md">
              the design doc's git log
            </a>
            .
          </p>
        </Section>

        <Section id="privacy" title="Privacy">
          <p>
            A few first-party counters — a search happened, a result was opened.
            No cookies, no IDs, no IP addresses, never the query text. Counters
            are deleted after 90 days. Hosting adds cookieless, aggregate
            page-view counts (Vercel Web Analytics), with no persistent visitor
            ID. Accounts store only the name and email your sign-in provider
            shares, and you can delete yours anytime from{" "}
            <Link href="/account">/account</Link>. Full policy:{" "}
            <Link href="/legal">Legal</Link>.
          </p>
        </Section>
      </main>
    </>
  )
}
