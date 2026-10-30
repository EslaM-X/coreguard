# CoreGuard — ONE-PAGER (Facts Only)

## Problem
In agent economies, it's easy to blur "agreed", "executed", and "proven". Many systems auto-refund or auto-pay without mechanical evidence. That erodes trust for both workers and publishers.

## Solution
CoreGuard is a **fail-closed verification layer**. It binds agreement → execution → evidence mechanically.

- **Budget/reservation**: job-scoped ledger with atomic reserve, refuse-before-sign, and metering on the same ceiling. If there's no room, it's refused before any signature.
- **Acceptance**: machine-checkable acceptance criteria separate from human judgment. **UNKNOWN stays HELD** — money is neither auto-paid nor auto-refunded when the verdict cannot be determined mechanically.
- **Integration**: `publish → hold → deliver(evidence) → evaluateAcceptance() → disposition()` with a single source of truth (ledger).
- **Audit binding**: `claims:audit` binds to the **committed** `docs/claims-registry.json` via `git show HEAD:...` and fails on any derived/status drift.
- **Refusal audit**: every refusal is recorded with reason/code (no secrets/keys) for proof without exposing sensitive data.

## Proof (from the committed tree)
- **Tests**: `1405/1405` passing (local)
- **Boundary audit**: `npm run boundary:audit` — PASS
- **Release gate**: `npm run release:gate` — GATE_PASS (18/18 legs)
- **Claims**: `npm run claims:audit` — PASS (committed artifact bound)
- **Primitives**: `packages/budget/`, `packages/acceptance/`, `packages/job-integration/`, `packages/x402/` wired with `refuse-before-sign`
- **Killer features**: Budget Waterfall, Reservation Timeline, Acceptance Evidence Bundle, "UNKNOWN stays HELD" explainer, Deterministic replay

## What this is NOT
No claims of live mainnet, live payments, revenue, funding, partnership, badge, certification, or external authorization. These remain gated/unknown per the repo's fail-closed rules.

## For builders
- **domondi1**: CoreGuard makes "reserve before sign" provable. The job-level budget/reservation primitives are real and testable. Happy to align placement (payer process vs agent host) to his preferred shape.
- **houdaguang**: CoreGuard doesn't replace a quality oracle — it enforces the mechanical split: "agreed vs executed vs proven". If acceptance criteria are non-deterministic, verdict = UNKNOWN and funds stay HELD. That complements ACTN without competing.
