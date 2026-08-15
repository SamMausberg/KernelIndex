# Source legal and import policy (§14.10)

One entry per source: terms, per-artifact redistribution status, what
KernelIndex stores versus links, attribution, takedown route, and review
date. A source may contribute metadata without contributing performance
records. Never infer redistribution rights from public availability.

Standing takedown policy for every source: a rights-holder request to
legalnotices@ the project contact removes the contested records immediately
(retraction, preserving the audit trail), before any dispute.

## NVIDIA SOL-ExecBench (active — `sol-execbench`)

- **Channels and terms.** Three distinct channels with different terms:
  1. GitHub repo `nvidia/sol-execbench` — **Apache-2.0** (verified
     2026-08-14). Harness, docs, and `examples/` definitions/solutions are
     redistributable with attribution.
  2. Public leaderboard API
     (`research.nvidia.com/benchmarks/sol-execbench/api`) — governed by the
     NVIDIA website Terms of Service (browsewrap). `robots.txt` does not
     disallow `/benchmarks/`. The ToS restricts automated collection "through
     any means not purposely made available through the Site"; these JSON
     endpoints are the leaderboard page's own purposely public API. Imported
     facts: kernel names/tags/axes/shapes/dtypes, workload axis values,
     baseline and speed-of-light latencies, submission results.
  3. Hugging Face dataset `nvidia/SOL-ExecBench` — **NVIDIA Evaluation
     Dataset License** (verified 2026-08-14): internal evaluation only, no
     hosting/redistribution of dataset content. **The importer must never
     read this dataset**, and no dataset content (reference implementations,
     input tensors, per-case tolerances, case UUIDs) may be republished.
     Exception: §1 of that license permits publishing *results of your own
     evaluation* — Sam's locally produced traces via `--snapshot` are that
     path.
- **Store vs link.** Store: API snapshots (bounded, digested), normalized
  manifests derived from API facts. Link: submission identity (no source
  code is published upstream). Never store: anything from the HF dataset.
- **Attribution.** Source name "NVIDIA SOL-ExecBench" on every derived page;
  trademarks used descriptively only.
- **Load.** Sequential fetches with spacing (`FETCH_SPACING_MS`), one
  list + two calls per kernel per import; scheduled imports at most daily.
- **Risk note.** The website ToS also contains a broad non-commercial
  clause. Current use (free public index, attribution, facts only, robots
  respected, trivial load, instant takedown) is a good-faith posture, not a
  written permission. Open item: ask the SOL team for explicit blessing.
- **Parser owner / review.** `import/sol`, reviewed 2026-08-14.

## GPU MODE KernelBot (active — `gpumode-kernelbot`)

- **Data.** HF dataset `GPUMODE/kernelbot-data` under the **June 9
  Researcher Reciprocity License v1.0** (verified 2026-08-14): explicit
  grant to reproduce, publicly display, and distribute the dataset and
  derivatives; conditions are notice retention and attribution ("GPU Mode
  and the KernelBot dataset", link to the dataset). The use-based
  restriction covers AI training only — not indexing.
- **Store vs link.** Store: per-submission metrics, protocol/system
  metadata, normalized manifests, and — decided 2026-08-15, reversing the
  earlier link-only stance — **submission source code mirrored inline as
  content-addressed artifacts** (the grant covers reproduction, display,
  and distribution; mirroring is what enables on-site source display and
  submission diffs, the product's core value). Each submission's own
  license remains unknown and is never inferred; artifacts record
  `LicenseRef-GPUMode-Reciprocity-1.0` as KernelIndex's display right.
  Truncated code cells are never stored.
- **Attribution.** "GPU Mode and the KernelBot dataset" with dataset link,
  rendered on every page displaying imported data or mirrored code
  (`sources.policy` drives the read layer).
- **Protocol provenance.** Cite the matching `gpu-mode/reference-kernels`
  eval revision (same license family) per problem set.
- **Operational note (2026-08-15).** datasets-server `/rows` is permanently
  broken for the `amd_1_1m_competition` and `nvidia_nvfp4_submissions`
  configs (parquet scan limit); use `/filter`, whose first query per config
  builds an index upstream (minutes of 500s — retry generously).
- **Parser owner / review.** `import/gpumode` (parser v2), reviewed
  2026-08-15.

## FlashInfer-Bench (planned)

- HF dataset `flashinfer-ai/flashinfer-trace`, **Apache-2.0** (verified
  2026-08-14). Redistribution fine with license notice. Import baseline
  (human/library) traces first; agent-generated traces only with explicit
  author labeling. Overlaps SOL definitions (FlashInfer-Bench tag) —
  reconcile identities, never auto-merge on names (§14.4).

## Liger-Kernel (planned)

- `linkedin/Liger-Kernel` committed benchmark CSVs, **BSD-2-Clause**
  (verified 2026-08-14). Redistribution fine with notice. Environment
  metadata is incomplete (no CUDA/driver): rows import as reported evidence
  with explicit environment-unknown caveats, never as strict cohorts.

## Rejected or blocked (reviewed 2026-08-14)

- **HF dataset `nvidia/SOL-ExecBench`** — license forbids redistribution
  (see above). Never fetch in leaderboard mode.
- **Artificial Analysis** — redistribution requires a commercial contract.
- **HF LLM-perf leaderboard** — stale (2024), no data license.
- **PyTorch HUD / ClickHouse benchmark DB** — best-in-class operator data
  but credential-gated with no data license; revisit after requesting
  access from PyTorch Dev Infra.
- **DeepGEMM / FlashMLA / ThunderKittens / CUTLASS / Triton** — no
  structured published results; README prose only. Reconsider as
  implementation-registry metadata, not records.

## Serving-domain candidates (Phase 3, §8.16)

- **MLPerf Inference** result repos (`summary_results.json`) — Apache-2.0
  (v5.1+, verified); presentation must follow the MLPerf Results Messaging
  Guidelines (comparable results only, trademark rules, label any derived
  normalization such as per-accelerator division as unofficial).
- **InferenceX (SemiAnalysis)** — Apache-2.0 repos, weekly DB dumps as
  GitHub releases; confirm the dumps' license explicitly before import.
- **vLLM / SGLang HUD data** — right metrics, no sanctioned bulk access and
  no data license today; do not scrape.
