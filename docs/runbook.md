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

## Accounts and roles

- Sign-in is GitHub OAuth only (Better Auth). Production needs three
  Vercel env vars: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (from a
  GitHub OAuth App with callback
  `https://kernelindex.com/api/auth/callback/github`), and `AUTH_SECRET`
  (≥32 random chars; `openssl rand -base64 32`). `SITE_ORIGIN` must be
  `https://kernelindex.com` — Better Auth derives cookie/CSRF origin from
  it. Missing `AUTH_SECRET` fails the production env boundary on purpose.
- Roles are KernelIndex rows in `user_roles`, granted only by maintainer
  command after the user has signed in once:
  `DATABASE_URL=<prod> node apps/web/scripts/grant-role.ts <email> owner`
  (`owner` supersedes `site_admin`; `--revoke` removes). Every grant is an
  audit event.

## Secret rotation (§18.3)

Per secret: where it is generated → where it is set → what to redo.

- `AUTH_SECRET` — generated locally → Vercel env → redeploy (all sessions
  sign out; acceptable).
- `GITHUB_CLIENT_SECRET` — GitHub OAuth App settings → Vercel env →
  redeploy.
- `REVALIDATE_TOKEN` — generated locally → Vercel env + GitHub Actions
  secret (rotate as a pair) → redeploy.
- `DATABASE_URL` — Neon role password reset → Vercel env + Actions secret
  → redeploy. Known gap: web and importer share one role; a separate
  import-only Neon role is config-only work when wanted.

## Incident capabilities

Kill switches that exist today: `IMPORTS_ENABLED=false` (repo variable,
stops scheduled imports), `SERVING_CATALOG_ENABLED=false` (hides the
serving surface), `vercel rollback` (bad deploy), run retraction (bad
data, §10.7), Neon PITR (catastrophic recovery). Vulnerability intake:
GitHub private vulnerability reporting (SECURITY.md).
