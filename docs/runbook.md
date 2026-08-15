# Operations runbook (§19.6–19.7, §22.8)

## Scheduled imports

- Weekly via `.github/workflows/import.yml` (Mondays 06:17 UTC) and on
  demand via `workflow_dispatch` (choose sources).
- Per source: dry-run → machine gate (no unexpected issues/ambiguities) →
  publish → invariants → record-event sync → export snapshot commit →
  cache revalidation. Failed gates upload the JSON report as an artifact
  and stop that source without writing.
- **Kill switch:** set the repository variable `IMPORTS_ENABLED=false`.
- Secrets: `DATABASE_URL` (pooled prod), `REVALIDATE_TOKEN`; variable
  `SITE_ORIGIN`.

## Disabling one source

Run the workflow manually with `sources` set to the remainder, or set the
kill switch and import locally per source. There is no per-source flag in
the database; the workflow input is the control.

## Bad data

- Single bad run: retract it (admin page, `POST /api/v1/corrections`, or a
  maintainer script using `retractRun`). Retraction preserves the row and
  audit trail and appends the caused record transition (§10.7).
- Corrected evidence: publish the corrected run, then `markSuperseded`.
- A wrong import wave: retract affected runs; never delete published rows.

## Bad deploy / migration

- Deploys: `vercel rollback` to the previous deployment.
- Migrations are forward-only (§19.6); write a corrective migration rather
  than editing an applied one. Neon PITR covers catastrophic recovery.

## Cache staleness

`POST /api/v1/revalidate` with the bearer token drops every catalog cache
tag; otherwise pages self-refresh within 300 s (CDN JSON routes within
their `s-maxage`).

## Data-quality invariants

`pnpm --filter @kernelindex/web check:invariants` (§20.3 subset): dangling
references, supersession cycles, missing source artifacts, orphan record
events, missing primary values, digest recomputation sample, per-source
snapshot freshness. Run in the scheduled workflow; non-zero exit fails it.
