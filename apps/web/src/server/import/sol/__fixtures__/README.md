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
- `api/kernels.json`, `api/submissions.json`, `api/kernel-4.json` — real
  leaderboard API responses (`/api/kernels`, `/api/submissions?kernel_id=4`,
  `/api/kernels/4`) sliced or pretty-printed. Only the public leaderboard API
  is ever snapshotted here — never the Hugging Face dataset, whose NVIDIA
  Evaluation Dataset License forbids redistribution (docs/source-policy.md).

Refreshing any file changes parser goldens; re-run the importer tests and
review the diff like any other source-schema drift (§14.8).
