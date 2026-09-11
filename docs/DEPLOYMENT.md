# Deployment

CoreGuard v0.1 ships a single on-chain contract: **EvidenceRegistry**.

- **Only commitments live on-chain** (`bytes32 → bytes32`). Evidence stays in the
  Execution Receipt, off-chain. No oracles, no keys, no custody.
- Zero constructor args. Solidity 0.8.24, Shanghai, `--legacy` transactions
  (Core is a public EVM — no type-2 txs).

## 1. Live Core Testnet2 deploy (once the deployer holds tCORE2)

```bash
# Deployer wallet is 0x6cB4796D54ED72105ec617c8850C91972a0d9469
# Balance must be > 0 (faucet / official channels).
export RPC_TESTNET2=https://rpc.test2.btcs.network
export PRIVATE_KEY=<deployer pk from .env — never commit this>

forge script script/Deploy.s.sol:DeployEvidenceRegistry \
  --rpc-url "$RPC_TESTNET2" \
  --private-key "$PRIVATE_KEY" \
  --legacy \
  --broadcast --verify
```

Expected (from an earlier simulated run, not yet broadcast):
predicted address `0xC7f2Cf4845C6db0e1a1e91ED41Bcd0FcC1b0E141`.

## 2. Anchoring a receipt on Testnet2

The commitment must be the **CGEP-computed** value so the three proofs close:

```bash
# 1) Plan: recompute receiptId + commitment purely offline (deterministic).
npm run anchor:plan                      # → scripts/live-anchor-planned.json

# 2) Anchor on-chain with those exact values.
cast send --rpc-url "$RPC_TESTNET2" --private-key "$PRIVATE_KEY" --legacy \
  <Registry> "commitIntent(bytes32,bytes32)" \
  <receiptId> <commitment>

# 3) Three independent proofs (docs/COMMUNITY.md):
#    A = deployment TX, B = verifyCommitment == true, C = offline recompute.
powershell -ExecutionPolicy Bypass -File scripts/verify-anchor.ps1 \
  -Registry <Registry> -DeployTx <deployTxHash> [-AnchorTx <anchorTxHash>]
# or: bash scripts/verify-anchor.sh <Registry> <deployTxHash> [<anchorTxHash>]
# artifact → scripts/verify-live.json · verdict → VERIFIED when 0 failures
```

## 3. Local on-chain proof (no funds needed)

Deploys on an `anvil` fork of Testnet2 and anchors a sample receipt, proving the
deploy → commitIntent → anchorProof → verifyCommitment flow end-to-end.

```bash
bash scripts/anchor-local.sh              # unix / CI
powershell -ExecutionPolicy Bypass -File scripts/anchor-local.ps1   # windows
# artifact → scripts/anchor-proof.json
```

## 4. Mainnet (future)

Same flow, `--rpc-url https://rpc.coredao.org`, chainId 1116. Deploy after
Testnet2 validation and community review.

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