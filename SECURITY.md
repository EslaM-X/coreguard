# Security Policy

CoreGuard is an **execution-truth** layer: it does not hold funds, run code on
user behalf in v0.1, or custody anything. Its job is producing independently
verifiable evidence of execution conformance.

## Scope

We take reports in:

- `packages/` — canonicalization, hashing, policy evaluation, trace
  normalization, evidence/receipt generation, the independent verifier.
- `contracts/EvidenceRegistry.sol` — commitment registry.
- `examples/` and `scripts/` — demos and local tooling.

Out of scope: anything in `spec/` that is explicitly marked *design/research*
(e.g., ZK/L4), and adversarial *scenarios* our corpus catalogs as known limits
(deep per-call sequence diffs at L2, oracle trust, etc.).

## Reporting

Please **do not** open a public issue for security problems. Email
`security@coreguard.xyz` (placeholder — replace with a real address before
public launch) with:

- Steps to reproduce (minimal, deterministic).
- Impact: what evidence/receipt can be forged, and under what trust model.
- Suggested fix, if any.

We commit to: acknowledge within 48h, triage within 7 days, and follow
responsible disclosure (90 days before public release).

## What we will note, and what we will not

We will fix anything that lets an attacker **forge** a verified receipt for an
execution that did not conform to a committed intent+policy under our threat
model (see `spec/threat-model.md`).

We will *not* treat "the execution was conforming but harmful" as a CoreGuard
vulnerability — that is a policy-authoring problem, not an evidence problem.
VERIFIED ≠ SAFE.

## Verification bonus

Deterministic reproduction is the whole point. If your report includes a failing
reproduction against the public corpus (`npm test`, `npm run benchmark`), prefer
that over prose.