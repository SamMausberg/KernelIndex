# FlashInfer-Bench importer golden fixtures

Reviewed, deliberately committed source snapshots (§6.2, §21.3), all from the
Apache-2.0 Hugging Face dataset `flashinfer-ai/flashinfer-trace` at revision
`da915083d4c7c5e61aa3005e3d17ae488e0fc71c`:

- `dataset/info.json` — the dataset API listing (`/api/datasets/...`) with
  `siblings` trimmed to the three files below (subset for test size).
- `dataset/definition.json` — verbatim
  `definitions/rmsnorm/fused_add_rmsnorm_h2048.json`.
- `dataset/solution.json` — verbatim
  `solutions/baseline/rmsnorm/fused_add_rmsnorm_h2048/flashinfer_wrapper_74a870.json`.
- `dataset/trace.jsonl` — first 3 lines of
  `traces/baseline/rmsnorm/fused_add_rmsnorm_h2048.jsonl` (subset for test
  size). Real B200 baseline measurements; used only to test parsing and
  publication, never imported into a real catalog by the test suite.
- `dataset/llm-solution.json` — verbatim
  `solutions/claude-opus-4-1-20250805/rmsnorm/fused_add_rmsnorm_h2048/claude-opus-4-1_triton_c9eea2.json`,
  a model-authored solution for the llm-generated labeling tests.
- `dataset/llm-trace.jsonl` — the 2 lines of
  `traces/claude-opus-4-1-20250805/rmsnorm/fused_add_rmsnorm_h2048.jsonl`
  referencing that solution at batch sizes 6 and 1 (subset for test size).

Refreshing any file changes parser goldens; re-run the importer tests and
review the diff like any other source-schema drift (§14.8).
