# CoreGuard Evidence Matrix

## Status Labels
- **BUILT**: Code exists
- **TESTNET VERIFIED**: Passed testnet tests
- **MAINNET DEPLOYED**: Contract on mainnet
- **MAINNET VERIFIED**: Real mainnet tests passed
- **PRODUCTION ADOPTED**: Real external usage

---

## CoreGuard Engine

| Claim | Status | Evidence | Test |
|---|---|---|---|
| 1433 tests passing | BUILT | `npm test` | scripts/run-tests.mjs |
| 1041 files scanned | BUILT | boundary-audit.mjs | 0 violations |
| 10,000-run benchmark | BUILT | 0 false accept, 0 false reject | benchmarks/ |
| 1,000/1,000 mutants refused | BUILT | mutation lab | test/ |
| Intent-to-execution conformance | BUILT | checkConformance() | packages/stellar/dex-gating.mjs |
| Deterministic replay | BUILT | replay() | scripts/ladder/verification-levels.mjs |
| Fail-closed | BUILT | UNKNOWN → HELD | All packages |
| Universal DApp Shield (wrap ANY action) | ARM-MODEL EXECUTED | docs/evidence/universal-dapp-shield-executed.json — 2 ALLOW · 2 REQUIRE_REVIEW · 1 DENY · 1 REFUSED (Q-FW10) | scripts/universal-shield-executed.mjs --verify |

---

## Core DAO (Mainnet)

| Claim | Status | Evidence | Test |
|---|---|---|---|
| V1 contract deployed | MAINNET DEPLOYED | 0x037dF08F2d43c5D03759279Fe35664f6AFf9EA6E | scripts/verify-live.json |
| V2 contract deployed | MAINNET DEPLOYED | 0x66268a47e81b8f657798d7b5bbedc956df7b13fd | scripts/verify-live.json |
| V2 commitIntent tx | MAINNET VERIFIED | 0x0cd2a8c0de1b030552da16052650ae3c1d74821c2dfa3a4b40afa18d7367715c | scripts/verify-live.json |
| V2 anchorProof tx | MAINNET VERIFIED | 0x5b9e7d6806200d1f3603ebd0f759d224e3096951dfb6ecbf3539b8b6d3e478d2 | scripts/verify-live.json |
| Cross-RPC verification | MAINNET VERIFIED | rpc.coredao.org + rpc.ankr.com | scripts/verify-live.json |

---

## Stellar

| Claim | Status | Evidence | Test |
|---|---|---|---|
| Soroban contract (testnet) | TESTNET VERIFIED | CCERTRITP7A6U4PQ7NUKHXKWL2BNRMSBLVAAAWWMRAZTICUN7ZGC5Q4R | test/integrations/stellar-soroban.test.mjs (11/11) |
| Soroban contract (mainnet) | MAINNET DEPLOYED | CCKA2GYVILX7YZVSXGVIHOPNLTRBBF2SSWKBTQBIE7M67N5N2QMMXPSP — third-party-listed (stellar.expert: creator = CoreGuard wallet, wasm hash recorded, 2026-11-04) | scripts/deploy-soroban-mainnet.mjs |
| Soroban commitment-anchor commit CALL (mainnet) | MAINNET VERIFIED | `commit(proofId, commitment)` **INVOKED** — tx `69044807410f65027c1227f4e525ad83f23a6cb1a2bb79790d82849c5dbc9fec`, ledger 65,337,373 — exact chainId-1116 pair (proofId `0xecd9e6b3d8780c55ca3d60e88b7ff79317b3cba187e43240a540891e4cada6b8` = commitment content `0xc0dbfb45b6c8e13b3738822360ea737adfc045d4acb808bdaeac563c8af31052`), owner-authorized, NO deploy touched; on-chain read-back `read(proofId)` = `{hash: 0xc0dbfb45…1052, seq: 65337373}` exact (wire-verified) | docs/evidence/stellar-soroban-commit-executed.json · scripts/stellar-soroban-commit-executed.mjs --verify · test/integrations/execution-evidence-contract.test.mjs |
| Mainnet wallet | MAINNET VERIFIED | GDJ3CRNLNDZ4AVWGPUG7DBC5BIAGMIONOONZGB5FSYAY44ZHOIPRKY7U — live Horizon account | Horizon read-back |
| Mainnet payment | MAINNET VERIFIED | 0.1 XLM → SDF, ledger 65,308,317 | .stellar-tx-1.json |
| Freighter wallet wrapper | BUILT | packages/stellar/freighter.mjs | No E2E test (credential-gated) |
| Soroban DEX gating | REAL-BOOK EXECUTED | docs/evidence/stellar-dex-gate-executed.json — five verdicts against the REAL XLM/USDC mainnet order book (issuer network-discovered; depth-derived ceiling) | scripts/stellar-dex-gate-real.mjs --verify |
| AI Agent Payment Gate | POLICY-GATE EXECUTED | docs/evidence/stellar-agent-gate-executed.json — VERIFIED/REJECTED/HELD matrix; submit NOT_PERFORMED (credential-gated) | scripts/stellar-agent-gate-executed.mjs --verify |
| Intent-to-Execution Proof | BUILT | docs/INTENT-TO-EXECUTION-PROOF.md | 5 test cases |

---

## Pi Network

| Claim | Status | Evidence | Test |
|---|---|---|---|
| Pi Network package | BUILT | packages/pi-network/index.mjs | No tests |
| Pi SDK | BUILT | packages/pi-network/sdk.mjs | No tests |
| Pi Killer | BUILT | packages/pi-killer/index.mjs | No tests |
| Pi DApp shield | DRY_RUN | Plan only | No tests |

---

## SaaS Gateway

| Claim | Status | Evidence | Test |
|---|---|---|---|
| SaaS Gateway | BUILT | packages/saas-gateway/index.mjs | No tests |
| SaaS Live Payment | BUILT | packages/saas-gateway/live.mjs | No tests |
| x402 integration | BUILT | packages/x402/index.mjs | test/ |

---

## Summary

| Status | Count |
|---|---|
| MAINNET VERIFIED | 8 |
| MAINNET DEPLOYED | 3 |
| TESTNET VERIFIED | 1 |
| BUILT | 15 |
| REAL-BOOK EXECUTED | 1 |
| POLICY-GATE EXECUTED | 1 |
| ARM-MODEL EXECUTED | 1 |
| DRY_RUN | 1 |
| NOT DEPLOYED | 0 |

**Total: 31 components, 8 mainnet verified, 3 mainnet-deployed contracts, 3 executed gate surfaces, 1 dry-run, 0 not deployed**