# STELLAR-PHASE3-2026-10 — Real Soroban Integration (testnet)

Status: COMPLETE (real contract deployed/invoked on testnet)  
Adapter: SOROBAN/1 (`packages/stellar-soroban/index.mjs`)  
Contract: CG-COMMITMENT-ANCHOR/1 (`soroban/commitment-anchor/`)  

## Scope
- Real Soroban Rust contract compiled to WASM and committed as artifact
- Soroban RPC upload/create/invoke builders (offline, deterministic)
- Mainnet refused fail-closed (NOT_AUTHORIZED)
- Contract ID extraction from v4 TransactionMeta (sorobanMeta.returnValue)
- Live testnet probes executed (friendbot funded, upload/create SUCCESS)
- Gate demo + integration tests added

## Evidence (machine-measurable)
- WASM: `soroban/commitment-anchor/artifacts/cg_commitment_anchor.wasm` (7671 bytes, sha256 prefix `34fbbba068dff59a`)
- Package: `packages/stellar-soroban/index.mjs` (SOROBAN/1)
- Tests: `test/integrations/stellar-soroban.test.mjs`
- Demo: `examples/stellar-gate/demo.mjs` (script `stellar:gate`)
- Contract: `soroban/commitment-anchor/src/lib.rs` (commit/read/assert_anchored/version)

## Policy
- TESTNET ONLY. No mainnet keys/signing/broadcast.
- Fail-closed by default. All mutations require explicit injected submitter.
- No secrets stored. Signing is caller-provided per call.

## Verification
```bash
npm test
npm run boundary:audit
npm run claims:audit
node scripts/current-state.mjs --check
npm run release:gate:independence
```
