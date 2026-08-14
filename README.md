# KernelIndex

**Find the fastest verified GPU kernel for your exact workload.**

KernelIndex is the public performance index for GPU software. It resolves an
exact workload (operation, shape, dtype, layout, hardware, framework) to the
fastest currently known compatible implementation, with source, license,
environment, benchmark protocol, raw evidence, and an explicit trust level.

Results are ranked only inside comparable workloads and environments.

## Development

Requires Node 24.19.0 (`.node-version`) and pnpm 11.21.0 (selected by Corepack
from the root `packageManager` field).

```bash
pnpm install --frozen-lockfile
pnpm dev        # start apps/web on http://localhost:3000
pnpm check      # lint + typecheck + production build
pnpm test       # unit tests; database tests run when DATABASE_URL is set
```

Pages read the catalog through four functions in `apps/web/src/lib/catalog.ts`.
`CATALOG_BACKEND=fixtures` (the default, no configuration needed) serves a
deterministic, visibly illustrative catalog; `CATALOG_BACKEND=postgres` serves
real published records.

### Database

Local PostgreSQL 18 comes from `compose.yaml` (`docker compose up -d`), or
without the compose plugin:

```bash
docker run -d --name kernelindex-postgres -p 127.0.0.1:5432:5432 \
  -e POSTGRES_USER=kernelindex -e POSTGRES_PASSWORD=kernelindex \
  -e POSTGRES_DB=kernelindex -v kernelindex-postgres:/var/lib/postgresql \
  postgres:18.6
```

Copy `apps/web/.env.example` to `apps/web/.env.local`, then:

```bash
pnpm --filter @kernelindex/web db:migrate   # apply committed SQL migrations
pnpm --filter @kernelindex/web db:seed      # illustrative registry examples
pnpm --filter @kernelindex/web import:sol -- --dry-run   # review report only
pnpm --filter @kernelindex/web import:sol -- --publish   # real SOL records
```

The importer is idempotent: re-running with unchanged upstream data inserts
nothing. Imported results are labeled **Reported** — never "verified" — and
every record links its workload, protocol, environment, source snapshot, and
raw source metrics.

`ENGINEERING_DESIGN.md` is the source of truth for product semantics, data
architecture, and sequencing.

## License

KernelIndex-authored code is licensed under [Apache-2.0](LICENSE). Imported
source code, artifacts, benchmark data, and database content retain their
upstream licenses.
