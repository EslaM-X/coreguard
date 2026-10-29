# Core DAO Killer Features (COREDao-KILLER/1)

> **Verify before you submit on Core. Replay after. Held if unknown.**
> AI-agent native. Fail-closed. Deterministic. Built to protect every Core DApp, wallet, agent.

## Killer Feature / Use / On-Chain / Utility / Adoption / Reference / Customer
- **Killer Feature:** Intent-to-Evidence Binding for Core
- **Killer Use:** AI Agent Payment Gate (Core)
- **Killer On-Chain:** Core Commitment Anchor (DRY_RUN/PLAN_ONLY)
- **Killer Utility:** Universal DApp Shield for Core actions
- **Killer Adoption:** One-line integration for Core ecosystem
- **Killer Reference:** Deterministic replay-before-submit (L2 production-grade)
- **Killer Customer:** Core DeFi, Core DApps, Core Wallets, AI Agents, Validators Tooling, Escrow/A2A

## Quick Start
```js
import { coreGate } from "@coreguard/coredao-killer";
const g = coreGate({ agentId:"a1", payment:{destination:"0x...",amount:"1"}, policy:{maxAmount:100}, rules:[{id:"VALUE_LIMIT"}] });
if(g.allowed){ /* VERIFIED only */ }
```

## Core Ecosystem
Core DAO • Core Chain • Core DeFi • Core DApps • Core Wallets • AI Agents

## Status
DRY_RUN / NOT_BUILT. Measurable claims only. CI green.
