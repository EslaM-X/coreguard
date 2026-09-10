<div align="center">

# ⛨ CoreGuard

### Verifiable Execution Truth Layer for Bitcoin DeFi

**CoreGuard doesn't tell you whether a transaction looks safe.**
**It produces independently verifiable evidence of whether execution conformed to what was authorized.**

[![CI](https://github.com/EslaM-X/coreguard/actions/workflows/ci.yml/badge.svg)](https://github.com/EslaM-X/coreguard/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org)
[![Solidity](https://img.shields.io/badge/solidity-0.8.24-363636.svg?logo=solidity&logoColor=white)](https://github.com/foundry-rs/foundry)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Spec](https://img.shields.io/badge/CGEP%2F1-Draft-yellow.svg)](spec/CGEP-1.md)

*Off-chain engine · Solidity registry · CGEP/1 draft spec · Core Testnet2 verified live*

</div>

---

## The problem

Programmable money moved to Bitcoin. Core gives BTC a native programmable layer, and
every swap, strategy, vault interaction and BTCFI position is executed by code — and
**execution is not the same as intent**. A front-run, a reentrancy, a hidden hop or a
mutated calldata can make the transaction "go through" while doing something
completely different from what was authorized.

Today there is **no production-grade evidence layer** that lets a user, a protocol,
an auditor or a regulator *prove* — cheaply, independently and on-chain — that an
execution conformed to a declared intent and policy. That is the gap CoreGuard fills.

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
  (no RPC, no trust)                      on Core Testnet2
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
- `v0.1` ships deterministic, evaluation-free rules: VALUE_LIMIT · TARGET_ALLOWLIST ·
  RECIPIENT_ALLOWLIST · SELECTOR_ALLOWLIST · DEADLINE · SLIPPAGE_BPS (+ ORACLE_BOUND guardrail).
- On-chain `v0.1` is a **single contract** storing commitments only — evidence lives
  off-chain, in the receipt. No surveillance, no oracles, no protocol custody.

## Live proof (v0.1 engine, real data)

The pipeline was run against a **real Core Testnet2 transaction**:

```
Chain ID:      1114 (Core Testnet2)
Transaction:   0x01d6f346786c5cba5140bd0a81263f89b46605c4f1f899cac4a83f9b062e2801
Block:         18592684 · 0xb3ffe432…
State pinning: blockNumber + blockHash captured pre/post
Policy:        4/4 rules PASS · SATISFIED
Receipt ID:    0x5147e491…5ffd669 (deterministically recomputable)
Verifier:      6/6 checks PASS · VERIFIED
```

Re-run it yourself (no node tracing required — plain public RPC):

```bash
node examples/live/live-verify.js --hash 0x01d6f346786c5cba5140bd0a81263f89b46605c4f1f899cac4a83f9b062e2801
```

The on-chain **anchor flow** (deploy → commitIntent → anchorProof → verifyCommitment)
is proven on a local `anvil` fork of Testnet2; the same commands target live Testnet2
as soon as the deployer wallet is funded (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).

## Quick start

```bash
# 1. Install (no framework, zero runtime deps — Node ≥ 18 + Foundry optional)
npm install

# 2. Test + benchmark
npm test              # 30 tests — canonicalization, policy, tamper
npm run corpus        # deterministic 61-scenario adversarial corpus
npm run benchmark     # 61/61 pass

# 3. Runnable demos
node examples/transfer/run-demo.js    # transfer: valid → mutate → tamper → INVALID
node examples/swap/run-demo.js        # swap: slippage guard + substitution → INVALID
node examples/multistep/run-demo.js   # batch strategy: commitment binds one execution
node examples/live/live-verify.js     # verify ANY real Testnet2 tx
```

### CLI

```bash
node packages/cli/src/index.js analyze --intent <...> --policy <...> --trace <...>   # on-chain or offline
node packages/cli/src/index.js verify  --receipt <...> [--intent <...> --policy <...> --trace <...>]
node packages/cli/src/index.js report  --receipt <...>                               # human-readable receipt
```

## On-chain

| Network | Chain ID | RPC |
|---|---|---|
| Core **Testnet2** | 1114 | `https://rpc.test2.btcs.network` |
| Core Mainnet | 1116 | `https://rpc.coredao.org` |

```bash
forge build                                   # 0.1 evidence registry (clean)
powershell -File scripts/anchor-local.ps1      # or: bash scripts/anchor-local.sh
                                              # deploy + anchor on anvil fork → artifact
```

## Repository layout

```
spec/        CGEP/1 (draft) · master spec · canonical encoding · receipt · levels ·
             threat model · privacy model · competitive kill matrix · killer memos
packages/    canonical · intent · policy · trace · evidence · verifier · cli   (ESM, zero deps)
contracts/   EvidenceRegistry.sol — commitment registry (deployable, `--legacy`)
benchmarks/  generator + 61-scenario corpus: valid/invalid/mutations/tamper/performance
test/        canonicalization · policy · tamper suites + adversarial runner
examples/    transfer · swap · multistep · live (runnable, with READMEs + artifacts)
scripts/     anchor-local.ps1/.sh — local on-chain proof for the anchor flow
docs/        deployment · funding · contributing · security
```

## Roadmap

| Milestone | Status |
|---|---|
| **v0.1 — Evidence protocol** (intent → trace → evidence → receipt → verifier → anchor) | ✅ built, tested, verified live |
| **v0.1 — On-chain anchor on Core Testnet2** | 🔜 deployer funding required |
| **v0.2 — Execution Firewall** (simulation-gated smart accounts, intent-based authorization) | 📋 designed |
| **v0.3 — Passport / reputation + risk findings** | 📋 designed |
| **v0.4 — ZK privacy proofs (L4)** | 🔬 research |

## Work with us

CoreGuard is looking for funding and builders — milestone-based, Core-native,
auditor-honest. Details: [docs/FUNDING.md](docs/FUNDING.md).

## License

MIT — see [LICENSE](LICENSE). Protocol spec `CGEP/1` is a draft for open discussion, not a claim of standard.