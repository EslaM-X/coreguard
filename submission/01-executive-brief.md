# 01 — One-page Executive Brief

## CoreGuard: Verifiable Execution Truth Layer for Bitcoin DeFi on Core

CoreGuard turns "an agent/the code did it" into **independently verifiable evidence of
what was authorized and what actually executed.** It is an open, deterministic
verification/security primitive for the growing universe of autonomous actors
(wallets, bots, AI agents) moving value on Core.

## The problem

Programmable money moved to Bitcoin. Core gives BTC a native programmable layer —
vaults, strategies, swaps, staking, coreBTC — and every position **executes as code**.
Execution is not the same as intent: a front-run, a mutated calldata, a hidden hop, or
a hijacked target can make a transaction "go through" while doing something other than
what was authorized. Today, the industry's evidence is a **log written by the same
process that executed** — it cannot prove what it records, and it can be edited without
contradiction.

## The answer (proven, not claimed)

```
AI Agent → signed CoreGuard Intent (EIP-712) → Authorization (WS-1 recovered signer)
        → Firewall ALLOW (policy) → Core Mainnet transaction
        → Core execution evidence → Independent verification → VERIFIED
or → INVALID (tamper) · NOT_PROVEN (wrong caller) · UNVERIFIED / NOT_RUN (missing evidence)
```

One real execution already exists on Core Mainnet — an automated agent's transfer,
**L1 VERIFIED** by independent re-derivation:

| Fact | Value |
|---|---|
| Core Mainnet tx | `0xe67c61fda81200bf026faee31c23a7b7e7f56ed24f06ffe24f071fa06891a9b8` |
| Block | `38712625` |
| Agent / signer | `0xea41becdeb612d8625bf3060809964f1dab43244` (EOA) |
| Value | 0.001 CORE transferred to a separate recipient EOA |
| Verdict | **L1 VERIFIED** (`RECEIPT_INTEGRITY`) — signer recovered, policy SATISFIED, commitment anchored on Core |

Reproduce it: `npm install && npm run demo:90s:live` (read-only, no funds).

## Why Core

- **Core-native design**: evidence anchors on Core Testnet2 (1114) → Mainnet (1116); registry live on Mainnet (`0x037dF08F2d43c5D03759279Fe35664f6AFf9EA6E`).
- **BTCFI is the highest-automation category on Core** — exactly where "what was the code authorized to do?" becomes a liability question.
- **Complementary, not competing**: Core records execution truth on-chain; CoreGuard verifies whether execution **conformed to authorization**. Core stays the anchor and the witness.

## Ask

A milestone-gated working relationship — see [`10-funding-ask.md`](10-funding-ask.md). We are
not asking Core to endorse a claim; we are asking Core to **run the demo** and take the next step
with us if a Core-native verification/security primitive for autonomous execution is something
Core wants to exist.

## Honesty (non-negotiable)

- VERIFIED ≠ SAFE. No claim of preventing all exploits, no fake adoption/TVL/partnerships, no "first ever" without prior art.
- The proof snapshot is public and non-secret: `examples/pilot/proof-artifact-1.json`.
- All counts (tests, benchmarks, anchors) are reproducible from this repository.