# Operations runbook (§19.6–19.7, §22.8, §22.12)

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

## Backups and restore (rehearsed 2026-08-16)

Two independent paths:

- **Neon PITR** (primary): project history retention covers point-in-time
  restore from the Neon console — create a branch at the target timestamp,
  verify, then promote or repoint `DATABASE_URL`.
- **Logical dump** (rehearsed end-to-end): the local compose container has
  the matching PG 18 client tools.

  ```bash
  PROD=$(grep '^DATABASE_DIRECT_URL=' apps/web/.env.production.local | cut -d= -f2-)
  docker exec -e PROD="$PROD" kernelindex-postgres \
    bash -c 'pg_dump "$PROD" -Fc -f /tmp/prod.dump'
  docker exec kernelindex-postgres bash -c \
    'createdb -U kernelindex kernelindex_restore &&
     pg_restore -U kernelindex -d kernelindex_restore --no-owner --no-privileges /tmp/prod.dump'
  cd apps/web && DATABASE_URL=postgres://kernelindex:kernelindex@127.0.0.1:5432/kernelindex_restore \
    node scripts/check-invariants.ts
  ```

  2026-08-16 outcome: 20 MB dump, restore identical to live prod
  (7,857 kernel runs, 722 serving runs, 2,948 record events), all
  invariants hold. Verify counts against prod before trusting a restore.

## Cache staleness

`POST /api/v1/revalidate` with the bearer token drops every catalog cache
tag; otherwise pages self-refresh within 300 s (CDN JSON routes within
their `s-maxage`).

## Data-quality invariants

`pnpm --filter @kernelindex/web check:invariants` (§20.3 subset): dangling
references, supersession cycles, missing source artifacts, orphan record
events, missing primary values, digest recomputation sample, per-source
snapshot freshness. Run in the scheduled workflow; non-zero exit fails it.

## Alerts and ownership

Sam owns every alert. The channel is GitHub workflow-failure notification:
the weekly import workflow fails on a gate, invariant, or freshness breach
and GitHub emails the repo owner. `/admin` shows the same freshness state
live. There is no pager; the product carries no SLA yet (§28.6 gates any).

## Reports and moderation

Public report intake (§15.6) lives on run and serving-run dossiers and
lands in the `reports` table (per-target daily cap; no identity stored for
anonymous reports beyond an optional contact field). Review on `/admin`:
resolve or dismiss with a note (audited); a report that warrants a
correction goes through the existing retraction/supersession path. Sam
reviews reports when the admin page shows them; the header counts them.

## Product events

First-party §20.5 counters only (`product_events`): no cookies, no user
id, no IP, no raw query text. Retention 90 days, enforced by
`scripts/prune-events.ts` in the weekly import workflow. The `/admin`
metrics panel derives the §20.4 north star from them.

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
- Self-service deletion on `/account` removes the identity row (sessions,
  keys, watches, roles cascade); submissions, claims, and audit events
  survive with the user reference detached. No maintainer action needed.

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

## Launch rehearsal (§28.5 Week-12 checklist, walked 2026-08-16)

| Item | State | Evidence |
|---|---|---|
| Serving semantics separate from kernels | pass | §22.10 notes; dedicated tables, cohorts, no shared score |
| Accessibility / Web Vitals / security audits | pass | docs/hardening.md; axe + bundle budgets in CI |
| Legal/source and privacy review | pass | docs/source-policy.md; /docs Sources + Privacy sections |
| Backup restore and rollback rehearsed | pass | restore rehearsal above; `vercel rollback`; forward-only migrations |
| Coverage and known limitations explicit | pass | /coverage (live counts, freshness, limitations) |
| Correction, dispute, takedown, moderation | pass | report intake on dossiers → /admin review → retraction path; SECURITY.md |
| Docs current (quick start → runbooks) | pass | /docs (start, syntax, API/CLI/MCP, agents, versions); this runbook |
| One caveat | note | GitHub OAuth prod credentials are the remaining manual step (see Accounts and roles); until set, sign-in states it is unconfigured and the PR contribution path still works |
