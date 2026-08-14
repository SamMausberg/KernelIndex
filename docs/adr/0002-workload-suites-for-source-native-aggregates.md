# 0002. Workload suites for source-native aggregate evidence

Date: 2026-08-14

## Context

ENGINEERING_DESIGN.md §8.11 models a kernel `BenchmarkRun` against one
concrete `WorkloadCase`, with suite scores derived from per-case runs
(§11.7). The first real source diverges from that assumption: the public
SOL-ExecBench leaderboard publishes, per submission, one suite-mean latency
and a SOL-Score aggregated over the definition's full workload list (for
example 14–16 cases). Per-case Trace files exist in the harness but are not
published for leaderboard submissions. Importing an aggregate as if it were a
single-case measurement would violate the no-false-precision invariant
(§2.2); refusing it entirely would leave Week 2 with no real records.

## Decision

Add the `WorkloadSuite` manifest kind (already named in §9.1's initial kind
list) in Week 2 instead of later: an immutable case list (external IDs plus
axis bindings), a correctness policy reference, and an explicit aggregation
rule. Suites are stored in the existing `workloads` table; `BenchmarkRun`
may bind either a case or a suite. Leaderboard submissions import as
suite-scoped runs with `sourceNative` metrics (SOL-Score, raw latency in
milliseconds, average speedup), primary statistic `mean`, comparison profile
`source_native`, and derived trust `reported`. Official per-case Trace files
import unchanged as case-scoped runs (the gold-record path via
`import:sol --snapshot`).

## Alternatives considered

- Map submission aggregates to a single representative case: false
  precision; rejected.
- Skip leaderboard evidence until traces are public: leaves the Week 2 gate
  ("10 to 20 reviewed real records") unsatisfiable from public data.
- A dedicated suite-score table outside `benchmark_runs`: a third evidence
  store before Week 4's derived-records work; more schema for no added
  honesty.

## Consequences

- Suite runs and case runs never share a comparison key (workload digests
  differ), so aggregates can never outrank exact per-case evidence.
- The run page shows the suite label ("suite of N cases · mean latency")
  and the preserved raw source metrics.
- §11.7-style derived suite scores from per-case runs remain future work and
  are unaffected.

## Security and data implications

None beyond existing import handling; suites carry no executable content.

## Revisit triggers

- SOL publishes per-case traces for leaderboard submissions.
- Week 4 ranking work lands and derived suite scores become computable from
  per-case runs.

## References

- ENGINEERING_DESIGN.md §2.2, §8.5, §8.11, §9.1, §11.7, §14.5
- https://github.com/nvidia/sol-execbench (docs/trace.md, docs/workload.md)
- https://research.nvidia.com/benchmarks/sol-execbench
