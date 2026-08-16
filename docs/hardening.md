# Week 10 hardening review (2026-08-16)

The §22.11 threat-model review: §18.1 threat → current control → gap or
accepted risk. Tests named here run in CI.

## Threat review (§18.1)

| Threat | Control today | Gap / action |
| --- | --- | --- |
| Account takeover | GitHub OAuth + PKCE, HTTP-only cookies, `AUTH_SECRET` required in production (`env.ts`) | Reauth-for-sensitive deferred: single-admin site; revisit with a second maintainer |
| Authorization bypass | Central `policy/authorization.ts` (owner ⊇ site_admin), truth-table + IDOR tests | — |
| CSRF | Better Auth origin checks; API state changes are token/session-gated POSTs | — |
| XSS | No user HTML anywhere; one `dangerouslySetInnerHTML` fed by server-side Shiki; CSP | CSP keeps `script-src 'unsafe-inline'` (below) |
| SQL injection | Drizzle parameterization; enum-validated sort/filter | — |
| SSRF | `import/fetch.ts`: HTTPS+allowlist+DNS range checks+redirect revalidation+caps; `fetch.test.ts` | Residual DNS TOCTOU (check-then-fetch re-resolves); accepted — allowlist is 5 major providers |
| Malicious archive/artifact | N/A — no upload surface; artifacts are importer-mirrored source text | Revisit with public uploads (§18.6 gate) |
| Dependency compromise | Exact lockfile, `allowBuilds` allowlist, actions SHA-pinned | `minimumReleaseAge` needs a one-time lockfile rebuild to adopt (entries predate the policy metadata); follow-up |
| Secret exposure | Vercel/Actions secret stores; previews get no prod credentials; rotation map in runbook | Web+importer share one DB role (runbook) |
| Ranking manipulation | Immutable digest-keyed evidence, cohort keys, append-only runs, audit | — |
| Source compromise | Pinned revisions/commits, snapshots digested, machine-gated imports | — |
| Malicious benchmark code | N/A — no execution plane exists | §18.6 gate before any runner |
| Denial of service | CDN caching on all reads, API-key quotas (429+Retry-After), bounded bodies/params | Anonymous per-IP limits stay at the CDN layer |
| Webhook abuse | N/A — no webhooks | §18.6 gate before shipping them |
| Private-data leakage | `private, no-store` on session surfaces; no private catalog data exists | — |
| Moderator abuse | All grants/corrections audit-evented; roles only by maintainer CLI | Two-person rule N/A at one maintainer |
| Supply-chain impersonation | Project claims reviewed with evidence URLs | — |

## §18.2 divergence: CSP `script-src 'unsafe-inline'`

A nonce CSP would force every ISR/CDN-cached page dynamic (nonces are
per-request), and Next's inline flight scripts change on every
revalidation, so hashes cannot be pinned. Compensating controls: zero
user-supplied HTML, React escaping, `object-src 'none'`,
`frame-ancestors 'none'`, no `unsafe-eval`. Revisit if Next ships
build-time script hashing for static pages.

## Accessibility

Automated: `tests/e2e/a11y.spec.ts` — axe (WCAG 2.2 AA tags), zero
serious/critical budget on the critical pages, skip-link keyboard test.
Documented exceptions: `nested-interactive` (evidence rows are
progressive-enhancement `<details>` whose summaries contain links — the
no-JS behavior is the point), `target-size` (§16.17 scopes 44px to "where
practical"; dense tables reviewed manually).

Manual checklist (owner, once per significant UI change):

- [ ] 200% zoom on /search and a run dossier — no loss of units/status
- [ ] Screen-reader pass of search → evidence (VoiceOver or NVDA)
- [ ] Reduced-motion honors the OS setting
- [ ] Touch targets on the mobile layout

## Soft-404s on dossier pages

Unknown slugs on `/implementations|operations|runs|serving-runs` return
HTTP 200 with the not-found body: Next streams the shell (root
`loading.tsx`) before the page can throw `notFound()`, and metadata
streams too. Accepted: the rendered page carries
`<meta name="robots" content="noindex">`, the sitemap lists only real
URLs, and machine clients use `/api/v1`, which returns true 404 problems.
`generateMetadata` still fails fast for non-streaming render paths.

## Performance

`check:bundles` (CI, after build): brotli first-load JS per catalog route
vs the 150 KiB §16.18 budget. 2026-08-16 measurement: 127–138 KiB
(/search largest). Read-layer timings against the 8.6k-run production
corpus, uncached over WAN: search 91–151 ms, home 106 ms, records 229 ms,
serving resolve 707 ms (178 cohorts) — all inside the §16.18/§19.9
budgets; no query-plan changes warranted at this scale.
