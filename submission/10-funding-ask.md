# 10 — Funding ask

## Shape: milestone-gated, Core-native, either side can stop at any milestone

Not a floating grant. Each milestone is verifiable from this repository before the next
is funded.

| MS | Milestone | Entry evidence | Exit evidence |
|---|---|---|---|
| MS-0 (seed) | Take the built, verified engine to production readiness: genuine pre-declared commitment flow for real users; Testnet2 (1114) hardening campaign ($PREPARED / FUNDING-BLOCKED` today) | Engine 73/73 adversarial, Mainnet anchor + Proof Artifact #1 VERIFIED, CI green | Testnet2 campaign executed; hardening report; first real-user pre-declared flow |
| MS-1 | Execution Firewall (v0.2) — **enforcement** at runtime: simulation-gated smart accounts (EIP-1271 capable) that ALLOW/DENY against intent+policy, not just prove after the fact | design approved (`v0.2` firewall design in spec) | Firewall live; agent execution either allowed-and-verifiable or blocked |
| MS-2 | Passport / reputation + risk **findings** (v0.3) — discretionary status layer, explicitly marked findings, never a fuzzy safety score | v0.2 shipped | Passport + findings surface; integrated with Core dApps |
| MS-3 | Registry + attestation services (B2B): agent registration, org attestation management, enterprise private registries | v0.3 shipped | Signed counterparty trial(s) with per-attestation economics |

## Why milestone-gated fits Core's own criteria

Core's stated evaluation criteria for programs of this shape include **innovation,
technical strength, scalable TAM, team, business model, and execution plan + competitive
advantage**. Milestones map directly: each one is a **verifiable technical deliverable**
(strength + execution), the layer is a **broad TAM primitive** (any autonomously
executing actor on Core), and the business model + advantage are documented in
items 08 / 09. Core can evaluate at MS-0 with a 90-second demo and stop if the
primitive does not resonate — zero stranded investment.

## Budget note (honest)

We do not publish unbacked numbers here. The pack's ask is: **run the demo**, then a
milestone-by-milestone cost discussion grounded in what MS-0 actually requires
(Testnet2 tCORE2 funding, one sustainably funded builder-track). Specific figures are
produced at the conversation stage, not in a static sheet.

## Non-negotiables

- No claim of being "Core-funded" or "Core-backed" before Core says so.
- No fake metrics in progress reports — every milestone ships with repo-reproducible
  evidence.
- Open protocol stays open; commercial services sit above it (see item 12).