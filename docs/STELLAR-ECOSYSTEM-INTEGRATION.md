# Stellar Ecosystem Integration Map

> CoreGuard is built to protect EVERY application in the Stellar ecosystem.

## Coverage
- Wallets: Freighter, Albedo, xBull, Lobstr, Rabet
- DEXs/AMMs: Soroswap, Phoenix, Aquarius, Scopuly
- DeFi: Blend Protocol, Echo Protocol
- Infra: Stellar Development Foundation, Horizon, Soroban RPC
- Agents: LangChain, OpenAI Agents, ElizaOS, autonomous payment agents
- Payments: MoneyGram Access, anchors, on/off ramps
- NFTs, tooling, oracles as applicable

## Integration Pattern
```js
import { universalDappShield } from "@coreguard/stellar-killer";
const shield = universalDappShield({ action:"swap", intent, policy, rules });
if(shield.verdict==="ALLOW"){ /* execute with evidence */ }
```

## AI Agent Focus
CoreGuard is AI-agent native. Verify agent proposals before they sign/submit. Fail-closed. Deterministic replay.
