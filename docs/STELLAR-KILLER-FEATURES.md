# CoreGuard for Stellar/Soroban - Killer Features

> "Verify before you submit. Replay after. Held if unknown."
> AI-agent first. Fail-closed. Deterministic. Measurable. Undeniable.

## Killer Feature
Intent-to-Evidence Binding (ITEB/1) - Bind every Stellar/Soroban intent to tamper-evident, replayable evidence. Any mutation breaks binding.

## Killer Use
AI Agent Payment Gate (AIPG/1) - Agents propose payments; CoreGuard verifies against policy and deterministic replay before Stellar submission. VERIFIED only. **Executed evidence:** `docs/evidence/stellar-agent-gate-executed.json` (VERIFIED / REJECTED / HELD matrix, digest-checked; submission stays credential-gated) — `node scripts/stellar-agent-gate-executed.mjs --verify`.

## Killer On-Chain
Soroban Commitment Anchor (SCA/1) - **MAINNET DEPLOYED (2026-11-04): contract `CCKA2GYVILX7YZVSXGVIHOPNLTRBBF2SSWKBTQBIE7M67N5N2QMMXPSP`, creator = the CoreGuard wallet, third-party-listed (stellar.expert). The first anchor CALL remains a credential-gated funded sweep.**

## Killer Utility
Universal DApp Shield (UDS/1) - Wrap ANY Stellar/Soroban action (swap, lend, borrow, bridge, vote). ALLOW/DENY/HOLD with commitment and replayHash. **Executed evidence:** `docs/evidence/universal-dapp-shield-executed.json` (2 ALLOW · 2 REQUIRE_REVIEW · 1 DENY · 1 REFUSED Q-FW10 seam) — `node scripts/universal-shield-executed.mjs --verify`.

## Killer Adoption
One-Line Integration (OLI/1) - aiAgentPaymentGate in 3 lines. Works with Freighter, wallets, DEXs, Soroban contracts, AI agents. **Publish truth:** the npm closure is publish-ready and CI-parity-checked (`npm run publish:check`); the registry steps remain double-gated pending the `NPM_TOKEN` Actions secret.

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
- Measured: 1405 tests, 0 violations, 0 red checks
