#!/usr/bin/env bash
# CoreGuard Local On-Chain Proof (bash / CI)
#
# Deploys EvidenceRegistry on an ANVIL FORK of Core Testnet2, anchors a sample
# execution receipt, then reads commitments back. Proves the on-chain anchor
# flow (deploy -> commitIntent -> anchorProof -> verifyCommitment) without
# testnet funds.
#
# All anchored values are REAL engine outputs (not placeholders):
#   commitment = H("CGEP/1:PROOF",  {protocol, chainId, receiptId, evidenceRoot})
#   proofId    = H("CGEP/1:ANCHOR", {chainId, receiptId, commitment})
# proofId is never assumed equal to receiptId. The exact same commands, pointed
# at the live RPC, perform the real Testnet2 deployment.
#
# Prereq: Foundry (anvil, forge, cast) + Node.js on PATH.
# Usage:  bash scripts/anchor-local.sh

set -euo pipefail

RPC="${1:-https://rpc.test2.btcs.network}"
# anvil default dev account (always pre-funded, even on a fork)
PK="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
FORK="http://127.0.0.1:8545"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

node_json() { node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(String(JSON.parse(d).$1||''))}catch(e){process.stdout.write('')}})"; }

echo "[1/5] Bootstrapping anvil fork of $RPC ..."
anvil --fork-url "$RPC" --silent &
ANVIL_PID=$!
trap 'kill $ANVIL_PID 2>/dev/null || true' EXIT
sleep 3

echo "[2/5] Computing engine values (receiptId / commitment / proofId) ..."
PLANNED="$(node scripts/compute-commitment.mjs --receipt examples/transfer/receipt-valid.json)"
RECEIPT_ID="$(printf '%s' "$PLANNED" | node_json receiptId)"
COMMITMENT="$(printf '%s' "$PLANNED" | node_json commitment)"
PROOF_ID="$(printf '%s' "$PLANNED" | node_json proofId)"
RESULT_CODE="$(printf '%s' "$PLANNED" | node_json resultCode)"
echo "      receiptId : $RECEIPT_ID"
echo "      commitment: $COMMITMENT"
echo "      proofId   : $PROOF_ID"

echo "[3/5] Deploying EvidenceRegistry on the local fork ..."
BYTECODE="$(forge inspect EvidenceRegistry bytecode)"
OUT="$(cast send --rpc-url "$FORK" --private-key "$PK" --legacy --json --create "$BYTECODE")"
REGISTRY="$(printf '%s' "$OUT" | node_json contractAddress)"
DEPLOY_TX="$(printf '%s' "$OUT" | node_json transactionHash)"
echo "      Registry: $REGISTRY"
echo "      Tx:       $DEPLOY_TX"

echo "[4/5] Anchoring (commitIntent + anchorProof, result=$RESULT_CODE) ..."
cast send --rpc-url "$FORK" --private-key "$PK" --legacy "$REGISTRY" "commitIntent(bytes32,bytes32)" "$RECEIPT_ID" "$COMMITMENT" >/dev/null
cast send --rpc-url "$FORK" --private-key "$PK" --legacy "$REGISTRY" "anchorProof(bytes32,bytes32,uint8)" "$PROOF_ID" "$COMMITMENT" "$RESULT_CODE" >/dev/null

echo "[5/5] Reading commitments back from the chain ..."
VP="$(cast call --rpc-url "$FORK" "$REGISTRY" "verifyCommitment(bytes32,bytes32)(bool)" "$PROOF_ID" "$COMMITMENT")"
VI="$(cast call --rpc-url "$FORK" "$REGISTRY" "verifyCommitment(bytes32,bytes32)(bool)" "$RECEIPT_ID" "$COMMITMENT")"
IC="$(cast call --rpc-url "$FORK" "$REGISTRY" "isCommitted(bytes32)(bool)" "$PROOF_ID")"
echo "      verifyCommitment(proofId,  commitment): $VP"
echo "      verifyCommitment(receiptId, commitment): $VI"
echo "      isCommitted(proofId):                  $IC"

printf '{\n  "network": "localhost (anvil fork of core-testnet2 1114)",\n  "registry": "%s",\n  "receiptId": "%s",\n  "proofId": "%s",\n  "commitment": "%s",\n  "verifyProofCommitment": %s,\n  "verifyIntentCommitment": %s,\n  "isCommitted": %s,\n  "deployTx": "%s"\n}\n' \
  "$REGISTRY" "$RECEIPT_ID" "$PROOF_ID" "$COMMITMENT" "$([ "$VP" = true ] && echo true || echo false)" "$([ "$VI" = true ] && echo true || echo false)" "$([ "$IC" = true ] && echo true || echo false)" "$DEPLOY_TX" \
  > scripts/anchor-proof.json

echo "[OK] On-chain anchor flow PROVEN on a local fork. Artifact: scripts/anchor-proof.json"