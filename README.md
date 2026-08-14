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
```

`ENGINEERING_DESIGN.md` is the source of truth for product semantics, data
architecture, and sequencing.

## License

KernelIndex-authored code is licensed under [Apache-2.0](LICENSE). Imported
source code, artifacts, benchmark data, and database content retain their
upstream licenses.
