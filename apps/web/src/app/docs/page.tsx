import type { Metadata } from "next"
import Link from "next/link"
import { ContextHeader } from "@/components/context-header"
import { Section } from "@/components/section"
import { LIMITATIONS, SourceTable } from "@/features/trust/sources"
import { getCoveragePage } from "@/lib/catalog"
import { servingEnabled } from "@/server/env"

export const metadata: Metadata = {
  title: "Docs",
  description:
    "How KernelIndex works: query syntax, reading a result, comparability and ranking rules, evidence levels, the REST API, and source licensing.",
  alternates: { canonical: "/docs" },
}
// Live per-source counts render inside #sources; everything else is prose.
export const revalidate = 300

const EVIDENCE_LEVELS = [
  [
    "Reported",
    "The result was published by a source. KernelIndex stores the snapshot as published and does not rerun it.",
  ],
  [
    "Reproducible",
    "Every input required to rerun the measurement is present: code, revision, workload, protocol, environment, and raw evidence.",
  ],
  [
    "Verified",
    "A runner controlled by KernelIndex reran the measurement and it passed.",
  ],
  ["Replicated", "Two independent KernelIndex runners reproduced the result."],
] as const

// Task-first order (2026-08-23 rewrite): each section starts with what the
// reader can do. Legacy anchors (#query-syntax, #comparability, #ranking,
// #evidence, #records, #agents) live on the h3 subheadings so old links
// keep landing.
const SECTIONS = [
  ["start", "Get started"],
  ["searching", "Searching"],
  ["results", "Reading a result"],
  ["use", "Using a kernel"],
  ["data", "API and agents"],
  ["contribute", "Contributing"],
  ["sources", "Sources and licensing"],
  ["versions", "Versions"],
  ["privacy", "Privacy"],
] as const

/** Anchored subheading inside a merged section; carries the legacy id. */
function Sub({ id, title }: { id: string; title: string }) {
  return (
    <h3 id={id} className="mt-7 mb-2.5 text-body font-medium text-fg">
      {title}
    </h3>
  )
}

