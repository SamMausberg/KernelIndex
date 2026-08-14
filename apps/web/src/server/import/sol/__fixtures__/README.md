# SOL importer golden fixtures

Reviewed, deliberately committed source snapshots (§6.2, §21.3). Origins:

- `rmsnorm/definition.json`, `rmsnorm/solution_cuda.json` — verbatim from
  `nvidia/sol-execbench` `examples/cuda_cpp/rmsnorm/` (Apache-2.0).
- `rmsnorm/workload.jsonl` — first 4 of 14 lines of the same example's
  workload file (subset for test size).
- `rmsnorm/trace.jsonl` — the Trace format from the repository's
  `docs/trace.md` example, re-keyed to this fixture's definition, solution,
  and workload UUIDs so the golden pipeline resolves end to end. Its numbers
  are documentation examples, not measurements; it exists to test parsing and
  publication, and is never imported into a real catalog.
- `api/kernels.json`, `api/submissions.json` — real leaderboard API responses
  (`/api/kernels`, `/api/submissions?kernel_id=4`) sliced to a few entries.
- `api/dataset-row-004.json` — one real row from the Hugging Face dataset
  (`nvidia/SOL-ExecBench`, config `L1`) via the datasets-server rows API.

Refreshing any file changes parser goldens; re-run the importer tests and
review the diff like any other source-schema drift (§14.8).
