import type { Metadata } from "next"
import Link from "next/link"
import { ContextHeader } from "@/components/context-header"
import { Section } from "@/components/section"
import { LIMITATIONS, SourceTable } from "@/features/trust/sources"
import { getCoveragePage } from "@/lib/catalog"
import { servingEnabled } from "@/server/env"

export const metadata: Metadata = { title: "Docs" }
// Live per-source counts render inside #sources; everything else is prose.
export const revalidate = 300

const EVIDENCE_LEVELS = [
  [
    "Reported",
    "A source published it. KernelIndex keeps the snapshot exactly as published and never reruns it.",
  ],
  [
    "Reproducible",
    "Everything needed to rerun it (code, revision, workload, protocol, environment, raw evidence) is present.",
  ],
  ["Verified", "A KernelIndex-controlled runner reran it and it passed."],
  ["Replicated", "Two independent KernelIndex runners reproduced it."],
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
      <ContextHeader
        title="Documentation"
        context="search · results · using a kernel · API"
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
              . You get the fastest known implementations measured on that
              workload, ranked.
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
              Open a result to see the code, the license, and the benchmark run
              behind the number. Copy the install command or vendor the source
              from the same page.
            </li>
          </ol>
          <p className="mt-4">
            KernelIndex is an index of GPU kernel benchmark results. Every
            number is imported from a named public source, kept exactly as
            published, and compared only against runs that measured the same
            thing. Where the index has no good answer yet,{" "}
            <Link href="/challenges">challenges</Link> says so.
          </p>
        </Section>

        <Section id="searching" title="Searching">
          <p>
            Type an operation name. Add hardware, dtype, or shape to narrow it.
            When a query fits several operations, the most-measured one answers
            and the page says so; <em>All matches</em> shows the rest.
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
            , plus axis bindings like{" "}
            <span className="font-mono text-small">tokens=2048</span>. Workload
            and hardware filters decide what counts as an exact match; trust,
            license, and technique filters only hide rows.{" "}
            <span className="font-mono text-small">tech:tma</span> keeps
            implementations whose mirrored source uses that technique (the
            traits are extracted by pattern and listed on each implementation
            page). A typo in a filter gets a correction hint. If nobody measured
            the exact shape you asked for, the answer shows the nearest measured
            cases on either side of it.
          </p>

          <Sub id="views" title="Views" />
          <p>
            Results split into four views that never mix: <em>Exact</em>{" "}
            (matches your request), <em>Compatible</em> (close, with the
            differences listed), <em>Supported</em> (claims support, no
            measurement), and <em>Other protocols</em> (measured a different
            way). <em>Recommended</em> puts the strongest evidence first;{" "}
            <em>Newest</em> re-sorts by date. Ranks keep their meaning under any
            sort.
          </p>
          <p className="mt-3">
            To answer a whole model at once, use the{" "}
            <Link href="/models">model view</Link>: pick a model and a GPU and
            read the best known implementation per operation, with the gaps
            stated. The same answer is served at{" "}
            <span className="font-mono text-small">
              /api/v1/models/{"{slug}"}?gpu=
            </span>
            .
          </p>
        </Section>

        <Section id="results" title="Reading a result">
          <p>
            Every number carries three facts: what it is comparable to, how it
            ranks, and how much evidence backs it.
          </p>

          <Sub id="comparability" title="Comparability" />
          <p>
            Runs are compared only inside a cohort: runs that measured the same
            thing the same way. Same workload, same protocol, same environment,
            same correctness bar. A rank means something only inside one cohort.
            Two runs that merely share a GPU name or an operation name are never
            compared.
          </p>

          <Sub id="ranking" title="Ranking" />
          <p>
            Inside a cohort, runs are ordered by latency under the frozen{" "}
            <span className="font-mono text-body">ranking-v1</span> policy. Two
            runs too close to call share a rank, shown as{" "}
            <span className="font-mono text-body">N=</span>. Every excluded run
            carries a reason code, like{" "}
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
            dense tensor-core peak. The larger of the two is the floor; the
            record's distance above it says whether there is room left. It is a
            coarse lower bound under{" "}
            <span className="font-mono text-body">headroom-v1</span>, carried
            with <span className="font-mono text-small">basis: estimate</span>{" "}
            everywhere it appears, and never evidence: a kernel can sit well
            above it for good reasons, and a GPU outside the datasheet table
            gets no estimate at all.
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
            Levels come from stored facts; a submitter cannot pick one. Whether
            you can actually use a kernel (license, install, hardware) is
            tracked separately: the fastest result and the fastest one you can
            deploy are often different rows.
          </p>
          <p className="mt-3">
            Run pages also collect community attestations: <em>reproduced</em>,{" "}
            <em>could not reproduce</em>, an <em>environment note</em>, or a{" "}
            <em>regression observed</em>, each with an optional measured value
            and evidence link. They accumulate beside the evidence; only a
            KernelIndex-controlled rerun changes its level.
          </p>
        </Section>

        <Section id="use" title="Using a kernel">
          <p>
            Every implementation page opens with <em>Use it</em>. Three cases:
          </p>
          <ul className="mt-3 list-disc space-y-2.5 pl-5">
            <li>
              A package exists: copy the install command. The revision is
              pinned, so what you install is what was measured.
            </li>
            <li>
              No package, but the source is mirrored: vendor it. Copy the file
              from the page, or run{" "}
              <span className="font-mono text-small">
                ki use &lt;implementation&gt;
              </span>{" "}
              to write it locally with the commit, license, and digest recorded
              in a header comment.
            </li>
            <li>
              No public source: the row is benchmark evidence only, and says so.
            </li>
          </ul>
          <p className="mt-3">
            Every run page has a <em>Cite this record</em> action: permalink,
            digest, and access date.
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

# the ki CLI (apps/cli): stable --json for machines:
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
            need no key. A key from <Link href="/account">your account</Link>{" "}
            raises the daily quota; send it as{" "}
            <span className="font-mono text-small">
              Authorization: Bearer ki_…
            </span>{" "}
            (CLI: <span className="font-mono text-small">--api-key</span> or{" "}
            <span className="font-mono text-small">$KI_API_KEY</span>). Over
            quota returns 429 with Retry-After. Keys are stored as hashes and
            revocable anytime.
          </p>

          <Sub id="precedents" title="Precedents" />
          <p>
            Two different questions. <em>Resolve</em> asks which indexed
            implementation could serve your workload as it stands.{" "}
            <em>Precedents</em> asks what code to study before writing a new
            one: for a problem the index may never have seen, it returns the
            implementations most likely to carry transferable optimization
            ideas, ranked by transferability (same computation, same or adjacent
            GPU architecture, adjacent shape, record standing, shared
            techniques) with the reasons stated. It is a study priority, never a
            benchmark ranking.
          </p>
          <pre className="plate mt-3 overflow-x-auto px-4 py-3 font-mono text-small leading-relaxed text-muted">
            {`ki precedents --op gqa-paged-decode --gpu B200 --dtype bf16 tokens=4096
curl -X POST https://kernelindex.com/api/v1/precedents \\
  -H "Content-Type: application/json" \\
  -d '{"operation": {"family": "attention"}, "environment": {"hardwareProduct": "B200"}}'`}
          </pre>

          <Sub id="agents" title="Agents" />
          <p>
            Point an agent at <a href="/llms.txt">/llms.txt</a>: one page
            listing what this index can claim and every machine surface. MCP is
            hosted; one URL is the whole setup:
          </p>
          <pre className="plate mt-4 overflow-x-auto px-4 py-3 font-mono text-small leading-relaxed text-muted">
            {`{ "mcpServers": { "kernelindex": { "url": "https://kernelindex.com/mcp" } } }

claude mcp add --transport http kernelindex https://kernelindex.com/mcp`}
          </pre>
          <p className="mt-3">
            Over stdio instead:{" "}
            <span className="font-mono text-small">
              npx -y @kernelindex/mcp
            </span>{" "}
            (<span className="font-mono text-small">KI_API</span> overrides the
            API base, <span className="font-mono text-small">KI_API_KEY</span>{" "}
            raises the quota). Both run the same eighteen read-only tools over
            the public REST API.
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
            A record is the fastest eligible run in one cohort, nothing more.
            The <Link href="/records">ledger</Link> replays the append-only run
            history: a record can be beaten or retracted, never edited. Any two
            runs go side by side on <Link href="/compare">compare</Link>. A
            source&apos;s own reference implementation that nobody has entered
            against counts as coverage, not a record; the ledger hides these by
            default and labels them <em>baseline · unbeaten</em>.
          </p>
          <p className="mt-3">
            Every run page has <em>Report an issue</em>; no account needed. An
            accepted report retracts or supersedes the record, and the history
            stays visible. The <Link href="/feed">feed</Link> lists what the
            index learned over the trailing 30 days: record breaks, imports,
            corrections, and accepted claims. Signed in, <em>Following</em>{" "}
            narrows it to the cohorts, operations, projects, GPUs, and models
            you follow.
          </p>
          <p className="mt-3">
            Every <Link href="/projects">project</Link> has a page with the
            records it holds and every kernel it measured. Authors can claim
            theirs: a GitHub-hosted project is claimed in one click by the login
            that owns the repository path; anything else goes through reviewed
            evidence. A claim grants attribution, never the right to edit
            evidence.
          </p>
          <p className="mt-3">
            To contribute evidence, validate a submission and preview where it
            would place:{" "}
            <span className="font-mono text-small">ki submit record.yaml</span>,
            then <span className="font-mono text-small">--send</span> with an
            API key. <Link href="/submit">Contribute →</Link>
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
                  Serving results are kept apart from kernel results. Configs
                  counts distinct launch configurations.
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
            A weekly job re-imports every source; anything unexpected stops that
            source before it writes, and an invariant checker audits the whole
            catalog after. The report lives at{" "}
            <a href="https://github.com/SamMausberg/KernelIndex/blob/main/registry/reports/source-health.json">
              registry/reports/source-health.json
            </a>
            ; versioned catalog exports live under{" "}
            <a href="https://github.com/SamMausberg/KernelIndex/tree/main/registry/exports">
              registry/exports
            </a>
            . Something wrong? Every run page has a report action. Corrections{" "}
            <a href="#records">retract or supersede</a>, never rewrite.
          </p>
        </Section>

        <Section id="versions" title="Versions">
          <p>
            Semantics change only by publishing a new version. Current:
            manifests{" "}
            <span className="font-mono text-small">
              kernelindex.dev/v1alpha1
            </span>{" "}
            (
            <a href="https://github.com/SamMausberg/KernelIndex/tree/main/registry/schemas">
              schemas
            </a>
            ), ranking <span className="font-mono text-small">ranking-v1</span>,
            deployability{" "}
            <span className="font-mono text-small">deployability-v1</span>,
            serving <span className="font-mono text-small">serving-v1</span>.
            Every response names the version it ranked under; every import
            records its parser version. Published runs and their digests never
            change. Method history:{" "}
            <a href="https://github.com/SamMausberg/KernelIndex/commits/main/docs/ENGINEERING_DESIGN.md">
              the design doc&apos;s git log
            </a>
            .
          </p>
        </Section>

        <Section id="privacy" title="Privacy">
          <p>
            A few first-party counters: a search happened, a result was opened.
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
