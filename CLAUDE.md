# CLAUDE.md

- Follow the repo-specific `AGENTS.md` instructions: @AGENTS.md
- User instructions override both.

KernelIndex — the public performance index for GPU software.

## Source of truth

`docs/ENGINEERING_DESIGN.md` is our primary plan and specification. It is not a
hard fixed rule: it will change as the codebase evolves, and you can change
it — when reality diverges from the document, propose the update and keep it
in sync.

## Commands

```bash
pnpm dev        # dev server (apps/web)
pnpm check      # lint + typecheck + build — run before calling work done
pnpm format     # biome check --write .
```

Node 24.19.0 + pnpm 11.21.0 (Corepack). Node 24 is user-local in
`~/.local/bin`; use a login shell, or commands fail engine-strict under the
system Node 22.

## Workflow

- Commit when relevant: at natural checkpoints once a coherent change is done
  and verified, with simple conventional messages (e.g. "fix(web): ...").
- Never credit yourself or Anthropic in commits: no Co-Authored-By trailers,
  no "generated with" lines.
- Never present fixture or illustrative numbers as real benchmark evidence,
  and never call merely imported results "verified".
