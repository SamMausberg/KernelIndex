# MLPerf importer golden fixtures

Reviewed, deliberately committed source snapshots (§6.2, §21.3), sliced
verbatim from the Apache-2.0 official result repos:

- `summary-v6.0-slice.json` — 13 rows of
  `mlcommons/inference_results_v6.0` `summary_results.json` at commit
  `4d3916ac9cf474b679cdfcf492d43a0559418ad1`: in-scope LLM rows across
  models/scenarios/submitters (including one multi-node system) plus one
  open-division, one non-datacenter, one non-LLM, and one
  non-token-throughput row for skip coverage.
- `summary-v5.1-slice.json` — 4 rows of `inference_results_v5.1` at commit
  `5ea4f62ef62536e6bf4d78a9b440fb9035ddfb4a` (shape parity: v5.1 rows lack
  the `Total Accelerators` field), covering mixtral-8x7b, llama3.1-405b,
  and llama2-70b Server.

Refreshing any file changes parser goldens; re-run the importer tests and
review the diff like any other source-schema drift (§14.8).
