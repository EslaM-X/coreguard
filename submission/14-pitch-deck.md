# 14 — Investor / Core Pitch Deck

> Everything in this deck is reproducible from this repository. No invented
> users, adoption, revenue, or partnerships. Pricing stays LOCKED (hypothesis
> only) until the Decision Gate runs — see `docs/pricing.md`.

## The one sentence

> CoreGuard makes **autonomous execution on Core verifiable**: an agent declares
> what it was authorized to do, executes on Core, and any third party can
> independently re-derive a cryptographic verdict of whether the on-chain
> transaction actually matched that authorization.

## The problem

Bots, agents, robots and companies now execute value on Core. No one can
reliably answer the first due-diligence question — **who actually ran that
transaction, and did it match what was authorized?** Executions are opaque,
attribution is assumed, and a failure closes doors on trust, not on hardware.

## The product (three surfaces, one engine)

| Surface | What it does | Status |
|---|---|---|
| **CGEP/1 Engine** | Deterministic verifier (`COMPARE` → `VERIFIED/INVALID/NOT_PROVEN`) | v2.1.2, frozen |
| **Agent Proof — Actor Identity Card** | Declared persona (HUMAN / AGENT / BOT / ROBOT / COMPANY) + maker/model/version + trust (DECLARED→VERIFIED), bilingual | Live (`verify-provenance` CLI, 12/12) |
| **DDE/1 Delivery layer** | Dispute / delivery / payout gate over HTTP — deploy, escrow-hold, release, fail-closed | `packages/delivery`, `dde.yml` CI |
| **Core DApp surface** | On-Core anchor with flat transparent commission (`EvidenceRegistryV3`, feeWei treasury) | Wired, tests 34/34 Foundry |

## Evidence (reproducible, committed)

| Claim | Proof |
|---|---|
| **Live on Core Mainnet** | V2 contract `0x037dF08F2d43c5D03759279Fe35664f6AFf9EA6E`, anchor tx `0x5b9e7d68…3e478d2` block `38764446`, verdict **VERIFIED ANCHOR INTEGRITY**, cross-RPC (coredao + ankr) |
| **Identity anchor live** | Gate 4.1 `commitIntent` `0x68d9fb…`, block `38827925`, status `0x1`, independent round 66/66 PASS |
| **Whole-suite green** | `npm test` **936 total, CI green** (CI guards incl.), forge **34/34**, adversarial corpus **73/73**, watchdog 38/38 |
| **Public evidence-label review (read-only)** | Iterative read-only schema review of `delivery-fixture` + `assent-pair` by People's Court / Epistemic Labs in public elizaOS #21788 (2026-09-23); two labeling corrections shipped at `1e75fba` (tri-state consent aggregate; evidence status separated from actual settlement status) — **no endorsement, no chain verification, no integration/pilot/adjudication** |
| **Deterministic (clean clone)** | 749/749 ×2 from pristine `core.autocrlf=false` clone at `0788cfb`; RC manifest 582/582 == git blobs |
| **No secrets** | Full git history: **942 blobs, 0 embedded secrets** (`scripts/audit-secrets.mjs`) |
| **Release** | `production-2026-09-19` (owner-declared, non-prerelease) |
| **CI** | `dde.yml` live surveillance badge (runs from workflow file state) |

## Market moment (dated, sourced — who else moved)

The agent-trust problem stopped being hypothetical in 2026 — but everyone
entered from a *different* layer, which is what makes the CoreGuard layer
distinct rather than crowded:

- **Authorization-at-request**: **x401** (Proof, 2026-06-25) lets an HTTP
  counterpart verify *who authorized an action and at what scope* — request time,
  credential-based. (dreaming.press/posts/x401-protocol-agent-authorization.html)
- **Human-anchoring**: **World ID + Coinbase AgentKit** (2026-03) binds agents
  to Orbit-verified humans (biometric) with x402 micropayments; **Self Protocol**
  (2026-04) binds human↔agent in zk on ERC-8004. (zestlab.io, blocmates)
- **Behavioral classification**: **Arkose Agent Trust Manager** (2026-06-16)
  classifies agent-ish traffic on Arkose's agentic browser. (arkoselabs.com)
- **Core side**: Core continues to push BTCfi as "the home of AI agents"
  (Core + **Aethir**, $100M ecosystem fund, 2025-02; GPU via Core Commit) and
  its 2026 roadmap monetizes fee-generating modules via **$CORE buybacks**
  (2026-05-04, bsc.news). (planning facts, re-verify before filing)

**The open layer nobody shipped:** *post-execution on-chain provenance* — did
the on-chain transaction actually match the declared authority, re-derivable by
any third party. That is exactly CoreGuard. Full matrix + overtake roadmap:
`docs/competitive-intelligence-overtake-2026-09-20.md`.

## Market logic (hypothesis, honestly labeled)

Two-sided, cost-side economics (no TVL, no capital burden — the product is
per-execution determinism). Buyers pay for **risk reduction** (auditability,
attribution, fail-closed evidence) — budgets that already fund audit,
compliance, and agent-ops.

- **U1** DeFi/BTCfi keepers — protocol treasury pays per-verification
- **U2** AI agents — platform / wallet infra pays per-execution
- **U3** Treasury / institutional — time-billed institutional package

Willingness-to-pay tests and competitor anchoring are **future experiments**,
gated on ElizaOS (Counterparty #1). No claims today.

## Plans (hypothesis — locked until Decision Gate)

| Plan | Price (hypothesis) | Limits |
|---|---|---|
| 🌱 Starter | Free | 10 verifications/week |
| ⚡ Pro | 1 CORE/month + on-chain `feeWei` | Unlimited, API, DDE/1 disputes |
| 🏢 Enterprise / Core team | Custom | SLA, policy customization, HTTP |

See `docs/pricing.md` — the machine view stamps `gated: true` on every output.

## Why Core

Core is the home of Bitcoin staking's execution layer. CoreGuard is built
for that exact stack: execution rooms guarded by cryptographic commitment,
proof, and receipt — currently proven live on Core Mainnet (chainId 1116).
The DApp surface carries Core's visual identity (gold) while keeping
CoreGuard's own (deep green) — every party keeps its color and fingerprint.

## Aligned programs (public, dated facts — planning only)

- **Core Connect Global Buildathon** (2025-06-02 → finale Token2049) — up to
  $1.2M pool, AI + Web3 infrastructure categories.
- **Core Commit Program** — 3-month, up to $2,500 CORE/month, business-model
  + PMF criteria (already pre-mapped in `docs/adoption/core-value.md`).
- **Core Ignition Builders' Incentive** — monthly up to 400K CORE across
  TVL/DAU/Volume.

These are planning references, not eligibility claims.

## The ask

> **"We need to see this running on Core."**

Not "fund us" — run the 90-second demo, verify the anchor, read the deck.
The fastest start:

```bash
git clone https://github.com/EslaM-X/coreguard.git
cd coreguard && npm install
npm run demo:90s         # recorded VERIFIED + fail-closed verdicts, ~2s
npm run demo:90s:live    # includes live re-derivation from Core Mainnet (read-only)
```

## Honesty box

- VERIFIED ≠ SAFE. No fabricated proof. No fake numbers.
- Pricing LOCKED (hypothesis only). Outreach: Core = PENDING, ElizaOS = WAITING.
- Not "Core-backed" until Core says so.
- Public read-only review ≠ endorsement: People's Court / Epistemic Labs stated
  explicitly that reviewing the fixture implies no endorsement, integration,
  pilot, or adjudication, and they did not run the verifier or check the
  chain.