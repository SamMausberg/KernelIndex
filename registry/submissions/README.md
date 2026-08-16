# PR-path submissions (§15.2)

Submit a complete record without the web flow: add one `*.yaml` manifest
bundle to this directory in a pull request. CI validates every file here with
the exact schema and canonicalization checks the web flow uses:

```bash
pnpm --filter @kernelindex/web import:submission -- registry/submissions/<file>.yaml
```

After review and merge, a maintainer publishes it through the same
publication transaction (`--publish`); a Git merge alone never becomes
public. The bundle format is the multi-document YAML the validator reports
on — see `registry/examples/` for each manifest kind and
`registry/schemas/` for the generated JSON Schemas.

Published community records carry the `community` source with contributor
attribution; licensing must be declared per manifest (unknown licenses are
never displayed as usable).
