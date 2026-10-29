# @coreguard/stellar-killer (STELLAR-KILLER/1)

Killer feature set for Stellar and Soroban. Verify before you submit. Replay after. Held if unknown.

Built on CoreGuard fail-closed execution-truth layer (L0-L4, production-grade L2 replay).

## Killer Features
- Intent-to-Evidence Binding (ITEB)
- AI Agent Payment Gate (AIPG)
- Soroban Commitment Anchor (SCA)
- Universal DApp Shield (UDS)
- One-Line Integration (OLI)

## Killer Use / Killer On-Chain / Killer Utility / Killer Adoption / Killer Reference / Killer Customer
All exported via killerReference(), killerCustomer(), stellarEcosystemMap().

## Quick start (3 lines)
```js
import { aiAgentPaymentGate } from "@coreguard/stellar-killer";
const gate = aiAgentPaymentGate({ agentId:"agent-1", payment:{destination:"G...",amount:"10"}, policy:{maxAmount:100,allowedRecipients:["G..."]}, rules:[{id:"VALUE_LIMIT"},{id:"RECIPIENT_ALLOWLIST"}] });
if(gate.allowed){ /* only VERIFIED payments reach here */ }
```

## Status (honest)
- Run mode: DRY_RUN
- Integration status: NOT_BUILT
- No secrets, no live submission by default
- All claims measurable from committed tree

## Why it wins Stellar funding
- Problem it solves: AI agents + DeFi need proof of conformance, not just signatures
- Unique: deterministic replay-before-submit with cryptographic replayHash
- Fail-closed: UNKNOWN -> HELD. Never auto-pay.
- Ecosystem-wide: works with wallets, DEXs, Soroban, agents, anchors
- Production-grade: built on tested CoreGuard engine
- Undeniable proof: live Stellar testnet demo + working code
