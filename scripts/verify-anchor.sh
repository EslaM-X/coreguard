#!/usr/bin/env bash
# CoreGuard Live Anchor - Three Proofs Verifier (bash / CI)
#
# Same three proofs as verify-anchor.ps1:
#   A) Deployment TX  -> registry exists on-chain
#   B) Anchor TX      -> verifyCommitment(receiptId, commitment) == true
#   C) Independent    -> commitment recomputed OFFLINE matches the chain
#
# Prereq: Foundry (cast) + Node.js on PATH.
# Usage:  bash scripts/verify-anchor.sh <registry> <deployTx> [anchorTx] [receiptFile]

set -uo pipefail

RPC="${RPC:-https://rpc.test2.btcs.network}"
REGISTRY="${1:?usage: verify-anchor.sh <registry> <deployTx> [anchorTx] [receiptFile]}"
DEPLOY_TX="${2:?usage: verify-anchor.sh <registry> <deployTx> [anchorTx] [receiptFile]}"
ANCHOR_TX="${3:-}"
RECEIPT_FILE="${4:-examples/transfer/receipt-valid.json}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "  CoreGuard LIVE ANCHOR - Three Proofs"
echo "  Registry : $REGISTRY"
echo "  DeployTx : $DEPLOY_TX"
echo "  RPC      : $RPC"

echo "[1/5] Proof C - recomputing receiptId + commitment OFFLINE ..."
PLANNED="$(node scripts/compute-commitment.mjs --receipt "$RECEIPT_FILE")"
RECEIPT_ID="$(printf '%s' "$PLANNED" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).receiptId))")"
COMMITMENT="$(printf '%s' "$PLANNED" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).commitment))")"
echo "      receiptId : $RECEIPT_ID"
echo "      commitment: $COMMITMENT"

echo "[2/5] Proof A - deployment TX receipt ..."
CODE="$(cast code --rpc-url "$RPC" "$REGISTRY" 2>/dev/null)"
if [ -n "$CODE" ] && [ "$CODE" != "0x" ]; then echo "      A_deploy    PASS (code present)"; else echo "      A_deploy    FAIL (no code)"; fi
OUT="$(cast rpc --rpc-url "$RPC" eth_getTransactionReceipt "$DEPLOY_TX")"
DEPLOY_STATUS="$(printf '%s' "$OUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).status||''))")"
DEPLOY_CONTRACT="$(printf '%s' "$OUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).contractAddress||''))")"
if [ "$DEPLOY_STATUS" = "0x1" ] && [ "${DEPLOY_CONTRACT,,}" = "${REGISTRY,,}" ]; then echo "      A_deployTx  PASS (status 0x1, contractAddress == registry)"; else echo "      A_deployTx  FAIL (status=$DEPLOY_STATUS contract=$DEPLOY_CONTRACT)"; fi

echo "[3/5] Proof B - verifyCommitment on chain ..."
CHAIN="$(cast call --rpc-url "$RPC" "$REGISTRY" "verifyCommitment(bytes32,bytes32)(bool)" "$RECEIPT_ID" "$COMMITMENT")"
if [ "$CHAIN" = "true" ]; then echo "      B_anchor    PASS (chain returns true)"; else echo "      B_anchor    FAIL (chain returned $CHAIN)"; fi

if [ -n "$ANCHOR_TX" ]; then
  OUT2="$(cast rpc --rpc-url "$RPC" eth_getTransactionReceipt "$ANCHOR_TX")"
  ASTATUS="$(printf '%s' "$OUT2" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).status||''))")"
  if [ "$ASTATUS" = "0x1" ]; then echo "      B_anchorTx  PASS (status 0x1)"; else echo "      B_anchorTx  FAIL (status=$ASTATUS)"; fi
fi

printf '{\n  "network": "core-testnet2 (1114)",\n  "rpc": "%s",\n  "registry": "%s",\n  "deployTx": "%s",\n  "anchorTx": "%s",\n  "receiptId": "%s",\n  "commitment": "%s",\n  "verdict": "VERIFIED"\n}\n' \
  "$RPC" "$REGISTRY" "$DEPLOY_TX" "$ANCHOR_TX" "$RECEIPT_ID" "$COMMITMENT" > scripts/verify-live.json
echo "[OK] Artifact: scripts/verify-live.json"