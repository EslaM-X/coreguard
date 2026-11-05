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
| 1421 tests passing | BUILT | `npm test` | scripts/run-tests.mjs |
| 1028 files scanned | BUILT | boundary-audit.mjs | 0 violations |
| 10,000-run benchmark | BUILT | 0 false accept, 0 false reject | benchmarks/ |
| 1,000/1,000 mutants refused | BUILT | mutation lab | test/ |
| Intent-to-execution conformance | BUILT | checkConformance() | packages/stellar/dex-gating.mjs |
| Deterministic replay | BUILT | replay() | scripts/ladder/verification-levels.mjs |
| Fail-closed | BUILT | UNKNOWN → HELD | All packages |

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
| Soroban contract (testnet) | TESTNET VERIFIED | CCERTRITP7A6U4PQ7NUKHXKWL2BNRMSBLVAAAWWMRAZTICUN7ZGC5Q4R | test/integrations/stellar-soroban.test.mjs (7/7) |
| Freighter wallet wrapper | BUILT | packages/stellar/freighter.mjs | No E2E test |
| Soroban DEX gating | BUILT | packages/stellar/dex-gating.mjs | test/integrations/stellar-dex-gating.test.mjs (9/9) |
| Mainnet payment | MAINNET VERIFIED | 0.1 XLM → SDF, ledger 65,308,317 | .stellar-tx-1.json |
| AI Agent Payment Gate | DRY_RUN | packages/stellar-agent/index.mjs | Plan only |
| Mainnet Soroban Contract | NOT DEPLOYED | Needs 10 XLM | scripts/deploy-soroban-mainnet.mjs |
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
| MAINNET VERIFIED | 5 |
| TESTNET VERIFIED | 2 |
| BUILT | 8 |
| DRY_RUN | 3 |
| NOT DEPLOYED | 1 |

**Total: 19 components, 5 mainnet verified, 3 dry run, 1 not deployed**