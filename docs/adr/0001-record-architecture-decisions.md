# ADR 0001: Record architecture decisions

## Context

KernelIndex is planned in `ENGINEERING_DESIGN.md`, which fixes product
semantics, sequencing, and infrastructure triggers. Decisions that deviate
from, refine, or add to that document need a durable, reviewable home so the
reasoning survives beyond chat transcripts and commit messages.

## Decision

Record architecture decisions as numbered Markdown files in `docs/adr/`, one
decision per file, using the section headings of this file (Context, Decision,
Alternatives considered, Consequences, Security and data implications, Revisit
triggers, References). An ADR is immutable after acceptance; a later ADR
supersedes it.

## Alternatives considered

- Keeping all decisions inline in `ENGINEERING_DESIGN.md`: rejected — the
  design document records the plan, not the running log of deviations.
- An external tracker: rejected — decisions belong in the repository next to
  the code they govern.

## Consequences

Structural changes (new dependencies with compatibility constraints, package
extractions, infrastructure additions) get a short ADR at the time they land.

## Security and data implications

None.

## Revisit triggers

None; superseded by a future ADR if the convention changes.

## References

- `ENGINEERING_DESIGN.md` Section 26 (initial architecture decision records)
