# Competitive Intelligence + Overtake Roadmap — 2026-09-20 scan

> **Status: dated, sourced, facts-only.** Every row cites a public source + date.
> This is the honest basis for "are our features already built by others?" and
> for the overtake plan. **No novelty claim is made anywhere** (prior-art gate
> G-1 stays binding). The point of this document is *positioning that survives
> contact with the market*, not a "we are first" banner.
>
> Relation to `spec/agent-provenance-prior-art.md`: that gate was last run
> **2026-09-13** (ERC-8004 Draft, ERC-8126 Final, Blockaid). This scan adds the
> **post-gate wave of 2026** products/protocols that are closer to our layer.

## 1. The 2026 wave (what actually shipped)

The agent-trust category exploded **after** our G-1 gate run. Directly relevant:

| Player / protocol | What it does | Date / source | Nearest to our layer |
|---|---|---|---|
| **World ID + Coinbase AgentKit** | Orbit-verified humans anchor agents; x402 stablecoin micropayments | 2026-03-17, zestlab.io/trends/world-id-coinbase-ai-agents-2026 | Human-bound agent identity (biometric) |
| **x401 (Proof)** | HTTP challenge for **proof of who authorized an action at what scope** (scoped VC + zk); Circle/OpenAI/Google/Okta named | 2026-06-25, dreaming.press/posts/x401-protocol-agent-authorization.html | **Authorization provenance — closest conceptual neighbor** |
| **Arkose Agent Trust Manager** | Behavioral agent classification + enforcement spectrum | 2026-06-16, arkoselabs.com/blog/ai-agent-detection-bot-or-human | Bot-vs-human classification (behavioral — opposite of us) |
| **Self Protocol** | zk human↔agent binding on ERC-8004, proof-of-humanity, sybil resistance | blocmates.com/is-the-human-layer-in-crypto-dying (Apr 2026) | Onchain agent identity + human binding |
| **Kite AI** | L1 "for the agentic internet": Agent Passport, delegation, spend rules | ibid. | Agent identity + delegation rail |
| **t54** | Trust/safety layer for agent payments (x402-secure), risk scoring, prompt-injection fraud | ibid. | Risk scoring for agent payments |
| **IETF web-bot-auth (WG)** | Standard client identity for the open web (HTTP Message Signatures, RFC 9421) | interim-2026-webbotauth-02 slides | Bot identification at HTTP layer |

Two of these deserve a hard look because they are not "bot-vs-human" at all —
they moved the question to **authorization / provenance**, which is exactly the
question CoreGuard was built around (CGEP/1 + AgentProof):

- **x401** ("who authorized this action, at this scope") ≈ our
  **authority + delegation** claim — but as an **HTTP request-time challenge**.
- **World/AgentKit** ("is this agent backed by a verified human") ≈ our
  **actor-declaration binding** — but **biometric/behavioral**, not declarative+keybound.

## 2. Where CoreGuard differs (honest, from committed code — not intent)

| Dimension | x401 / World / Arkose | CoreGuard (committed, tested) |
|---|---|---|
| Question | Who authorized / who is the human / is it a bot? | **Did THIS on-chain execution conform to the declared authority + intent?** |
| Target | HTTP requests / web sessions | **On-chain executions on Core (chainId 1116)** |
| Method | Counterpart credential / biometric / behavioral fingerprint | **Deterministic, fail-closed, anchorable evidence (commitment → proof → receipt → verdict)** |
| Verdicts | Accept/reject a request | **VERIFIED / INVALID / NOT_PROVEN — independently recomputable, no heuristics** |
| Actor identity | Human-backed (biometric) or scored | **Declared actor card: HUMAN / AGENT / BOT / ROBOT / COMPANY + manufacturer/model/version — never behaviorally inferred** |
| Onchain economics | Outside chain | **`EvidenceRegistryV3`: flat `feeWei` commission + operator treasury (Foundry 34/34)** |
| Disputes | n/a | **DDE/1 boundary: freezes, never names a winner** |

These are **not** "we are better". They are *different layers*: request-time
authorization (x401), human-anchoring (World), behavioral classification
(Arkose) — CoreGuard's layer is **post-execution cryptographic provenance for
autonomous value-movers on Core**, with an identity card that says *declared,
not detected*.

## 3. The overtake plan (feature-by-feature, gated)

"Bigger than them" means: **interoperate with their rails while keeping our
evidence spine.** Roadmap — each item is a feature, not a claim:

1. **x401/VC adapter** — accept a scoped Verifiable Credential (PROOF-REQUIRED
   flow) as an `ATTESTED` input to the actor card. Their protocol becomes our
   attestation source; our receipt still re-verifies onchain. *Gate: spec review.*
2. **ERC-8004 interop** — read an ERC-8004 `agentId` as an optional identity
   root for the actor card (we never rebuild their registry). *Gate: spec review.*
3. **Attestation-chain verdict** — extend `verify` to walk a bounded delegation
   chain (`DECLARED → ATTESTED → VERIFIED`) with per-hop evidence; visible in
   the existing `verify-provenance` exit-code surface.
4. **Agent-platform SDK (already delivered base)** — the DDE/1 payout gate +
   HTTP endpoint give platforms a drop-in "hold until delivery + acceptance";
   extend with a clear reference integration for Core agents (Aethir-era bots).
5. **Per-execution pricing (locked)** — commission is already on-chain
   (`feeWei`, treasury); amounts stay hypothesis until the Decision Gate.

## 4. Core ecosystem context (dated facts — planning only)

- Core Foundation + **Aethir** announced AI-agent support for BTCfi with access
  to Aethir's GPU cloud through Core Commit incubator (2025-02-12,
  thedefiant.io / chainwire). Core aims to be "the home of BTCfi AI agents"
  (Rich Rines, quoted in both).
- Core's **2026 roadmap** shifts to revenue-funded **$CORE buybacks** across
  SatPay / AMP / LST / Dual-Staking modules (2026-05-04, bsc.news) — i.e., Core
  rewards **fee-generating activity**.
- Scale figures reported by Core: 37M+ addresses, 348M+ transactions, $850M+
  TVL since Jan-2023 mainnet; ~90% of BTC hashrate backing Satoshi Plus
  (2026 claims, per Defiant/bsc.news quotes). *Independent re-verification
  before any filing; these are third-party-reported, not CoreGuard-sourced.*

**Consequence for CoreGuard**: a fee-generating, buyback-aligned primitive
(per-execution verification with onchain commission) is the kind of activity
Core's own 2026 incentives monetize. That is a *fit argument*, not an
endorsement.

## Honesty box

- Sources are public links + dates; re-verify before quoting externally.
- No "first/novel/no competitors" language anywhere (G-1 binding).
- No behavioral human/bot detection claim — CoreGuard declares or attests.
- Pricing remains Decision-Gate-locked; this doc proposes features, not prices.