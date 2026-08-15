# GPU MODE importer golden fixtures

Real datasets-server responses for `GPUMODE/kernelbot-data` (June 9
Researcher Reciprocity License v1.0 — redistribution with attribution to
GPU Mode and the KernelBot dataset; see docs/source-policy.md). Origins:

- `api/leaderboards.json` — the `leaderboards` config rows sliced to the
  three curated AMD boards (amd-fp8-mm, amd-mixture-of-experts,
  amd-mla-decode).
- `api/fp8-mm-top.json` — the top two `amd_successful_submissions` rows for
  amd-fp8-mm (ranked by `run_score`), with `code` nulled (the importer now
  mirrors code, so tests inject small inline code strings where the artifact
  path is exercised) and `run_result` trimmed to the first three benchmarks
  (`benchmark-count` adjusted to match). Both rows are the same user —
  deliberately, to pin the per-user dedupe.

Refreshing any file changes parser goldens; review the diff like any other
source-schema drift (§14.8).
