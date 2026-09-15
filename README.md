<div align="center">

<p align="center">
  <img src="assets/core-guard-logo.png" alt="CoreGuard" width="78%">
</p>

# ⛨ CoreGuard

### Verifiable Execution Truth Layer for Bitcoin DeFi

**CoreGuard doesn't tell you whether a transaction looks safe.**
**It produces independently verifiable evidence of whether execution conformed to what was authorized.**

[![CI](https://github.com/EslaM-X/coreguard/actions/workflows/ci.yml/badge.svg)](https://github.com/EslaM-X/coreguard/actions/workflows/ci.yml)
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
npm test              # 125 tests — canonicalization, policy, tamper, anchor, P1 suites
npm run corpus        # deterministic 73-scenario adversarial corpus
npm run benchmark     # 73/73 pass

# 3. Runnable demos
node examples/transfer/run-demo.js    # transfer: valid → mutate → tamper → INVALID
node examples/swap/run-demo.js        # swap: slippage guard + substitution → INVALID
node examples/multistep/run-demo.js   # batch strategy: commitment binds one execution
node examples/live/live-verify.js     # verify any on-chain tx via public RPC (read-only, needs no funds)
```

### CLI

```bash
node packages/cli/src/index.js analyze    --intent <...> --policy <...> --trace <...>   # on-chain or offline
node packages/cli/src/index.js verify     --receipt <...> [--intent <...> --policy <...> --trace <...>]
node packages/cli/src/index.js verify-run --receipt <...> [--evidence <...> --intent <...> --policy <...> --trace <...>] [--rpc <url>] [--json]
                                           # CGEP/1:VERIFY-RUN surface; exit 0=VERIFIED 2=INVALID 3=UNVERIFIED 4=INCONCLUSIVE
                                           # e.g. --bundle examples/transfer/verify-bundle.json
node packages/cli/src/index.js report     --receipt <...>                               # human-readable receipt
```

`verify-run` is read-only: `--rpc` performs chainId/transaction/receipt/block
binding only — it never sends or broadcasts. See [docs/VERIFY-RUN.md](docs/VERIFY-RUN.md).

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
packages/    canonical · intent · policy · trace · evidence · verifier (engine + verify-run surface) · cli   (ESM, zero deps)
contracts/   EvidenceRegistry.sol — commitment registry (deployable, `--legacy`)
benchmarks/  generator + 73-scenario corpus: valid/invalid/mutations/tamper/performance
test/        canonicalization · policy · tamper suites + adversarial runner + P1 suites
examples/    transfer · swap · multistep · live (runnable, with READMEs + artifacts)
scripts/     anchor-local.ps1/.sh — local fork anchor proof ·
             compute-commitment — offline commitment plan ·
             verify-anchor — three-proofs anchor checker
docs/        deployment · funding · contributing · security
docs/adoption/  WS-5 — adoption & institutional proof (demand/evidence layer)
submission/  Investor / Core Submission Pack (13 items) — run `npm run demo:90s`
```

## Roadmap

| Milestone | Status |
|---|---|
| **v0.1 — Evidence protocol** (intent → trace → evidence → receipt → verifier → anchor) | 🔬 Testnet2 campaign PREPARED / FUNDING-BLOCKED (engine 73/73 PASS, live Mainnet anchor below) |
| **v0.1 — On-chain anchor on Core** | ✅ live on Mainnet `0x037dF08F2d43c5D03759279Fe35664f6AFf9EA6E` (VERIFIED ANCHOR INTEGRITY) |
| **v0.2 — Execution Firewall** (simulation-gated smart accounts, intent-based authorization) | 📋 designed |
| **v0.3 — Passport / reputation + risk findings** | 📋 designed |
| **v0.4 — ZK privacy proofs (L4)** | 🔬 research |

## Work with us

CoreGuard is looking for funding and builders — milestone-based, Core-native,
auditor-honest. Details: [docs/FUNDING.md](docs/FUNDING.md).

Evaluating us? Start with the [Core Submission Pack (13 items)](submission/) —
`npm install && npm run demo:90s` reproduces the Mainnet-verified demo in seconds.

## License

MIT — see [LICENSE](LICENSE). Protocol spec `CGEP/1` is a draft for open discussion, not a claim of standard.