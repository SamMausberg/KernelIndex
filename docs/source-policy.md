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
- **Load.** Sequential fetches with spacing (`FETCH_SPACING_MS`), one list
  plus a detail call and one to two submission pages per kernel per import.
  The submissions endpoint answers with the newest 20 unless `limit` is
  given, caps a page at 50, and serves nothing past offset 50, so a full
  walk of 235 kernels is roughly 700 requests — still trivial load.
  Re-verified 2026-08-24: `research.nvidia.com/robots.txt` disallows
  `/core/`, `/profiles/`, `/admin/`, `/search/` and similar, and nothing
  under `/benchmarks/`. SOL stays **manual-only** (no scheduled growth), per
  the 2026-08-20 decision.
- **Selection (2026-08-24).** A kernel's records are its distinct
  submitters' personal bests first, then next-best attempts if `--top`
  leaves room. Ranking the raw list instead let one prolific submitter fill
  the whole quota, which is the opposite of what a leaderboard index is
  for.
- **Risk note.** The website ToS also contains a broad non-commercial
  clause. Current use (free public index, attribution, facts only, robots
  respected, trivial load, instant takedown) is a good-faith posture, not a
  written permission. Open item: ask the SOL team for explicit blessing.
- **Parser owner / review.** `import/sol`, reviewed 2026-08-14.

## GPU MODE KernelBot (active — `gpumode-kernelbot`)

