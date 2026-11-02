CG-COMMITMENT-ANCHOR/1

A replay-safe Soroban commitment anchor for Stellar testnet.

What it does
- commit(id: BytesN<32>, hash: BytesN<32>) -> Result<u32, CgError> anchors a commitment id to its content hash at the current ledger sequence
- read(id: BytesN<32>) -> Option<Anchor> returns the anchored record if present
- assert_anchored(id: BytesN<32>, hash: BytesN<32>) -> Result<(), CgError> verifies exact match
- version() -> String returns the protocol constant

Design
- First commit for a commitment id wins and is never rewritten
- Re-committing the same (id, hash) is idempotent and returns the original ledger sequence
- Re-committing the same id with a different hash is rejected
- Keys and values are stored in instance storage

Status
- Built and tested for Soroban SDK 23
- WASM artifact committed at artifacts/cg_commitment_anchor.wasm
- Intended for TESTNET integration only via the CoreGuard Soroban adapter
