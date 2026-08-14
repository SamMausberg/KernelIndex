# Working with Samuel

I'm Samuel. You're my agent. We will be working together very often, so I
thought I should introduce myself. I'm 20 years old, and I'm interested in
inference, deep mathematics, and hardware.

I love building. Complex things have always interested me. So when I find ways
to reduce complexity, improve abstraction, and solve problems more efficiently,
I enjoy the work.

I'm sharing my preferences here so we're aligned as we work.

If a rule here conflicts with the task you have been given, please explain
the conflict and get my sign-off before breaking it.

## Coding preferences

- Do not be scared to propose bold ideas if they meaningfully benefit our work
  and are aligned with my intent.
- Be careful with destructive actions that are not explicitly requested by the
  user.
- Tests are good! Tests that are endless smoke tests, "regression tests" for
  feature deletion, etc., are far worse. Tests should be focused, concise, and
  not slop.
- Keep files concise, preferably at most 600–800 LOC.
- Comments are an exceptional way to clarify functionality and how code is
  used. Do not comment every line, but when relevant, please concisely
  describe how functions are used above function definitions, classes, etc.
- Keep comments up to date. When making changes, always ensure everything is
  in sync. This is vital, as this repo evolves incredibly fast.
- Always verify your work: run the relevant tests, builds, or checks before
  reporting something done, and ground your claims in actual results rather
  than assertions. Do not run repo-wide verification unless the scope
  requires it.
- Do not over-engineer. No unrequested features, speculative abstractions, or
  defensive handling for scenarios that cannot happen.
- Write as little code as possible — this is essential. Less code must come
  from better abstraction and refinement, never from compacting files or
  dropping features. The target is low LOC with all the same features: code
  that is as smart, long-term, and organized as possible. Better coding means
  less code; do not cheat the metric.

## TypeScript

- Avoid `any`. Inferred types are better: the system should adapt to changes
  instead of requiring them everywhere.
- TypeScript code should not read like a Python developer wrote it.
- Try to avoid one-line functions that are casting wrappers.

## Communication

- I want concise, simple explanations that still properly explain the
  details.
- I often think out loud. When I do, bounce the ideas back and brainstorm
  with my intent — don't jump to implementation until I ask.

## Agents and delegation

- Do not spawn subagents or a multi-agent panel for work a single agent can
  finish in one pass. Delegation is for breadth or adversarial review, not for
  ordinary tasks.
- When several agents do work in parallel, state file ownership and ensure
  there are no collisions as they are orchestrated.

## Visual

- Please avoid continuously repainting CSS animations (pulse, shimmer, blur,
  spinners); these are bad for GPUs on high-refresh displays.

## Taste

- Assume KernelIndex users drive agents all day and are quick to notice
  dropped frames, poor design, or broken visuals. Ensure everything you
  develop holds up to that standard.

## Pull requests

- Ensure titles always follow repository conventions. They should be simple
  and easy to understand. Use conventional commit style in projects that use
  it — for example, "fix(web): ...".
- Open a real PR, not a draft.
- Rebase onto the latest main before opening.
- When asked to monitor a PR, poll checks and comments newer than the last
  push.

## Extra info

- Do not verify with browsers or computer use unless the user requests it.
