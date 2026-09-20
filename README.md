<div align="center">

<p align="center">
  <img src="assets/core-guard-logo.png" alt="CoreGuard" width="78%">
</p>

# ⛨ CoreGuard

### Verifiable Execution Truth Layer for Bitcoin DeFi

**CoreGuard doesn't tell you whether a transaction looks safe.**
**It produces independently verifiable evidence of whether execution conformed to what was authorized.**

[![CI](https://github.com/EslaM-X/coreguard/actions/workflows/ci.yml/badge.svg)](https://github.com/EslaM-X/coreguard/actions/workflows/ci.yml)
[![DDE Evidence Cycle](https://github.com/EslaM-X/coreguard/actions/workflows/dde.yml/badge.svg)](https://github.com/EslaM-X/coreguard/actions/workflows/dde.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org)
[![Solidity](https://img.shields.io/badge/solidity-0.8.24-363636.svg?logo=solidity&logoColor=white)](https://github.com/foundry-rs/foundry)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Spec](https://img.shields.io/badge/CGEP%2F1-Draft-yellow.svg)](spec/CGEP-1.md)

*Off-chain engine · Solidity registry · CGEP/1 draft spec. Real Core Mainnet execution verified · on-chain anchor live on Core (chainId 1116) · VERIFIED ANCHOR INTEGRITY*

</div>

---

## The problem

Programmable money moved to Bitcoin. Core gives BTC a native programmable layer, and
every swap, strategy, vault interaction and BTCFI position is executed by code — and
**execution is not the same as intent**. A front-run, a reentrancy, a hidden hop or a
mutated calldata can make the transaction "go through" while doing something
completely different from what was authorized.

Existing transaction-security and simulation systems address important parts of this
problem, but CoreGuard focuses on the missing end-to-end evidence workflow:
predeclared intent and policy → observed execution → independently reproducible
evidence → Core-native commitment anchoring.

## What CoreGuard is

CoreGuard is an **execution-truth protocol**: a deterministic pipeline that turns a
declared intent + policy and an on-chain execution into a single, cryptographically
committed **Execution Receipt** that anyone can independently re-verify — with zero
RPC, zero trust in the issuer, and an on-chain anchor on Core.

```
 DECLARED (before execution)          OBSERVED (after execution)
 ─────────────────────────────        ─────────────────────────────
 INTENT  ──┐                                 ┌── on-chain tx
 POLICY  ──┼── canonical hash ──┐            ├── receipt
 EXPECTED ─┘                    │            ├── block (state pinned)
                                │            └── trace / state delta
                                ▼                       │
                        COMMITMENT (anchor)             │
                                │                       │
                                └──► COMPARISON ◄───────┘
                                       │
                                       ▼
                             EVIDENCE BUNDLE
                                       │
                                       ▼
                              EXECUTION RECEIPT
                                       │
         ┌─────────────────────────────┴──────────────┐
         ▼                                           ▼
  INDEPENDENT VERIFIER                    EVIDENCE ANCHOR
  (no RPC, no trust)                      on Core (commitments only)
```

### Verification levels

| Level | Meaning |
|---|---|
| **L0 · Commitment** | Intent + policy committed (hashed) before execution |
| **L1 · Chain Receipt** | Execution captured from chain, receipt pinned to block hash |
| **L2 · Deterministic Replay** | Execution replayed/compared against committed intent (MVP) |
| L3 · Merkle proof | Compact, privacy-friendly proof of a receipt sub-tree |
| L4 · Zero-knowledge | Fully private execution proofs (research phase) |

### Honest scope

- **VERIFIED ≠ SAFE.** CoreGuard answers *"did execution conform to authorization?"* —
  never *"is this strategy profitable / safe?"* Risk is reported as discrete findings,
  never a fuzzy score.
- **Anchor ≠ execution proof.** The registry proves that a specific commitment was
  anchored on Core. The execution claim is supported by the independently verifiable
  evidence/replay bound to that commitment.
- `v0.1` ships deterministic, evaluation-free rules: VALUE_LIMIT · TARGET_ALLOWLIST ·
  RECIPIENT_ALLOWLIST · SELECTOR_ALLOWLIST · DEADLINE · SLIPPAGE_BPS (+ ORACLE_BOUND guardrail).
- On-chain `v0.1` is a **single contract** storing commitments only — evidence lives
  off-chain, in the receipt. No surveillance, no oracles, no protocol custody.

## Testnet2 validation (funding-gated, not yet executed)

The on-chain Core Testnet2 (1114) hardening campaign is **`PREPARED /
FUNDING-BLOCKED`** — the operator wallet holds **0 tCORE2** (see
[docs/COMMUNITY.md](docs/COMMUNITY.md)), so **no live broadcast has been made**.
The staged campaign (deploy EvidenceRegistry → commitIntent → anchorProof →
three-proof on-chain verification) is ready to run the moment funding arrives.

The engine itself is proven on the **deterministic 73/73 adversarial corpus** and
the **frozen live Core Mainnet anchor** below.

### On-chain anchor: live on Core Mainnet

The anchor flow (deploy → commitIntent → anchorProof → verifyCommitment) is
**live on Core Mainnet (chainId 1116)**:

```
Registry:       0x037dF08F2d43c5D03759279Fe35664f6AFf9EA6E
Receipt ID:     0xeaa87ec1…44eb6   (deterministically recomputable)
Commitment:     0xc0dbfb45…1052
Proof ID:       0xecd9e6b3…a6b8
Verdict:        VERIFIED ANCHOR INTEGRITY  (A+B+C)
```

Independent cross-RPC verification (rpc.coredao.org + rpc.ankr.com) confirms the
contract bytecode, both `commitIntent`/`anchorProof` receipts, their events, and
`verifyCommitment(receiptId|proofId, commitment) == true` on-chain.
Full evidence bundle: [scripts/verify-live.json](scripts/verify-live.json)
(frozen historical record; live re-runs write to `scripts/verify-live.regenerated.json`).
See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for how to reproduce every value.

## Quick start

```bash
# 1. Install (no framework, zero runtime deps — Node ≥ 18 + Foundry optional)
npm install

# 2. Test + benchmark
npm test              # 841 tests — canonicalization, policy, tamper, anchor, verifier, P1/P2, provenance, pricing, encoding, attack-lab, DDE delivery/dispute suites
npm run corpus        # deterministic 73-scenario adversarial corpus
npm run benchmark     # 73/73 pass
# Authoritative numbers live in docs/STATUS.md (one source of truth).

# 3. Runnable demos
node examples/transfer/run-demo.js    # transfer: valid → mutate → tamper → INVALID
node examples/swap/run-demo.js        # swap: slippage guard + substitution → INVALID
node examples/multistep/run-demo.js   # batch strategy: commitment binds one execution
node examples/live/live-verify.js     # verify any on-chain tx via public RPC (read-only, needs no funds)

# 4. Phase 1 — Execution Firewall + protocol SDK (plan-90d-repo §2)
npm run demo:vault                    # reference Vault ladder: deposit ALLOW → VERIFIED → anchor plan
npm run demo:attack                   # re-runs the same intent; six attacks BLOCKED + post INVALID
npm run create:integration -- my-dapp # scaffold a consumer integration (intent/policy/verifier/tests)
```

### Phase 1 cheat sheet (`npx coreguard demo`, `@coreguard/sdk`)

```bash
npx coreguard demo allow     # DEPOSIT 1 BTC → Vault A, recipient = mine, slippage ≤ 50bps
npx coreguard demo attack    # same intent, six attacks BLOCKED (target · recipient · amount
                             # · callback · expired · calldata) + mutated execution → INVALID
```

The `@coreguard/sdk` guard surface drives this whole ladder in three calls:

```js
import { createGuard } from "@coreguard/sdk";
const guard = createGuard();
const pre   = await guard.authorize(intent, { declaration, policy, activePolicyIds, simulation, authorityAtState, evm });
const v     = await guard.verify({ chain, intent, policy, trace });   // VERIFIED | INVALID | …
const plan  = await guard.anchor(v.receipt);                          // CGEP/1:PROOF commitment + proofId
```

`authorize` is PRE-only and fail-closed (never ALLOWs unmodeled context); `verify`
recomputes every receiptId from the payload; `anchor` is a pure offline commitment
plan. See [docs/plan-90d-repo.md](docs/plan-90d-repo.md) §2.

### CLI

```bash
node packages/cli/src/index.js analyze    --intent <...> --policy <...> --trace <...>   # on-chain or offline
node packages/cli/src/index.js verify     --receipt <...> [--intent <...> --policy <...> --trace <...>]
node packages/cli/src/index.js verify-run --receipt <...> [--evidence <...> --intent <...> --policy <...> --trace <...>] [--rpc <url>] [--json]
                                           # CGEP/1:VERIFY-RUN surface; exit 0=VERIFIED 2=INVALID 3=UNVERIFIED 4=INCONCLUSIVE
                                           # e.g. --bundle examples/transfer/verify-bundle.json
node packages/cli/src/index.js verify-provenance --manifest <...> --evidence <...> [--json]
                                           # CGEP/1:VERIFY-PROVENANCE surface (AgentProof); same exit-code discipline
node packages/cli/src/index.js report     --receipt <...>                               # human-readable receipt
node packages/cli/src/index.js demo   allow|attack     # reference Vault ladder (allow | attack)
npx create-coreguard-integration <name>                # scaffold a consumer integration project
```

`verify-run` is read-only: `--rpc` performs chainId/transaction/receipt/block
binding only — it never sends or broadcasts. See [docs/VERIFY-RUN.md](docs/VERIFY-RUN.md).

## Payment gating integration (DDE/1)

The Delivery & Dispute Evidence layer is embeddable: any agent platform, escrow
provider or settlement tooling can hold a payout until delivery evidence **and**
an explicit party acceptance say otherwise — while never letting execution proof
decide conformity. One sentence binds every report the SDK returns:

> **Execution verification does not decide delivery conformity.**

### The lock/release arc

The gate has exactly one key, and it is not a receipt:

| Act | What happens | Gate |
|---|---|---|
| pending | delivery submitted, no verdict yet | 🔒 HOLD |
| party act | client records **REJECTED** on a named criterion (e.g. C-QUALITY: 2 color tokens, 3 required) | 🔒 HOLD |
| tamper | provider re-submits after flipping one artifact byte → `422`, E3 names the byte and both hashes | 🔒 HOLD |
| **the boundary** | evidence **VERIFIED** on the wire, client's **REJECTED** verdict on file — execution and payment settlement proven, **neither decides conformity** | 🔒 HOLD |
| counterfactual | client records **ACCEPTED** on the same criteria evaluations | ✓ **RELEASE** |

The only thing that opens the gate is a party acceptance record resting on
criterion evaluations. Signatures, receipts and settlement are admissible
evidence — never a verdict.

### Two-line SDK integration

```js
import { verifyFixture, releaseWhen } from "@coreguard/delivery/sdk";

const report = await verifyFixture({ fixtureDir: "./cases/case-17" }); // or { fixture }
const gate   = releaseWhen(report, () => acceptanceOnFile() === "ACCEPTED"); // YOUR condition
if (!gate.release) holdPayout(gate.reasons); // named reasons, never vague symbols
else releasePayout();
```

- `verifyFixture` runs the **full fail-closed gate** (F0–F3, E3–E5, B1–B3) —
  zero checks added, zero stripped. Every report carries the boundary banner
  (`boundaryCode: "DDE-BOUNDARY"`), so quoting a report quotes the boundary.
- `releaseWhen` **structurally refuses** release without a VERIFIED report,
  even if your predicate says yes; a throwing predicate is a HOLD, not a crash.
- Consent replay (E5) runs only with an EVM adapter you inject; absent →
  `NOT_RUN`, never fabricated. The SDK never signs, never broadcasts, never
  judges conformity.

(Inside this repo, import from `packages/delivery/sdk.js` — the package
specifier above is the installed surface with the same exports.)

### Or verify over HTTP

```bash
# from a repo checkout — loopback by default; a public bind is a deliberate act
node -e "import('./packages/delivery/http.js').then(m => m.startDeliveryEndpoint({ port: 8787 }))"

# from an installed package: import { startDeliveryEndpoint } from "@coreguard/delivery/http";
curl -sS -X POST http://127.0.0.1:8787/verify \
  -H "content-type: application/json" --data-binary @fixture.json
# → 200 VERIFIED (decision: EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE)
#   or 422 FIXTURE_REJECTED with the failing check named
```

Per-address rate limiting (429 + `retry-after`, `/health` exempt), a pre-parse
1 MiB size gate, and a decision vocabulary that never exceeds
`EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE` /
`FIXTURE_REJECTED` — no network path can decide conformity. Full status-code
table and wire honesty rules: [docs/delivery-dispute-boundary.md](docs/delivery-dispute-boundary.md) §6.

### Run the worked example

```bash
node examples/agent-platform-integration/run-integration-demo.mjs  # SDK arc — 4 holds, 1 release (exit contract)
node examples/agent-platform-integration/run-http-payout-gate.mjs  # wire-level — incl. a criteria-based scenario rejection
npm run benchmark:dde                                              # verify perf: median < 50ms budget (measured ~0.7ms)
```

Both demos exit `0` only on the exact arc: HOLD ×4 → RELEASE ×1 — any drift
from the boundary fails them, and CI runs both on every push. Fixture and
records: [examples/delivery-fixture/](examples/delivery-fixture/) · live
bilingual demo: [DELIVERY-DISPUTE-DEMO.html](https://eslam-x.github.io/coreguard/DELIVERY-DISPUTE-DEMO.html).

Got a **real** paid transaction with two consenting parties? The
[real-fixture intake kit](examples/real-fixture-intake/) converts it into a
redacted review-ready fixture: bilateral consent with a named disclosure
scope, a removal checklist, a fail-closed pre-publication gate, and the
submission procedure.

## AgentProof — actor provenance

**Who is actually behind this execution?** AgentProof extends the receipt with a
two-part answer that is *declared, never inferred*:

- **executorType** (CGEP/1 §4 taxonomy): `HUMAN` · `AI_AGENT` · `BOT` ·
  `AUTOMATION` · `ORGANIZATION` · `MULTISIG` · `CUSTODIAN` ·
  `SMART_CONTRACT` · `PROTOCOL` · `UNKNOWN`
- **cryptographic authority**: an EIP-712-signed REGISTRATION (identity root)
  + per-execution STAMP manifest, replay-verified against the actual `tx.from`
  (direct or via signed delegation chain), anchored to the EvidenceRegistry.

A human is **never** shown as proven from behavior — human-ness renders
`DECLARED` or `ATTESTED` at most (personality is never guessed). Badge states
come from the open verifier only, so every badge is reproducible by `npm run
verify-provenance`. Phase A = EOA signer binding; smart-contract/multisig
authorization needs EIP-1271 (Phase B). Spec: [spec/CGEP-1-AGENT-PROVENANCE.md](spec/CGEP-1-AGENT-PROVENANCE.md).

```bash
npm run verify-provenance -- --manifest examples/provenance/manifest.json --evidence examples/provenance/evidence.json
# exit code: 0=verified · 1=cli/input error · 2=invalid · 3=not proven/unverified · 4=inconclusive
```

## Who ran this? — the moment, and why now

Autonomous actors now move value: AI agents, keeper bots, trading robots,
treasury daemons and company-controlled multisigs. The fastest-growing question
in that world has no verifiable answer today — **not "is this transaction
risky?", but "who declared responsibility for this exact execution, under what
authority, and can anyone prove it afterward?"** CoreGuard is the execution-
provenance + cryptographic-authority layer for that question, and AgentProof
answers *who* as a **declared, signer-bound** fact (never a behavioral guess).

> The honest positioning line, safe to repeat: **CoreGuard verifies declared
> execution provenance and cryptographic authority for a specific execution.**
> It is not an agent-identity registry, not a trust-score system, not an
> "AI detector". See `spec/agent-provenance-prior-art.md` (Gate G-1).

## Built for Core

CoreGuard is built for Core's stack — the native programmable layer for
Bitcoin — and is already proven live there (chainId 1116; anchor verdict
VERIFIED ANCHOR INTEGRITY; independent cross-RPC readback). The product surface
[DApp](docs/coreguard-dapp-core.html) carries **Core's visual identity (gold)
alongside CoreGuard's own (deep green)**: consistent with the ecosystem, never
a rebrand — every party keeps its own color and fingerprint.

Aligned Core programs are tracked as **public, dated, planning-only facts**
(never eligibility claims): Core Connect Global Buildathon (AI + Web3 infra
categories), Core Commit Program (business-model / PMF criteria), and Core
Ignition Builders' Incentive. Details + the criteria pre-mapping live in
[docs/adoption/](docs/adoption/).

## Plans and pricing (hypothesis — gate-locked)

The product shows a three-tier structure — **Starter (free, 10/week)** →
**Pro** → **Enterprise / Core team** — and the on-chain commission side is real:
`EvidenceRegistryV3` charges a **flat, explicit `feeWei`** paid atomically with
the anchor (any mismatch reverts), routed to an operator-only treasury, with
`feeWei = 0` degenerating to the free path.

**No committed pricing.** Per standing governance, pricing stays locked until
the Decision Gate opens (after Counterparty #1). The machine view stamps
`gated: true` on every output and never bills. See [docs/pricing.md](docs/pricing.md).

## On-chain

| Network | Chain ID | RPC |
|---|---|---|
| Core **Testnet2** | 1114 | `https://rpc.test2.btcs.network` |
| Core Mainnet | 1116 | `https://rpc.coredao.org` |

```bash
forge build                                   # 0.1 evidence registry (clean)
powershell -File scripts/anchor-local.ps1      # or: bash scripts/anchor-local.sh
                                              # local anvil fork anchor → scripts/anchor-proof.json
npm run anchor:plan                           # → scripts/live-anchor-planned.json (offline proofId plan)
npm run anchor:verify                         # → scripts/verify-live.regenerated.json (frozen bundle stays)
```

## Repository layout

```
spec/        CGEP/1 (draft) · master spec · canonical encoding · receipt · levels ·
             threat model · privacy model · competitive kill matrix · killer memos
packages/    canonical · intent · policy · trace · evidence · firewall · verifier · evm · sdk · cli · delivery · provenance · pricing   (ESM)
             — sdk/guard.js = guard.authorize/verify/anchor Phase-1 surface
             — provenance = Actor Identity Card + AgentProof surfaces (declared, never detected)
             — pricing = hypothesis plan table, Decision-Gate-locked (no enforcement, never bills)
             — delivery = DDE/1 execution/acceptance boundary (engine + SDK + HTTP endpoint, zero-dep)
contracts/   EvidenceRegistry.sol — commitment registry (deployable, `--legacy`)
benchmarks/  generator + 73-scenario corpus: valid/invalid/mutations/tamper/performance
test/        canonicalization · policy · tamper suites + adversarial runner + P1 suites
             · firewall/ (engine + ws1) · firewall/attack-lab · sdk (verifyBinding + guard)
examples/    transfer · swap · multistep · live · vault (Phase-1 reference ladder) (runnable, with READMEs + artifacts)
             delivery-fixture/ — DDE/1 bilateral dispute fixture (synthetic, replayable: node examples/delivery-fixture/verify-fixture.mjs)
             agent-platform-integration/ — payout gated on DDE: SDK arc + wire-level gate with a criteria-based scenario rejection (runnable)
             real-fixture-intake/ — real-case intake: consent + signed disclosure scope → removal gate → convert.mjs → review-ready REAL fixture
             — external integration path (three tiers): delivery-fixture = schema proof · agent-platform-integration = embed the gate · real-fixture-intake = go real
templates/   integration/ — consumer scaffold for create-coreguard-integration
scripts/     anchor-local.ps1/.sh — local fork anchor proof ·
             compute-commitment — offline commitment plan ·
             verify-anchor — three-proofs anchor checker
docs/        deployment · funding · contributing · security · delivery-dispute-boundary.md (DDE/1) · pricing.md
             DELIVERY-DISPUTE-DEMO.html — live bilingual DDE demo
             coreguard-dapp-core.html — Core-branded DApp surface (identity · plans · treasury · on-Core)
docs/adoption/  WS-5 — adoption & institutional proof (demand/evidence layer)
submission/  Investor / Core Submission Pack (15 items) — run `npm run demo:90s`
```

## Roadmap

| Milestone | Status |
|---|---|
| **v0.1 — Evidence protocol** (intent → trace → evidence → receipt → verifier → anchor) | 🔬 Testnet2 campaign PREPARED / FUNDING-BLOCKED (engine 73/73 PASS, live Mainnet anchor below) |
| **v0.1 — On-chain anchor on Core** | ✅ live on Mainnet `0x037dF08F2d43c5D03759279Fe35664f6AFf9EA6E` (VERIFIED ANCHOR INTEGRITY) |
| **v0.2 — Execution Firewall** (simulation-gated smart accounts, intent-based authorization) | ✅ Phase 1 delivered: engine (`packages/firewall`, attack-lab) + `@coreguard/sdk` guard.* + reference Vault ladder (`npx coreguard demo allow|attack`) + `coreguard-verify` CI action (plan-90d-repo §2) |
| **v0.3 — Passport / reputation + risk findings** | 📋 designed |
| **v0.4 — ZK privacy proofs (L4)** | 🔬 research |

## Work with us

CoreGuard is looking for funding and builders — milestone-based, Core-native,
auditor-honest. Details: [docs/FUNDING.md](docs/FUNDING.md).

Evaluating us? Start with the [Core Submission Pack (15 items)](submission/) —
`npm install && npm run demo:90s` reproduces the Mainnet-verified demo in seconds.

## License

MIT — see [LICENSE](LICENSE). Protocol spec `CGEP/1` is a draft for open discussion, not a claim of standard.