export default async function DocsPage() {
  const coverage = await getCoveragePage()
  return (
    <>
      <ContextHeader title="Documentation" />
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
            className="block py-1 text-small text-faint transition-colors hover:text-fg no-underline"
          >
            {label}
          </a>
        ))}
      </nav>
      <main className="shell-narrow pb-24 text-body leading-relaxed text-muted">
        <Section id="start" title="Get started">
          <ol className="list-decimal space-y-2.5 pl-5">
            <li>
              Search{" "}
              <Link href="/search?q=rmsnorm%20B200%20bf16">
                <span className="font-mono text-small">rmsnorm B200 bf16</span>
              </Link>
              . The result lists the fastest known implementations measured on
              that workload, in rank order.
            </li>
            <li>
              The same answer over REST:
              <pre className="plate mt-2 overflow-x-auto px-4 py-2.5 font-mono text-small">
                {`curl "https://kernelindex.com/api/v1/search?q=rmsnorm%20B200%20bf16"`}
              </pre>
            </li>
            <li>
              Or in the terminal:{" "}
              <span className="font-mono text-small">
                ki search &quot;rmsnorm B200 bf16&quot; --json
              </span>
              .
            </li>
            <li>
              Opening a result shows the code, the license, and the benchmark
              run behind the number. The install command and the mirrored source
              are available from the same page.
            </li>
          </ol>
          <p className="mt-4">
            KernelIndex indexes GPU kernel benchmark results. Each number is
            imported from a named public source, retained as published, and
            compared only with runs that measured the same quantity under the
            same conditions. Workloads for which the index holds no adequate
            answer are listed under <Link href="/challenges">challenges</Link>.
          </p>
        </Section>

        <Section id="searching" title="Searching">
          <p>
            Enter an operation name, then add hardware, dtype, or shape to
            narrow the request. When a query matches several operations, the
            most heavily measured one is used and the page states which; the
            remainder appear under <em>All matches</em>.
          </p>

          <Sub id="query-syntax" title="Query syntax" />
          <pre className="plate mt-3 overflow-x-auto px-4 py-3 font-mono text-small leading-relaxed">
            {`rmsnorm
rmsnorm B200 bf16 [2048,4096] tokens=2048
model:deepseek-v3
op:004-gemm-n128-k2048
rmsnorm gpu:B200 dtype:bf16 shape:[2048,4096] framework=pytorch trust:verified`}
          </pre>
          <p className="mt-3">
            Filters take <span className="font-mono text-small">key:value</span>{" "}
            or <span className="font-mono text-small">key=value</span>. Keys:{" "}
            <span className="font-mono text-small">
              op family model gpu arch dtype shape layout framework language
              cuda trust license source installable tech
            </span>
            , plus axis bindings such as{" "}
            <span className="font-mono text-small">tokens=2048</span>. Workload
            and hardware filters determine what qualifies as an exact match;
            trust, license, and technique filters only remove rows from the
            listing. <span className="font-mono text-small">tech:tma</span>{" "}
            keeps implementations whose mirrored source uses that technique (the
            traits are extracted by pattern and listed on each implementation
            page). A misspelled filter produces a correction hint. If the exact
            shape requested has not been measured, the answer presents the
            nearest measured cases on either side of it.
          </p>

          <Sub id="views" title="Views" />
          <p>
            Results are separated into four views, which are never combined:{" "}
            <em>Exact</em> (matches the request), <em>Compatible</em> (close,
            with the differences listed), <em>Supported</em> (support claimed,
            no measurement), and <em>Other protocols</em> (measured by a
            different method). <em>Recommended</em> orders by strength of
            evidence and <em>Newest</em> orders by date. Ranks retain their
            meaning under either ordering.
          </p>
          <p className="mt-3">
            To cover an entire model at once, use the{" "}
            <Link href="/models">model view</Link>: select a model and a GPU to
            see the best known implementation for each operation, with any gaps
            stated. The same answer is served at{" "}
            <span className="font-mono text-small">
              /api/v1/models/{"{slug}"}?gpu=
            </span>
            .
          </p>
        </Section>

        <Section id="results" title="Reading a result">
          <p>
            Each number is presented with three facts: what it may be compared
            with, how it ranks, and the level of evidence supporting it.
          </p>

          <Sub id="comparability" title="Comparability" />
          <p>
            Runs are compared only within a cohort, meaning runs that measured
            the same quantity by the same method: the same workload, protocol,
            environment, and correctness threshold. A rank is meaningful only
            within a single cohort. Two runs that share nothing but a GPU name
            or an operation name are not compared.
          </p>

          <Sub id="ranking" title="Ranking" />
          <p>
            Inside a cohort, runs are ordered by latency under the frozen{" "}
            <span className="font-mono text-body">ranking-v1</span> policy. Runs
            whose difference falls within measurement uncertainty share a rank,
            shown as <span className="font-mono text-body">N=</span>. Each
            excluded run is given a reason code, such as{" "}
            <span className="font-mono text-small">RETRACTED</span> or{" "}
            <span className="font-mono text-small">MISSING_PRIMARY_METRIC</span>
            .
          </p>

          <Sub id="headroom" title="Headroom" />
          <p>
            Beside a cohort record the operation page states an{" "}
            <em>estimated floor</em>: the time the workload's declared tensors
            need to cross HBM once at the GPU's datasheet bandwidth, and, for
            GEMM and attention families, the time their arithmetic needs at the
            dense tensor-core peak. The larger of the two values is the floor,
            and the record's distance above it indicates how much room may
            remain. The figure is a coarse lower bound under{" "}
            <span className="font-mono text-body">headroom-v1</span>. It is
            labeled{" "}
            <span className="font-mono text-small">basis: estimate</span>{" "}
            wherever it appears and is not treated as evidence, since a kernel
            may sit well above the floor for legitimate reasons. No estimate is
            produced for a GPU absent from the datasheet table.
          </p>

          <Sub id="evidence" title="Evidence levels" />
          <div className="mt-1">
            {EVIDENCE_LEVELS.map(([label, description]) => (
              <div
                key={label}
                className="grid grid-cols-[130px_minmax(0,1fr)] gap-4 border-b border-line py-2.5"
              >
                <span className="text-body text-fg">{label}</span>
                <span className="text-body">{description}</span>
              </div>
            ))}
          </div>
          <p className="mt-3">
            Levels are derived from stored facts and cannot be chosen by a
            submitter. Whether a kernel can be used in practice, which depends
            on its license, install recipe, and hardware, is tracked separately;
            the fastest result and the fastest deployable result are frequently
            different rows.
          </p>
          <p className="mt-3">
            Run pages also collect community attestations: <em>reproduced</em>,{" "}
            <em>could not reproduce</em>, an <em>environment note</em>, or a{" "}
            <em>regression observed</em>, each with an optional measured value
            and evidence link. Attestations accumulate alongside the evidence.
            Only a rerun on a KernelIndex-controlled runner changes an evidence
            level.
          </p>
        </Section>

        <Section id="use" title="Using a kernel">
          <p>
            Every implementation page opens with a <em>Use it</em> section,
            which covers three cases.
          </p>
          <ul className="mt-3 list-disc space-y-2.5 pl-5">
            <li>
              A package exists, so the install command can be copied directly.
              The revision is pinned, which means the installed version is the
              one that was measured.
            </li>
            <li>
              No package exists, but the source is mirrored and can be vendored.
              Copy the file from the page, or run{" "}
              <span className="font-mono text-small">
                ki use &lt;implementation&gt;
              </span>{" "}
              to write it locally with the commit, license, and digest recorded
              in a header comment.
            </li>
            <li>
              No public source exists, so the row provides benchmark evidence
              only and states as much.
            </li>
          </ul>
          <p className="mt-3">
            Every run page provides a <em>Cite this record</em> action, giving a
            permalink, a digest, and an access date.
          </p>
        </Section>

        <Section id="data" title="API and agents">
          <p>
            The API returns the same answers as these pages. Reference:{" "}
            <Link href="/docs/api">/docs/api</Link>; machine contract:{" "}
            <a href="/api/v1/openapi.json" className="font-mono text-small">
              /api/v1/openapi.json
            </a>
            .
          </p>
          <pre className="plate mt-4 overflow-x-auto px-4 py-3 font-mono text-small leading-relaxed text-muted">
            {`# search: a person in a browser, or:
curl "https://kernelindex.com/api/v1/search?q=rmsnorm%20B200%20bf16"

# structured resolution: an agent with an exact workload:
curl -X POST https://kernelindex.com/api/v1/resolve/kernel \\
  -H 'Content-Type: application/json' \\
  -d '{"operation":{"name":"rmsnorm","axes":{"tokens":2048}},
       "environment":{"hardwareProduct":"B200","dtype":"bf16"}}'

# many workloads in one call (an agent planning every operation of a model):
curl -X POST https://kernelindex.com/api/v1/resolve/kernel/batch \\
  -H 'Content-Type: application/json' \\
  -d '{"requests":[
        {"operation":{"name":"rmsnorm"},"environment":{"hardwareProduct":"B200"}},
        {"operation":{"name":"gemm"},"environment":{"hardwareProduct":"B200"}}]}'

# evidence dossiers (same models as the pages):
curl https://kernelindex.com/api/v1/runs/<id-or-digest>
curl "https://kernelindex.com/api/v1/implementations/<slug>?include=source"

# records ledger, cursor-paginated:
curl "https://kernelindex.com/api/v1/records?limit=50"

# what the index learned since you last polled:
curl "https://kernelindex.com/api/v1/feed?since=2026-08-01T00:00:00Z"

# the ki CLI, from a checkout (not on npm yet):
git clone https://github.com/SamMausberg/KernelIndex && cd KernelIndex
pnpm install --frozen-lockfile
alias ki="node apps/cli/src/ki.ts"

ki search "gemm b200 nvfp4" --json | jq '.groups.exact[0]'
ki use <implementation>   # vendor a mirrored kernel source locally
ki manifest digest my-run.yaml

# validate a submission or flat bench record and preview its placement:
curl -X POST https://kernelindex.com/api/v1/submissions/preview \\
  -H 'Content-Type: application/json' \\
  -d "{\\"document\\": $(jq -Rs . < record.json)}"

# bulk export (versioned, immutable, zstd JSONL):
curl -L https://kernelindex.com/api/v1/exports/catalog.jsonl.zst

# README badge: current records held by an implementation (SVG):
![KernelIndex](https://kernelindex.com/badges/implementations/<slug>.svg)`}
          </pre>
          <p className="mt-4">
            <strong className="font-medium text-fg">API keys.</strong> Reads
            require no key. A key from <Link href="/account">your account</Link>{" "}
            raises the daily quota. Send it as{" "}
            <span className="font-mono text-small">
              Authorization: Bearer ki_…
            </span>{" "}
            (CLI: <span className="font-mono text-small">--api-key</span> or{" "}
            <span className="font-mono text-small">$KI_API_KEY</span>). Requests
            over quota return 429 with Retry-After. Keys are stored as hashes
            and can be revoked at any time.
          </p>

          <Sub id="precedents" title="Precedents" />
          <p>
            These answer two different questions. <em>Resolve</em> identifies
            which indexed implementation can serve a given workload as it
            stands. <em>Precedents</em> identifies which code to study before
            writing a new implementation: for a problem the index may not have
            seen, it returns the implementations most likely to carry
            transferable optimization ideas, ranked by transferability (same
            computation, same or adjacent GPU architecture, adjacent shape,
            record standing, shared techniques) with the reasons stated. It
            expresses a study priority and is not a benchmark ranking.
          </p>
          <pre className="plate mt-3 overflow-x-auto px-4 py-3 font-mono text-small leading-relaxed text-muted">
            {`ki precedents --op gqa-paged-decode --gpu B200 --dtype bf16 tokens=4096
curl -X POST https://kernelindex.com/api/v1/precedents \\
  -H "Content-Type: application/json" \\
  -d '{"operation": {"family": "gqa-paged-attention"}, "environment": {"hardwareProduct": "B200"}}'`}
          </pre>

          <Sub id="agents" title="Agents" />
          <p>
            Point an agent at <a href="/llms.txt">/llms.txt</a>, a single page
            listing the claims this index supports and every machine-readable
            surface. MCP is hosted, so one URL completes the setup:
          </p>
          <pre className="plate mt-4 overflow-x-auto px-4 py-3 font-mono text-small leading-relaxed text-muted">
            {`{ "mcpServers": { "kernelindex": { "url": "https://kernelindex.com/mcp" } } }

claude mcp add --transport http kernelindex https://kernelindex.com/mcp`}
          </pre>
          <p className="mt-3">
            Over stdio instead, from a checkout:{" "}
            <span className="font-mono text-small">
              node apps/mcp/src/server.ts
            </span>{" "}
            (<span className="font-mono text-small">KI_API</span> overrides the
            API base, <span className="font-mono text-small">KI_API_KEY</span>{" "}
            raises the quota). The published package{" "}
            <span className="font-mono text-small">@kernelindex/mcp</span> is
            not on npm yet, so prefer the hosted URL above. Both paths run the
            same eighteen read-only tools over the public REST API.
          </p>
          <p className="mt-4">
            REST, the CLI, MCP, the bulk export, the{" "}
            <a href="/records/feed.xml">Atom feed</a>, and the change feed (
            <span className="font-mono text-small">GET /feed?since=</span>)
            return the same answers as these pages.
          </p>
          {servingEnabled && (
            <p className="mt-3">
              <Link href="/serving">Serving</Link> covers whole LLM deployments,
              a separate corpus with its own comparisons. Pick an objective
              (say, maximize tokens/s under{" "}
              <span className="font-mono text-small">p99 ttft_ms ≤ 450</span>)
              and the cohort ranks under it; pick none and you get the trade-off
              frontier. API:{" "}
              <span className="font-mono text-small">
                POST /api/v1/resolve/serving
              </span>
              ; CLI:{" "}
              <span className="font-mono text-small">
                ki resolve serving --manifest req.yaml
              </span>
              .
            </p>
          )}
        </Section>

        <Section id="contribute" title="Contributing">
          <Sub id="records" title="Records" />
          <p>
            A record is the fastest eligible run within a single cohort. The{" "}
            <Link href="/records">ledger</Link> presents the append-only run
            history: a record may be beaten or retracted, but never edited. Any
            two runs can be placed side by side on{" "}
            <Link href="/compare">compare</Link>. A source&apos;s own reference
            implementation that has not yet been challenged is treated as
            coverage rather than a record; the ledger hides these by default and
            labels them <em>baseline · unbeaten</em>.
          </p>
          <p className="mt-3">
            Every run page provides a <em>Report an issue</em> action, which
            requires no account. An accepted report retracts or supersedes the
            record, and the history remains visible. The{" "}
            <Link href="/feed">feed</Link> lists the changes recorded by the
            index over the preceding 30 days: record breaks, imports,
            corrections, and accepted claims. When signed in, <em>Following</em>{" "}
            narrows the feed to the cohorts, operations, projects, GPUs, and
            models you follow.
          </p>
          <p className="mt-3">
            Every <Link href="/projects">project</Link> has a page with the
            records it holds and every kernel it measured. Authors may claim
            their own: a GitHub-hosted project is claimed in a single step by
            the account that owns the repository path, and any other case
            proceeds through reviewed evidence. A claim confers attribution and
            does not confer any right to edit evidence.
          </p>
          <p className="mt-3">
            To contribute evidence, validate a submission and preview its
            placement with{" "}
            <span className="font-mono text-small">ki submit record.yaml</span>,
            then use <span className="font-mono text-small">--send</span> with
            an API key. <Link href="/submit">Contribute →</Link>
          </p>

          <Sub id="counting" title="How we count" />
          <p>
            Four counters appear across the site and are not interchangeable.
            Each surface states which counter it reports, so that any two can be
            reconciled arithmetically.
          </p>
          <ul className="mt-3 space-y-2">
            <li>
              <strong className="font-medium text-fg">Records.</strong> One per
              comparison cohort: the fastest eligible run in it. A cohort is
              narrower than an operation, so records outnumber operations.
            </li>
            <li>
              <strong className="font-medium text-fg">
                Operations with ranked runs.
              </strong>{" "}
              Operations holding at least one eligible run. The homepage and{" "}
              <Link href="/records">the ledger</Link> state this one.
            </li>
            <li>
              <strong className="font-medium text-fg">
                Operations indexed.
              </strong>{" "}
              Every definition in the catalog, whether measured or not. The
              remainder is reported on <Link href="/search">browse</Link> as{" "}
              <em>indexed without runs</em>, which records a gap in coverage and
              implies nothing about performance.
            </li>
            <li>
              <strong className="font-medium text-fg">Browse rows.</strong> What{" "}
              <Link href="/search">browse</Link> lists. Fewer than the
              operations behind them: definitions reviewed as equivalent fold
              into one row, which states how many it absorbed. Their own pages
              and cohorts stay separate.
            </li>
          </ul>
          <p className="mt-3">
            Record counts also carry the ledger snapshot they came from. Pages
            cache independently, so two surfaces can state counts a few minutes
            of imports apart; the dates say so rather than leaving it to be read
            as a contradiction.
          </p>
        </Section>

        <Section id="sources" title="Sources and licensing">
          <p>
            Every result is imported from a named public source and shown as
            published. Each source&apos;s license and required credit is on{" "}
            <Link href="/legal">Legal</Link>. Rights holders can have anything
            removed; contested records come down first, questions after.
            &quot;Ranked&quot; counts the runs every ranked surface counts;
            &quot;indexed&quot; is the raw published corpus, failed and
            superseded runs included.
          </p>
          <div className="mt-5">
            <SourceTable
              rows={coverage.sources.filter((s) => s.kind === "kernel")}
              breadthLabel="Ops"
            />
          </div>
          {servingEnabled &&
            coverage.sources.some((s) => s.kind === "serving") && (
              <>
                <p className="mt-6">
                  Serving results are held separately from kernel results. The
                  Configs column counts distinct launch configurations.
                </p>
                <div className="mt-4">
                  <SourceTable
                    rows={coverage.sources.filter((s) => s.kind === "serving")}
                    breadthLabel="Configs"
                  />
                </div>
              </>
            )}
          <Sub id="limitations" title="Known limitations" />
          <ul className="list-disc space-y-2.5 pl-5">
            {LIMITATIONS.map((limitation) => (
              <li key={limitation.slice(0, 24)}>{limitation}</li>
            ))}
          </ul>
          <Sub id="data-quality" title="Data quality" />
          <p>
            A weekly job re-imports every source. An unexpected result stops
            that source before it writes, and an invariant check audits the
            whole catalog afterwards. The report is published at{" "}
            <a href="https://github.com/SamMausberg/KernelIndex/blob/main/registry/reports/source-health.json">
              registry/reports/source-health.json
            </a>
            ; versioned catalog exports live under{" "}
            <a href="https://github.com/SamMausberg/KernelIndex/tree/main/registry/exports">
              registry/exports
            </a>
            . Errors can be reported from the action on any run page.
            Corrections <a href="#records">retract or supersede</a> a record and
            do not rewrite it.
          </p>
        </Section>

        <Section id="versions" title="Versions">
          <p>
            Semantics change only through the publication of a new version. The
            current versions are manifests{" "}
            <span className="font-mono text-small">
              kernelindex.dev/v1alpha1
            </span>{" "}
            (
            <a href="https://github.com/SamMausberg/KernelIndex/tree/main/registry/schemas">
              schemas
            </a>
            ), ranking <span className="font-mono text-small">ranking-v1</span>,
            deployability{" "}
            <span className="font-mono text-small">deployability-v1</span>, and
            serving <span className="font-mono text-small">serving-v1</span>.
            Each response states the version under which it was ranked, and each
            import records its parser version. Published runs and their digests
            do not change. The method history is recorded in{" "}
            <a href="https://github.com/SamMausberg/KernelIndex/commits/main/docs/ENGINEERING_DESIGN.md">
              the design doc&apos;s git log
            </a>
            .
          </p>
        </Section>

        <Section id="privacy" title="Privacy">
          <p>
            KernelIndex records a small number of first-party counters, such as
            that a search occurred or that a result was opened. It sets no
            cookies and stores no identifiers, IP addresses, or query text.
            Counters are deleted after 90 days. Hosting adds cookieless,
            aggregate page-view counts (Vercel Web Analytics) with no persistent
            visitor identifier. Accounts store only the name and email address
            your sign-in provider shares, and you may delete your account at any
            time from <Link href="/account">/account</Link>. Full policy:{" "}
            <Link href="/legal">Legal</Link>.
          </p>
        </Section>
      </main>
    </>
  )
}
