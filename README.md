# KernelIndex

**Find the fastest verified GPU kernel for your exact workload.**

KernelIndex is the public performance index for GPU software. It resolves an exact
workload — operation, shape, dtype, layout, hardware, framework — to the fastest
currently known compatible implementation, with source, license, environment,
benchmark protocol, raw evidence, and an explicit trust level.

Results are ranked only inside comparable workloads and environments. Names are
aliases, not semantic identity; published benchmark runs are append-only evidence.

## Status

Early scaffold (Release A: live design canvas). All catalog data currently comes
from clearly labeled illustrative fixtures. No real benchmark evidence is
published yet.

## Development

Requirements: Node 24.19.0 (see `.node-version`) and pnpm 11.21.0 (selected
automatically by Corepack from the root `packageManager` field).

```bash
pnpm install --frozen-lockfile
pnpm dev        # start apps/web on http://localhost:3000
pnpm check      # lint + typecheck + production build
```

## Repository layout

```text
apps/web/    Next.js application: all public pages, fixtures, and (later) catalog server code
docs/adr/    Architecture decision records
```

`ENGINEERING_DESIGN.md` is the source of truth for product semantics, data
architecture, sequencing, and operational constraints. `AGENTS.md` carries the
working rules for AI coding agents.

## License

KernelIndex-authored code is licensed under [Apache-2.0](LICENSE). This license
does not automatically apply to imported source code, artifacts, benchmark data,
or database content, which retain their upstream licenses.
