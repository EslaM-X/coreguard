# G-1 — Prior-Art Gate (CGEP/1:AGENT-PROVENANCE)

**Date**: 2026-09-13 · **Status**: COMPLETE (informational; affects positioning + 5 spec blockers)
**Method**: direct review of ERC/EIP sources + ecosystem news; sources listed inline.
**Decision gated**: NO novelty claim ships before this gate; NO "AI detector" framing anywhere.

---

## 1. Verified Sources (this scan)

| Prior art | Source reviewed | Status |
|---|---|---|
| ERC-8004 Trustless Agents | `eips.ethereum.org/EIPS/eip-8004` — active **Draft** (Standards Track: ERC), creating-authority phase, not Final | Confirmed as Draft (NOT Final/mainnet) |
| ERC-8126 AI Agent Verification | `eips.ethereum.org/EIPS/eip-8126` — Standards Track: ERC, **Final** (created 2026-01-15); built on ERC-8004, requires `agentId` | Confirmed Final |
| Blockaid / Core | blockaid.io blog + docs | ⚠ Clarified (§2.1) |
| Sign Protocol / VC / C2PA | referenced as conceptual prior art | Referenced |

**Open verification item:** Blockaid's published "Core" integration is with the
**Core wallet of Avalanche** (2024), not Core Chain (Core DAO). Verbatim
clarification (adopted):

> Blockaid/Core clarification: published Core integration refers to the
> Core wallet on Avalanche; no claim is made here about Blockaid integration
> with Core DAO/Core Chain.

No further claim without a newer source proving otherwise.

---

## 2. What Exists (we do NOT compete there)

### 2.1 Adjacent standards/players

- **ERC-8004 (Trustless Agents, active Draft — NOT a mainnet "Final" status)** —
  three per-chain registries: **Identity** (ERC-721 `agentId` + URI-registration
  file), **Reputation** (signed feedback), **Validation** (validator hooks, 0–100
  response, TEE/zkML/stakers/judges). Uses EIP-712/EIP-1271 for wallet binding.
  Registration is cryptographically bound to the registry, but the standard
  alone does NOT guarantee advertised capabilities are functional or
  non-malicious — that gap is where layered verification systems plug in.
- **ERC-8126 (AI Agent Verification, Final, Jan 2026)** — defines per-agent
  layered verification **on top of ERC-8004 identity**: ETV (token), MCV
  (media/C2PA-style), SCV (solidity), WAV (web app), WV (wallet) + PDV (ZKP)
  + QCV (quantum) + a **unified 0–100 risk score**. Off-chain-first; may post
  attestations to ERC-8004 Validation Registry. **Requires** an ERC-8004
  `agentId` — it deliberately does NOT duplicate identity.
- **Sign Protocol / VC systems** — generic attestation schemas; reusable concept
  (attestation + schema + verification), not execution-bound.
- **Blockaid** — transaction simulation/validation, malicious-address blocking,
  dApp scanning, policy/security infra, AI-assisted research. NOT our layer.

### 2.2 Positioning consequence

| Layer | Question | Owner | CoreGuard stance |
|---|---|---|---|
| Agent identity | "Who is this agent?" | ERC-8004 | DO NOT rebuild |
| Agent technical verification | "Is this agent technically trustworthy / what risk score?" | ERC-8126 | DO NOT duplicate |
| Transaction threat detection | "Is this interaction risky/malicious?" | Blockaid | NOT our game |
| **Execution provenance + authority** | **"Who/what declared responsibility for THIS execution, under which authority, verifiable?"** | **CoreGuard AgentProof** | **OUR layer** |

---

## 3. CoreGuard Differentiation (the honest claim)

> CoreGuard AgentProof verifies **declared execution provenance** and
> **cryptographic authority** **for a specific execution** — who declared
> responsibility, what executor type, who stands behind it, whether authority
> was delegated, whether delegation was valid at execution, whether an
> attestation was supplied, and whether the whole claim re-verifies.

Not "who is the agent" (ERC-8004), not "is the agent trustworthy by score"
(ERC-8126), not "is this tx malicious" (Blockaid).

**And critically:** CoreGuard does NOT claim to detect human/AI from behavior.
Human/AI/automation states are **declared** (signer-bound) or **attested**
(verified third party), never behaviorally inferred.

---

## 4. Core Ecosystem Fit (strategic)

- Core's official direction documents AI agents among BTCFi growth tracks:
  autonomous systems executing strategies, managing positions, moving inside
  BTCFi, relying on Core for gas + yield routing; automated execution is
  presented as activity-driving for CORE.
- Core's official material already documents **AI agents and Smart Vaults on
  Core**, incl. VaultLayer/Vaulter — so the positioning has real substrate, not
  trend-jacking.
- Core Developer Hub programs (Core Commit Program, Core Rev+, Core Ventures
  BTC-Fi Accelerator, Core Cartel) + an ecosystem AI classification are
  candidate integration/funding surfaces (all subject to re-verification before
  any filing).
- **AgentProof positioning sentence:**
  > *"The execution-provenance layer for autonomous BTCFi on Core."*

---

## 5. Red Lines (unchanged, non-negotiable)

- ❌ "First in the world" / "no one does this" — blocked by this gate.
- ❌ "AI detector" / "human vs bot detector" / "AI authentication" as product
  framing.
