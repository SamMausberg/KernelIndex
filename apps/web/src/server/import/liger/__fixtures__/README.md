# Liger importer golden fixtures

Real rows from `linkedin/Liger-Kernel` `benchmark/data/all_benchmark_data.csv`
(BSD-2-Clause; see docs/source-policy.md), sliced at commit `2120862`:

- `all-benchmark-data-slice.csv` — nine rows chosen to pin every reconcile
  path: curated speed rows (rms_norm on A100 bf16, fused_add_rms_norm on
  H100 fp32, rope H-sweep, embedding with torch_compile), one uncurated
  kernel (fused_moe), and one memory row (skipped and counted).

Refreshing this file changes parser goldens; review the diff like any other
source-schema drift (§14.8).
