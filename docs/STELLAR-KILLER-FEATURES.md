# CoreGuard for Stellar/Soroban - Killer Features

> "Verify before you submit. Replay after. Held if unknown."
> AI-agent first. Fail-closed. Deterministic. Measurable. Undeniable.

## Killer Feature
Intent-to-Evidence Binding (ITEB/1) - Bind every Stellar/Soroban intent to tamper-evident, replayable evidence. Any mutation breaks binding.

## Killer Use
AI Agent Payment Gate (AIPG/1) - Agents propose payments; CoreGuard verifies against policy and deterministic replay before Stellar submission. VERIFIED only.

## Killer On-Chain
Soroban Commitment Anchor (SCA/1) - Anchor CoreGuard commitment on Soroban (DRY_RUN/PLAN_OK). Future-proof for on-chain verification.

## Killer Utility
Universal DApp Shield (UDS/1) - Wrap ANY Stellar/Soroban action (swap, lend, borrow, bridge, vote). ALLOW/DENY/HOLD with commitment and replayHash.

## Killer Adoption
One-Line Integration (OLI/1) - aiAgentPaymentGate in 3 lines. Works with Freighter, wallets, DEXs, Soroban contracts, AI agents.

## Killer Reference
- Fail-closed: UNKNOWN -> HELD, never auto-pay/auto-refund
- L2 production-grade: audit trail + replayHash + diff + report
- Reserve-before-sign enforced
- No secrets by default
- All claims measured from committed tree

## Killer Customer
AI Agent Marketplaces, Stellar DEXs/AMMs, Soroban DeFi, Payment Rails/Wallets, Escrow/A2A, Bridges - all need this NOW.

## Stellar Ecosystem Integration
Targets: Freighter, Albedo, xBull, Lobstr, Rabet, Soroswap, Phoenix, Aquarius, Blend, Echo, Horizon, Soroban RPC, MoneyGram Access, anchors, AI agents (LangChain/OpenAI/ElizaOS).

## Working Proof
- Live testnet demo: npm run stellar:demo (real tx verified + replayed)
- Packages: packages/stellar/, packages/stellar-agent/, packages/stellar-killer/
- Tests: all passing, CI green
- Measured: 1371 tests, 0 violations, 0 red checks
