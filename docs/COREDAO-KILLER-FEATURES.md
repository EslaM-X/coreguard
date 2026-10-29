# Core DAO Killer Features (COREDao-KILLER/1)

> **Verify before you submit on Core DAO. Replay after. Held if unknown.**
> AI-agent native. Fail-closed. Deterministic L2 replay. Built for EVERY Core DApp, wallet, agent.

## Killer Feature / Killer Use / Killer On-Chain / Killer Utility / Killer Adoption / Killer Reference / Killer Customer
| Item | Description |
|---|---|
| **Killer Feature** | Intent-to-Evidence Binding for Core DAO (tamper-evident, replayable) |
| **Killer Use** | AI Agent Payment Gate for Core - verify agent proposals before submission |
| **Killer On-Chain** | Core Commitment Anchor (DRY_RUN/PLAN_ONLY) |
| **Killer Utility** | Universal DApp Shield - wrap ANY Core DApp action |
| **Killer Adoption** | One-line integration for entire Core ecosystem |
| **Killer Reference** | Deterministic replay-before-submit with audit trail + replayHash + diff + report |
| **Killer Customer** | Core DeFi, Core DApps, Core Wallets, AI Agents, Validators Tooling, Escrow/A2A |

## Quick Start
```js
import { coreGate } from "@coreguard/coredao-killer";
const g = coreGate({ agentId:"a1", payment:{destination:"0x...",amount:"10"}, policy:{maxAmount:100}, rules:[{id:"VALUE_LIMIT"}] });
if(g.allowed){ /* VERIFIED only - never auto-pay */ }
```

## Core Ecosystem
Core DAO • Core Chain • Core DeFi • Core DApps • Core Wallets • AI Agents

## Why it wins
- **Problem-first**: AI agents need proof of conformance before spending
- **Unique**: Fail-closed (UNKNOWN -> HELD) + deterministic replay
- **Ecosystem-wide**: Protects every app
- **Working proof**: Built on tested engine, CI green
- **Measurable**: All claims from committed tree

**Status:** DRY_RUN / NOT_BUILT | **Version:** COREDao-KILLER/1
