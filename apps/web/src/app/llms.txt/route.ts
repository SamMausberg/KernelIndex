// llms.txt (Week 12): one paste onboards an agent — what the site is, the
// claim-language rules it must keep, and every machine surface. Served
// static; the facts here change only with the API or docs.
const BODY = `# KernelIndex

> The public performance index for GPU software. It resolves an exact
> workload (operation, shape, dtype, layout, GPU) to the fastest currently
> known compatible implementation, with source, license, benchmark
> protocol, execution environment, raw evidence, and an explicit trust
> level. Serving configurations are a separate surface with their own
> cohort semantics.

Claim rules (keep these when quoting results):
- Results rank only inside one comparison cohort. Never say "fastest"
  without naming the workload and cohort; say "fastest currently known in
  this cohort as of <timestamp>".
- Evidence levels: Reported (preserved exactly as the source published it;
  not rerun by KernelIndex), Reproducible, Verified, Replicated. The
  current corpus is Reported-tier.
- Never compare a serving throughput to a kernel latency, or two runs from
  different cohorts.

## API (JSON; reads need no key)
- Base: https://kernelindex.com/api/v1
- OpenAPI: https://kernelindex.com/api/v1/openapi.json
- GET  /search?q=rmsnorm+B200+bf16   ranked cohort with explanations; an
                                     unmeasured shape answers with "nearest",
                                     the measured cases on either side of it
- POST /resolve/kernel               exact resolution for a structured workload
- POST /resolve/kernel/batch         up to 20 structured requests in one call
- POST /precedents                   what to STUDY for a possibly unseen
                                     problem: implementations ranked by
                                     transferability with reasons (not a
                                     compatibility answer)
- GET  /operations/{idOrSlug}        semantics, cohorts, records
- GET  /models/{slug}?gpu=           best known per operation for one model on one GPU, plus gaps
- GET  /implementations/{idOrSlug}   source, install, license, revisions
- GET  /projects/{slug}              a library or author: records held, kernels, claim state
- GET  /runs/{idOrDigest}            immutable evidence dossier, with community
                                     attestations (never an evidence input)
- POST /runs/{id}/attestations       attest a reproduction or note (API key with
                                     submissions:write)
- GET  /records                      record ledger (cursor-paginated)
- GET  /feed?since=<iso>             what changed: record breaks, imports,
                                     corrections, accepted claims (30 days)
- GET  /challenges                   where the index has no good answer yet:
                                     the worklist for agents writing kernels
- POST /compare                      up to 8 runs, winner only inside one cohort
- POST /resolve/serving              objective + constraints -> feasible + Pareto
- GET  /serving-runs, /serving-configurations
- POST /submissions/preview          validate a submission (multi-manifest
                                     YAML or a flat bench record, as
                                     {"document": <text>}) and preview the
                                     cohort and rank each run would take
- POST /submissions                  submit for review (API key with
                                     submissions:write)
- API keys (higher quota): sign in at https://kernelindex.com/account

## MCP
- Hosted (Streamable HTTP): https://kernelindex.com/mcp - one URL, no install.
  This is the recommended path.
- Stdio: node apps/mcp/src/server.ts from a checkout of
  https://github.com/SamMausberg/KernelIndex. KI_API overrides the API base,
  KI_API_KEY raises the quota.
- Not on npm: @kernelindex/mcp, @kernelindex/cli and @kernelindex/sdk are not
  published yet, so \`npx -y @kernelindex/mcp\` does not resolve. Use the
  hosted URL or the checkout.
- 18 read-only tools (including find_precedents), the same set on both paths.

## CLI
- \`ki\` in apps/cli, run from a checkout (\`node apps/cli/src/ki.ts\`); not on
  npm yet. Commands: search, resolve, precedents, show, use (vendor a mirrored
  kernel source locally with provenance), compare, validate, digest;
  \`--json\` output is stable.

## Data
- Versioned zstd JSONL catalog exports:
  https://github.com/SamMausberg/KernelIndex/tree/main/registry/exports
- Atom feed of record changes: https://kernelindex.com/records/feed.xml
- Sources, freshness, and known limitations: https://kernelindex.com/docs#sources
- Methodology: https://kernelindex.com/docs
`

export function GET(): Response {
  return new Response(BODY, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control":
        "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  })
}
