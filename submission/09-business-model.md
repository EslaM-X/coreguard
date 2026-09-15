# 09 — Business model

Design state (from `spec/agent-provenance-business.md` + `docs/value-hypothesis.md`).
**Pricing is a hypothesis pending counterparty validation — this page makes no revenue
claim.**

## Value proposition (two-sided)

- **Executors** (bots, agents, orgs, custodians): a cryptographically verifiable,
  privacy-preserving provenance outcome — counterparties accept them faster, risk desks
  clear them sooner, on-chain activity is auditable.
- **Consumers** (dApps, wallets, risk desks, auditors): deterministic, independently
  re-verifiable execution provenance — not a heuristic guess, not a log row.

## What is free vs what is paid

**Free (public good, in this repo):** protocol, spec, all verification tooling (
JS/Rust-WASM/Python verifiers), badge rendering for anchored manifests, independent
re-verification. Trust must never depend on us running a hosted check.

**Paid (services, never facts):** hosted verification infra + SLAs; registry /
attestation services; enterprise private registries + custody attestation; firewall /
SDK integration enablement (B2B2D).

## Monetization vectors (design, non-committal)

1. Verification-as-a-service: per-attestation fee — an audit-grade receipt at a few
   **$ / attestation**; marginal cost is one L1 receipt + one anchor tx (≈ cents today
   on Core).
2. Platform licenses: automation vendors embed the verifier, pay per monthly-active
   attestation; fail-closed anti-forgery is the differentiator.
3. Firewall licensing (v0.2+ enforcement at runtime) for smart-account wallets.
4. Core dApp integrations — fee-split / revenue-share aligned with Core protocols.

## Buyers (hypothesis, ordered)

| Segment | Pain they would pay to reduce |
|---|---|
| B1 — AI/automation platforms | Product liability "the agent did only what you authorized"; best-effort logs today |
| B2 — Custodians / treasury operators | Audit-grade proof that a policy gate constrained execution |
| B3 — Auditors / oracles | Resell cross-chain execution attestations |

## Why a log is not enough (the test any prospect runs)

- A log is written **by the same process that executed** — it cannot prove itself.
- A log is **not anchored** — editable without contradiction. CoreGuard receiptId +
  commitment are deterministically re-derived and anchorable on Core.
- A log asserts; CoreGuard **proves or fails closed**.

## Validation status (honest)

- Positive pilot: **DONE** (L1 VERIFIED, Proof Artifact #1).
- Counterparty conversation: **in progress** (ElizaOS discussion comment posted +
  outreach sent). The hypothesis is confirmed only if a counterparty names a loss/bill
  this artifact directly reduces and indicates a budget line.
- Pricing signal: one signed trial where per-attestation fee > compute+RPC cost —
  **not yet executed**; no claim of revenue.