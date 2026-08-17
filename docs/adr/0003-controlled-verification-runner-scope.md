# 0003. Controlled verification runner: first scope

Date: 2026-08-17

Status: accepted as scope; implementation not started.

## Context

Every kernel record in the corpus is Reported-tier evidence: preserved
exactly as the source published it, never rerun (§8.14, /coverage
limitations). The Verified and Replicated tiers documented in /docs and
encoded in `policy/trust.ts` are unreachable — `reproducedByKernelindex`
is false on every row. §22.16 puts controlled maintainer-approved
verification on one GPU/provider first in the post-beta sequence, and §17
specifies the full architecture. A full §17 build (hidden workloads, runner
attestation fleets, provider abstraction) is far more than the first
verified record needs. This ADR fixes the smallest scope that lights the
tier honestly.

## Decision

One founder-operated verification lane, batch, not a public service:

- **Hardware/provider:** one rented NVIDIA H100 SXM instance from a single
  per-second-billing provider. H100 over B200 first: materially cheaper,
  reliably available, and the corpus already holds H100 records to verify.
  B200 is the second target, added only after the lane is boring.
- **Allowlisted operations:** deterministic, tolerance-simple families
  first, per §22.14 order: RMSNorm and fused residual/RMSNorm, then RoPE
  and SwiGLU. No attention, GEMM, or quantized ops in scope — their
  tolerance and reference-cost questions come later.
- **What runs:** maintainer-approved implementation revisions only, already
  published in the catalog with public source and a reviewed build recipe.
  No arbitrary public submissions; the §17.5 guest-isolation work is not
  needed while a curator reads every line that enters the queue.
- **Protocol:** one KernelIndex protocol manifest (fixed clocks,
  persistence mode, device-event timing, warmup, 200 samples, median,
  per-sample input regeneration — the §8.9 shape) plus a per-boot
  calibration run of a pinned reference kernel; a boot whose calibration
  falls outside its historical band is discarded, per §17.9.
- **Execution:** an ephemeral VM per batch from a digest-pinned image,
  egress-blocked after setup, no long-lived credentials in the guest;
  results and raw samples leave only as digested artifacts to object
  storage (§17.2, §18.4). The runner writes ordinary `BenchmarkRun`
  manifests with `reproducedByKernelindex: true` through the existing
  publication transaction — `policy/trust.ts` then derives Verified with
  **zero schema or policy changes**.
- **Cadence and cost:** batched, founder-triggered (weekly at most), with a
  hard monthly budget cap. A batch of ~20 verifications of element-wise ops
  is minutes of GPU time; the cost floor is instance minimums, not compute.

## Alternatives considered

- Full §17 runner with hidden workloads and attestation now: months of
  security work before the first verified record; rejected as sequencing.
- Verify on owned consumer hardware: not the hardware the records claim;
  environment equivalence (§11.3) would fail, producing a new cohort
  rather than verification.
- Skip verification until demand proves it: the empty Verified tier is the
  product's largest credibility gap, and §22.16 already ranks it first.

## Consequences

- The first Verified records appear without new schema, new policy
  versions, or public attack surface.
- Verification coverage is narrow and explicitly labeled; /coverage's
  limitation line changes from "no runner exists" to naming the lane's
  scope.
- The lane produces the calibration history and protocol manifests the
  §17 build will need anyway.

## Security and data implications

No public submission path is opened; the threat model stays §18.1 minus
untrusted code execution. Provider credentials live in CI secrets, never in
the guest. Raw samples ship as public artifacts with digests, so a
verification is auditable end to end.

## Revisit triggers

- A maintainer outside the founder wants to trigger verification.
- The allowlist wants attention or GEMM (tolerance policy work first).
- Two independent runner identities become affordable (Replicated tier).
- Any request to run code a curator has not fully read (full §17.5–17.7
  becomes mandatory before proceeding).

## References

ENGINEERING_DESIGN.md §8.9, §8.14, §11.3, §17, §18.4, §22.14, §22.16.