- **Data.** HF dataset `GPUMODE/kernelbot-data` under the **June 9
  Researcher Reciprocity License v1.0** (verified 2026-08-14, re-verified
  2026-08-24 against the repo's `LICENSE`): explicit grant to reproduce,
  publicly display, and distribute the dataset and derivatives; conditions
  are notice retention and attribution ("GPU Mode and the KernelBot
  dataset", link to the dataset). The use-based restriction covers AI
  training only — not indexing.
- **Channels (2026-08-24).** Two, both the same rows under the same licence:
  1. The dataset's parquet files on the Hugging Face-generated
     `refs/convert/parquet` branch, read column-wise over HTTP byte ranges
     at a revision pinned per import. This is the discovery channel. It
     exists because mirrored submission source is 80–99.7% of every config's
     bytes (`nvidia_nvfp4_submissions`: 2,239 MB of `code` against 6 MB of
     every other column across 231,307 rows), so reading the ranking facts
     alone is ~10 MB for the whole 532k-row corpus instead of 8 GB.
     Byte-range reads redirect to signed CDN hosts under `*.hf.co`, which
     the fetch allowlist admits by suffix; every other §14.9 guard (HTTPS
     only, no IP literals, private-range rejection, redirect revalidation)
     still applies per hop.
  2. `datasets-server` `/filter`, used only to pull mirrored source for the
     submissions selection kept. Parquet cannot serve this: these files
     carry no page index, so plucking two scattered rows out of the `code`
     column costs the whole 2.2 GB column chunk (measured 2026-08-24).
     `robots.txt` on `huggingface.co` is `Allow: /`.
- **Store vs link.** Store: per-submission metrics, protocol/system
  metadata, normalized manifests, and — decided 2026-08-15, reversing the
  earlier link-only stance — **submission source code mirrored inline as
  content-addressed artifacts** (the grant covers reproduction, display,
  and distribution; mirroring is what enables on-site source display and
  submission diffs, the product's core value). Each submission's own
  license remains unknown and is never inferred; artifacts record
  `LicenseRef-GPUMode-Reciprocity-1.0` as KernelIndex's display right.
  Truncated code cells are never stored.
- **Mirroring scope (2026-08-24).** Source is mirrored for each author's
  personal best per cohort, and for any submission the catalog already
  mirrors. Progression milestones are metadata-only. Source presence is part
  of an implementation's digest, so the second clause is not a courtesy: a
  row republished without the code it was published with would shadow its
  own page. For the same reason a selected submission whose source cannot be
  fetched is **held back with an issue** rather than imported in a degraded
  shape — the record waits for a run that can mirror it.
- **Attribution.** "GPU Mode and the KernelBot dataset" with dataset link,
  rendered on every page displaying imported data or mirrored code
  (`sources.policy` drives the read layer).
- **Protocol provenance.** Cite the matching `gpu-mode/reference-kernels`
  eval revision (same license family) per problem set.
- **Operational note (2026-08-15).** datasets-server `/rows` is permanently
  broken for the `amd_1_1m_competition` and `nvidia_nvfp4_submissions`
  configs (parquet scan limit); use `/filter`, whose first query per config
  builds an index upstream (minutes of 500s — retry generously).
- **Parser owner / review.** `import/gpumode` (parser v3: column-wise
  parquet discovery over the whole population, source mirrored per kept row;
  v2 paged the rows API and saw a ranked slice). Row facts and every derived
  digest are unchanged between v2 and v3. Reviewed 2026-08-24.
- **Curation gate.** A board's curated `gpus` list is the review record for
  its runner fleets. Discovery now sees every runner label in the data, so
  an unlisted one is counted into a drift warning and its rows are skipped —
  never minted into an environment with an `unknown` architecture.
- **Known modelling limit (2026-08-24).** An implementation's slug is
  per-submission, but its manifest states the hardware the submission ran
  on, so a submission evaluated on several runners cannot be one page. Those
  submissions are skipped with a drift warning. Measured across the whole
  corpus: 9 of 5,026 trimul submissions (the one board fielded on four GPU
  types) and none in any other config. The real fix is to separate
  implementation identity from the runner, which would move every existing
  digest — a deliberate migration, not a side effect of an import.
- **Digest stability (verified 2026-08-24).** Rebuilding the implementation
  manifests of already-published submissions from the parquet channel and
  the source the catalog already mirrors reproduced the stored digests for
  447 of 447 submissions across `trimul_submissions`, `pmpp_v2_submissions`
  and `nvidia_nvfp4_submissions`, with the multi-runner submissions above
  excluded. v2 and v3 describe the same rows.

## FlashInfer-Bench (active — `flashinfer-bench`)

- HF dataset `flashinfer-ai/flashinfer-trace`, **Apache-2.0** (verified
  2026-08-14). Redistribution fine with license notice. Imported 2026-08-15:
  baseline (human/library) solutions and traces. Extended 2026-08-20 with
  Sam's sign-off: **model-authored (LLM-generated) solutions and traces
  import on explicit author-directory opt-in** (`--authors`), labeled
  `role: llm-generated` with the generating model named on the
  implementation manifest and the `role` column — they can never read as
  human/library baselines. Failed traces (upstream `"NaN"` error bounds,
  status INCORRECT_NUMERICAL) import as failed-run evidence. The `sampling`
  trace directory has no solutions and stays out. Solution sources are
  mirrored inline as content-addressed artifacts (Apache-2.0 permits it;
  enables on-site source display).
  Overlaps SOL definitions (FlashInfer-Bench tag) — identical semantics
  dedupe by canonical digest; slug-vs-digest conflicts surface as review
  ambiguities, never auto-merge on names (§14.4). Every run is fetched at
  one pinned dataset revision. LFS-tracked trace files whose downloads
  redirect off the fetch allowlist are skipped with a review issue.
- **Parser owner / review.** `import/flashinfer` (parser v3: author-directory
  selection with llm-generated labeling; v2 accepted upstream "Infinity"
  error bounds as no-bound and reviewed unknown-definition solutions as
  ambiguities), reviewed 2026-08-20.

## Liger-Kernel (active — `liger-kernel-bench`)

- `linkedin/Liger-Kernel` committed benchmark CSV
  (`benchmark/data/all_benchmark_data.csv`), **BSD-2-Clause** (verified
  2026-08-14). Redistribution fine with notice. Environment metadata is
  incomplete (no CUDA/driver/torch versions): environments carry hardware
  only, the Liger release rides run labels, and the protocol's comparability
  notes state the caveat.
- The CSV spans benchmark-script eras. Only kernels whose tensor semantics
  were verified against the producing script import (curated in
  `apps/web/src/server/import/liger/kernels*.ts`); every other kernel or
  config shape is counted and skipped in the import report. Timed passes
  (forward/backward/full) are separate protocols; memory rows are skipped.
- **Curation completed 2026-08-20:** the remaining 25 kernels were verified
  against era-exact script revisions (the last commit touching each
  `benchmark_<kernel>.py` at its rows' timestamps — the 2026-04/05 benchmark
  refactors changed config semantics, so the current scripts are not
  authoritative for older rows). Every upstream speed row now binds;
  megatron_cross_entropy imports TP=1 rows only.

## Rejected or blocked (reviewed 2026-08-14)

- **HF dataset `nvidia/SOL-ExecBench`** — license forbids redistribution
  (see above). Never fetch in leaderboard mode.
- **Artificial Analysis** — redistribution requires a commercial contract.
- **KernelBench (`ScalingIntelligence/KernelBench`)** — MIT verified
  2026-08-24, and `results/timing/` publishes H100 baselines (mean/std/min/
  max, 100 trials, torch 2.5.0+cu124) for 250 problems in both eager and
  inductor form: the most complete protocol metadata of any candidate, and
  a direct fill for the empty H100 hero cells. Deferred, not rejected —
  admitting it means deriving 250 operation specs from the problem files.
- **HF LLM-perf leaderboard** — stale (2024), no data license.
- **PyTorch HUD / ClickHouse benchmark DB** — best-in-class operator data
  but credential-gated with no data license; revisit after requesting
  access from PyTorch Dev Infra.
- **DeepGEMM / FlashMLA / ThunderKittens / CUTLASS / Triton** — no
  structured published results; README prose only. Reconsider as
  implementation-registry metadata, not records.

## MLPerf Inference (active — `mlperf-inference`)

- **Data.** Per-round GitHub result repos
  `mlcommons/inference_results_v5.1` and `_v6.0`, each **Apache-2.0**
  (LICENSE.md verified per repo 2026-08-16). The importer reads only the
  root `summary_results.json` at a pinned commit per round (immutable
  official results), filtered to **closed division, datacenter suite,
  token-throughput LLM benchmarks** — official published results as-is,
  never per-accelerator division or any derived normalization.
- **Store vs link.** Store: the summary snapshot (digested) and normalized
  manifests (model/stack/configuration/workload/run facts stated by the
  rows and the published inference rules). Link: each entry's official
  `Details`/`Code` URLs and per-result logs — not mirrored in v1.
- **Declared SLOs.** Server/Interactive TTFT/TPOT bounds are transcribed
  from `mlcommons/inference_policies` `inference_rules.adoc` with that URL
  as sourceRef on every workload manifest — cited facts of the benchmark
  definition, never measurements.
- **Attribution and messaging.** Every derived page names "MLPerf™
  Inference <round>", the division/suite, submitter, system, and entry ID,
  with a link to the official results. MLPerf™ is a trademark of MLCommons,
  used to identify official published results only; results are shown
  unmodified per the MLPerf Results Messaging Guidelines and never mixed
  into kernel leaderboards or reduced to a universal score (§2.2, §22.10).
- **Load.** Two raw-file fetches per import (one summary per round), pinned
  revisions, weekly at most.
- **Earlier rounds (reviewed 2026-08-20).** `_v5.0` has the root summary
  (17,454 rows, ~344 in-scope LLM runs) but the repo has never carried a
  LICENSE file (GitHub license: null at `0bc17ab3f4b3`; every sibling round
  is Apache-2.0, so likely an upstream oversight) — blocked until MLCommons
  adds one; its 27.7 MB summary also exceeds the 8 MB fetch cap and would
  need a snapshot mode. `_v4.1` (`198fc46799b3`) and `_v4.0`
  (`343c3d2cb03f`) are Apache-2.0-verified but predate the root
  `summary_results.json` tooling — importable only via per-submitter result
  trees, out of scope for the summary importer. If `_v5.0` is admitted
  later: `llama2-70b-interactive-99/-99.9` are distinct benchmark names,
  not a Scenario value, and need BENCHMARKS entries mapping to the base
  Llama-2-70B model.
- **Edge suite (reviewed 2026-08-24, not admitted).** The closed edge suite
  is 55 rows in `_v5.1` and 53 in `_v6.0`, of which exactly **one** is
  token-throughput LLM (`llama3.1-8b-edge`, Offline, Intel, v5.1); the rest
  report Latency (ms) or Samples/s for benchmarks outside the serving
  domain. Admitting it properly would need a suite dimension in workload
  identity (edge and datacenter both run an "Offline" scenario and must
  never share a cohort) plus edge SLO facts transcribed from the inference
  rules — a cited-facts change, for one record. Not worth it; revisit if a
  later round submits edge LLM results in numbers.
- **Parser owner / review.** `import/mlperf` (parser v1), reviewed
  2026-08-16; scope re-reviewed 2026-08-24.

## Serving-domain candidates (Phase 3, §8.16)
- **InferenceX (SemiAnalysis)** — reviewed 2026-08-20: weekly Postgres
  dumps ship as release assets of `SemiAnalysisAI/InferenceX-app`, a
  **GPL-3.0** repo (only the harness repo `SemiAnalysisAI/InferenceX` is
  Apache-2.0, and it distributes no dumps). No data license anywhere:
  release notes carry only restore instructions, no DATA_LICENSE, and
  READMEs/docs never mention licensing. **Blocked** until SemiAnalysis
  states a redistribution license for the dumps. Once unblocked, dumps are
  1.5–3.9 GB pg_restore custom-format and need a local-snapshot path; the
  metric fit is excellent (per-GPU throughput, median/p99 TTFT, TPOT, E2E
  latency across TP/concurrency/ISL/OSL sweeps).
- **Modal LLM Almanac / `modal-labs/stopwatch`** — reviewed 2026-08-24:
  the harness repo is MIT, but that covers the code, not the results. The
  almanac publishes serving benchmarks across engines, GPUs and
  concurrencies with no data license stated anywhere — no DATA_LICENSE, no
  terms on the results pages. **Blocked** until Modal states one; public
  availability is never inferred as a redistribution right. Metric fit is
  good, so it is worth asking.
- **vLLM / SGLang HUD data** — right metrics, no sanctioned bulk access and
  no data license today; do not scrape.
