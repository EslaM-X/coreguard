# Deployment

CoreGuard v0.1 ships a single on-chain contract: **EvidenceRegistry**.

- **Only commitments live on-chain** (`bytes32 → bytes32`). Evidence stays in the
  Execution Receipt, off-chain. No oracles, no keys, no custody.
- Zero constructor args. Solidity 0.8.24, Shanghai, `--legacy` transactions
  (Core is a public EVM — no type-2 txs).

## 0. Live Core Mainnet (current)

Anchor is **live on Core Mainnet (chainId 1116)** — registry
`0x037dF08F2d43c5D03759279Fe35664f6AFf9EA6E`.

Absolute evidence bundle (values from chain, never from memory):

| Step | Value |
|---|---|
| Registry | `0x037dF08F2d43c5D03759279Fe35664f6AFf9EA6E` |
| Deploy tx | `0xe186646b584b0e17b19058a0dd2b579f6abc4d2fe5ade0d228fbe140d19b64e3` blk 38,597,312 |
| Evidence tx | `0x3b04216084e1e7bc6e90ffb94fadd3b79862cca712614ea3afc52fc30b082714` blk 38,594,923 |
| commitIntent tx | `0xe224f58a38106d2e63a74ec277eda2075fad656ff30a3519aab6228d03384ee1` blk 38,597,647 |
| anchorProof tx | `0xc6229c768704a78ef21734561d40cf7c86fc7a12c8d4ad02e27023a1a225fbdc` blk 38,597,679 |
| receiptId | `0xeaa87ec1e8d8f60457bb12969f233dd5ada6526d5ee9f51afa693eb8d8f44eb6` |
| commitment | `0xc0dbfb45b6c8e13b3738822360ea737adfc045d4acb808bdaeac563c8af31052` |
| proofId | `0xecd9e6b3d8780c55ca3d60e88b7ff79317b3cba187e43240a540891e4cada6b8` |
| Verdict | **VERIFIED ANCHOR INTEGRITY** |

Full provenance (all txHashes, blockHashes, gas, storage slots, cross-RPC
reads) lives in [`../scripts/verify-live.json`](../scripts/verify-live.json).

### Gas baseline (historical observed, Mainnet single-anchor)

Recorded from the live Mainnet anchor above. This is a **historical observed
baseline — NOT a promise of future costs** (Core is a public EVM; gas prices
and contract sizes can change).

| Step | Gas used |
|---|---|
| Evidence tx (tiny value transfer) | 21,000 |
| Registry deploy | 211,104 |
| commitIntent | 48,542 |
| anchorProof | 49,088 |
| **Total** | **329,734** |

Observed effective gas price: **60 gwei** → total cost **0.019784040 CORE**
(the exact figures above come from the frozen `scripts/verify-live.json`,
`cost` section; `actualLimitUsed: true`).

## 1. Reproduce the check (read-only)

```bash
# Verify the live registry from any Core RPC:
npm run anchor:verify
# artifact → scripts/verify-live.regenerated.json · verdict → VERIFIED ANCHOR INTEGRITY
# (the frozen scripts/verify-live.json is never rewritten by the verifier)
```

## 2. Anchoring a receipt (deployer of Testnet2 / new anchor)

Values come from `compute-commitment` (the engine artifact), never from memory:

```bash
# 1) Plan: recompute receiptId + commitment + proofId purely offline.
npm run anchor:plan                      # → scripts/live-anchor-planned.json
#    proofId = H("CGEP/1:ANCHOR", {chainId, receiptId, commitment}) — ALWAYS
#    from the artifact; never assume proofId == receiptId.

# 2) Commit the intent BEFORE execution, then anchor the proof AFTER it.
cast send --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy \
  <Registry> "commitIntent(bytes32,bytes32)" <receiptId> <commitment>
cast send --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy \
  <Registry> "anchorProof(bytes32,bytes32,uint8)" <proofId> <commitment> 1
#    result: 0=INVALID, 1=VALID, 2=INCONCLUSIVE (1 for a VERIFIED anchor)

# 3) Three independent proofs (docs/COMMUNITY.md):
#    A = deployment evidence · B = verifyCommitment(proofId, commitment) == true
#    C = offline recompute == on-chain commitment.
powershell -ExecutionPolicy Bypass -File scripts/verify-anchor.ps1 \
  -Registry <Registry> -DeployTx <deployTxHash> -AnchorTx <anchorTxHash>
# or: bash scripts/verify-anchor.sh <Registry> <deployTxHash> <anchorTxHash>
# artifact → scripts/verify-live.regenerated.json · verdict → VERIFIED ANCHOR INTEGRITY
```

## 3. Local on-chain proof (no funds needed)

Deploys on an `anvil` fork of Testnet2 and anchors a sample receipt, proving the
deploy → commitIntent → anchorProof → verifyCommitment flow end-to-end.

```bash
bash scripts/anchor-local.sh              # unix / CI
powershell -ExecutionPolicy Bypass -File scripts/anchor-local.ps1   # windows
# artifact → scripts/anchor-proof.json
```

## Funding / faucet status

The web faucet (`scan.test2.btcs.network/faucet`) currently rejects requests with
an invalid-domain reCAPTCHA error (site-side), and its API layer
(`GET/POST /api/faucet*`) returns **401** for every body/header we tried —
confirmed as an access-layer issue, not a funds problem (the faucet wallet holds
~991k tCORE2 with 8,000+ on-chain claims). An earlier developer report
(2026-07-31 → 2026-08-08) in the Core community describes persistent CAPTCHA
failures too, so this affects other Testnet2 users, not just our environment.
Testnet2 tCORE2 is otherwise available through official Core channels
(Telegram/Discord). See [docs/FUNDING.md](docs/FUNDING.md) for the project
funding ask and [docs/COMMUNITY.md](docs/COMMUNITY.md) for the outreach message.