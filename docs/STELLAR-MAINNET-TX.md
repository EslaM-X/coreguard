# CoreGuard Stellar Mainnet — First Transaction

## Transaction Details
- **Hash**: `fe58731170f8a5a6286184654f33012280d0bd7f59cdb2c6160b879742cf3829`
- **Ledger**: 65,308,317
- **Source**: `GDJ3CRNLNDZ4AVWGPUG7DBC5BIAGMIONOONZGB5FSYAY44ZHOIPRKY7U`
- **Destination**: `GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR` (SDF)
- **Amount**: 0.1 XLM
- **Memo**: CoreGuard test
- **Timestamp**: 2026-11-04
- **Network**: Stellar Mainnet

## Verification
- **Stellar Expert**: https://stellar.expert/explorer/public/tx/fe58731170f8a5a6286184654f33012280d0bd7f59cdb2c6160b879742cf3829
- **Horizon**: https://horizon.stellar.org/transactions/fe58731170f8a5a6286184654f33012280d0bd7f59cdb2c6160b879742cf3829

## Status
- ✅ Wallet created and funded
- ✅ First mainnet transaction executed
- ✅ Freighter wallet integration ready
- ✅ Soroban commitment anchor ready
- ✅ DEX gating ready

## Next Steps
1. ~~Deploy Soroban contract on mainnet~~ — **DONE (2026-11-04):** `CCKA2GYVILX7YZVSXGVIHOPNLTRBBF2SSWKBTQBIE7M67N5N2QMMXPSP`, creator = the CoreGuard wallet, third-party-listed (stellar.expert) with its wasm hash
2. Execute the first commitment-anchor CALL on mainnet — credential-gated funded sweep (owner decision; the contract is live, the call is not yet made)
3. Gate the first SIGNED DEX swap on mainnet — funded Freighter decision (the gate already runs against the REAL mainnet order book offline: `scripts/stellar-dex-gate-real.mjs` · `docs/evidence/stellar-dex-gate-executed.json`)
4. Publish the SDK closure to npm — double-gated release law; requires the `NPM_TOKEN` Actions secret
5. ~~Update org profile: Stellar status → MAINNET LIVE~~ — **DONE by the owner** (org profile carries the live Trinity row)