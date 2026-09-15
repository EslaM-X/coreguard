# 07 — Why Core should fund this

> **Not:** "we need money."
> **Yes:** **CoreGuard can become a verification/security primitive for autonomous
> execution on Core.** Core does not fund a project here — Core invests in a
> capability its own ecosystem will need in production, and it already has a
> runnable proof on Core Mainnet to evaluate.

## 1. Core is becoming the home of *autonomous money movement*

Core's thesis is BTC native DeFi: vaults, strategies, swaps, staking, coreBTC. Those
positions **execute as code** today and will increasingly execute as **autonomous
actors** (bots, AI agents, strategy automations) that hold keys and move value. That
shift replaces "a human signed this" with a harder question: *was the code allowed to
do what it did, and can anyone prove it?* Core does not currently own that
verification layer — CoreGuard is designed to be exactly that layer.

## 2. CoreGuard is *already running on Core* — verifiably

- A real automated agent executed a transfer on **Core Mainnet** and an independent
  verifier returned **L1 VERIFIED** (`RECEIPT_INTEGRITY`), signer recovered, policy
  SATISFIED, commitment anchored on-chain. Instructions + code to reproduce it —
  `npm run demo:90s:live` — are in this repository, **today**.
- Core keeps a NO-OP workload. CoreGuard is not asking Core for custody, consensus
  changes, or protocol custody. Only: run it, and decide if this primitive should exist.

## 3. Complementary to Core's existing trust stack — never competing

| Core already has | CoreGuard adds |
|---|---|
| Execution truth (blocks, receipts, logs) | Proof of **conformance to authorization** |
| coreBTC locking/unlocking, dual staking | Proof of **what was authorized to happen** with agent-held positions |
| Wallet/transaction **safety scanning** | **Execution evidence** — deterministic, recomputable, fail-closed |
| Security culture (Core wallet on Avalanche etc.) | Independent, non-custodial verification primitive that any Core dApp can adopt |

## 4. The moment is now

- Autonomous BTCFI agents on Core are early but real; the incident pattern
  ("the agent/the tool did it") is already recognizable industry-wide.
- A verification/security primitive that arrives **before** the first large agent
  incident is adopted as infrastructure; one that arrives after is a patch.
- Core hosting the *first* proven, open, L1-verifiable agent-execution proof
  (which now exists on its chain) is a defensible ecosystem advantage.

## 5. What "fund" means here (milestone-gated, not a grant-as-prize)

Not a floating grant. A working relationship around **milestones Core can verify**:
production-ready pre-declared commitments for real users, then an Execution Firewall
(enforcement at runtime), then risk findings/passport. Details in [`10-funding-ask.md`](10-funding-ask.md)
and [`11-roadmap-12-month.md`](11-roadmap-12-month.md). Either side can stop at any
milestone; nothing is "paid ahead" against a promise.

## 6. The exact sentence we are trying to produce from Core

> **"We need to see this running on Core."**

Everything in this pack is optimized for that sentence: a 90-second demo, zero
slide-deck claims, full reproducibility. If Core runs it and keeps the door open, the
packet has done its job.

## 7. Honesty guard (what this page does NOT claim)

- CoreGuard does not "secure" or extend Core consensus.
- We are not "Core-backed" until Core says so — and this page does not imply it.
- VERIFIED ≠ SAFE; no prevention of all exploits; no fake adoption/TVL/partners.
- No claim of "nobody does this" — see the competitive + prior-art docs.