- ❌ Claim novelty/patentability before prior-art + counsel (see
  `agent-provenance-ip.md`).
- ❌ Tampering with `scripts/verify-live.json`, Mainnet anchor, P0/P1, or frozen
  evidence.
- ❌ Fake metrics, fake partnerships, historical re-framing.

---

## 6. Gate Decision

# G-1 — Prior-Art Gate
## CGEP/1:AGENT-PROVENANCE

Date: 2026-09-13
Status: PASS — Boundary / Positioning Gate
Effect: Novelty claims blocked pending deeper prior-art + counsel
Implementation: NOT AUTHORIZED BY THIS GATE

**Decision:** G-1 establishes the external prior-art boundary for AgentProof.
It does NOT establish novelty, patentability, or freedom-to-operate.

No "first", "novel", "world's first", or equivalent claim may ship without a
deeper prior-art review and counsel.

No "AI detector", "human-vs-bot detector", or behavioral attribution claim is
permitted.

**Verified boundaries:**

- ERC-8004 — Agent identity / discovery / reputation / validation. Status:
  active Draft standard.
- ERC-8126 — AI-agent technical verification. Status: **Final ERC**.
- Blockaid — Transaction / threat security and simulation. Core clarification:
  published "Core" integration refers to **Core wallet on Avalanche**, not
  Core DAO/Core Chain.
- Sign/VC-style systems — Generic attestation and credential primitives.
- Core ecosystem — AI agents and autonomous BTCFi execution are an active
  ecosystem direction on Core.

**CoreGuard boundary:**

```
Agent identity               -> ERC-8004
AI-agent verification        -> ERC-8126
Transaction threat security  -> Blockaid-class systems

Execution provenance +
cryptographic authority +
execution-specific binding   -> CoreGuard AgentProof
```

**G-1 decision:**

- PASS as a positioning and novelty-restriction gate.
- CAP-1 remains pending until the specification blockers are closed
  (5 blockers listed in `agent-provenance-roadmap.md`).

---

*End of G-1 Prior-Art Gate.*

---

## G-1 Addendum — 2026 post-gate wave (2026-09-20 scan)

> The G-1 gate ran 2026-09-13. Between then and 2026-09-20 the agent-trust
> category shipped several products/protocols that sit *closer* to the
> CoreGuard layer than ERC-8004/8126. Recorded here so the prior-art picture
> (and any future patent filing) is complete and dated. **G-1's restrictions
> are unchanged: no novelty claim ships before counsel + deeper review.**
> Full matrix + overtake plan: `docs/competitive-intelligence-overtake-2026-09-20.md`.

### Newly recorded prior art (dated, sourced)

| Item | What it is | Date / source | Relation to CoreGuard |
|---|---|---|---|
| **x401 (Proof)** | HTTP challenge for cryptographic proof of **who authorized an action at what scope** (scoped VC + zk; Circle/OpenAI/Google/Okta named) | 2026-06-25, dreaming.press/posts/x401-protocol-agent-authorization.html | **closest conceptual neighbor**: "provenance of authority" ≠ our onchain execution provenance, but same *spirit* — treat as mandatory prior-art in any claim review |
| **World ID + AgentKit** | Anthropic-era human-anchoring: Orbit-verified humans back agents, x402 micropayments | 2026-03-17, zestlab.io + blocmates (Apr 2026) | Human↔agent binding via **biometrics**; CoreGuard is **declared + key-bound, no biometrics** |
| **Self Protocol** | zk human↔agent binding on ERC-8004 (proof-of-humanity, sybil resistance) | 2026-04 (blocmates) | Onchain agent identity + human binding layer |
| **Kite AI** | L1 for agents: Agent Passport, delegation, spend guardrails | 2026-04 (blocmates) | Agent identity + delegation rails |
| **t54** | Trust/safety for agent payments: x402-secure, risk scoring, prompt-injection fraud | 2026-04 (blocmates) | Risk-scoring for agent payments (not execution provenance) |
| **Arkose Agent Trust Manager** | Behavioral agent classification + enforcement (agentic browser detection) | 2026-06-16, arkoselabs.com | **Behavioral** bot-vs-human; CoreGuard explicitly forbids behavioral inference |
| **IETF web-bot-auth WG** | Standard client identity for the open web (RFC 9421-based) | 2026 interim (datatracker.ietf.org) | Bot identification at HTTP layer (identity, not execution) |

### Updated positioning consequence

| Layer | Question | Now also served by |
|---|---|---|
| Human-backs-agent | "Is this agent backed by a verified human?" | World ID+AgentKit, Self Protocol |
| Authorization-at-request | "Who authorized THIS action, at what scope?" | x401 |
| Behavioral agent detection | "Is this traffic an agent?" | Arkose, web-bot-auth |
| **Execution provenance + authority, verified on-chain** | **"Who declared responsibility for THIS on-chain execution, under which authority, re-verifiable?"** | **CoreGuard (unchanged, still ours)** |

**G-1 Addendum decision: PASS as a boundary update.** No claim change. The new
items make the *evidence-anchored, onchain, post-execution* layer even more
clearly distinct — and any patent disclosure **must** list x401 and
World/AgentKit/Self as material prior art (see `submission/15-egypt-patent-file.md`).