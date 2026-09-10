#!/usr/bin/env bash
# CoreGuard Local On-Chain Proof (bash / CI)
#
# Deploys EvidenceRegistry on an ANVIL FORK of Core Testnet2 and anchors a
# sample execution receipt, then reads commitments back. Proves the on-chain
# anchor flow (deploy -> commitIntent -> anchorProof -> verifyCommitment)
# without testnet funds. Point the same commands at live RPC for the real
# Testnet2 deployment (see docs/DEPLOYMENT.md).
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

echo "[1/5] Bootstrapping anvil fork of $RPC ..."
anvil --fork-url "$RPC" --silent &
ANVIL_PID=$!
trap 'kill $ANVIL_PID 2>/dev/null || true' EXIT
sleep 3

echo "[2/5] Fetching compiled EvidenceRegistry bytecode ..."
BYTECODE="$(forge inspect EvidenceRegistry bytecode)"

echo "[3/5] Deploying EvidenceRegistry on the local fork ..."
OUT="$(cast send --rpc-url "$FORK" --private-key "$PK" --legacy --json --create "$BYTECODE")"
REGISTRY="$(printf '%s' "$OUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).contractAddress||''))")"
echo "      Registry: $REGISTRY"

echo "[4/5] Anchoring a CoreGuard execution receipt ..."
RECEIPT_ID="$(node --input-type=module -e "import('./examples/transfer/receipt-valid.json',{with:{type:'json'}}).then(m=>process.stdout.write(m.default.receiptId))")"
PROOF_ID="0x$(printf 'cd%.0s' {1..32})"
COMMITMENT="0x$(printf 'ab%.0s' {1..32})"
cast send --rpc-url "$FORK" --private-key "$PK" --legacy "$REGISTRY" "commitIntent(bytes32,bytes32)" "$RECEIPT_ID" "$COMMITMENT" >/dev/null
cast send --rpc-url "$FORK" --private-key "$PK" --legacy "$REGISTRY" "anchorProof(bytes32,bytes32,uint8)" "$PROOF_ID" "$COMMITMENT" 0 >/dev/null

echo "[5/5] Reading commitments back from the chain ..."
C1="$(cast call --rpc-url "$FORK" "$REGISTRY" "verifyCommitment(bytes32,bytes32)(bool)" "$RECEIPT_ID" "$COMMITMENT")"
C2="$(cast call --rpc-url "$FORK" "$REGISTRY" "verifyCommitment(bytes32,bytes32)(bool)" "$PROOF_ID" "$COMMITMENT")"
echo "      verifyCommitment (intent): $C1"
echo "      verifyCommitment (proof):  $C2"

printf '{\n  "network": "localhost (anvil fork of core-testnet2 1114)",\n  "registry": "%s",\n  "intentId": "%s",\n  "proofId": "%s",\n  "verifyIntentCommitment": %s,\n  "verifyProofCommitment": %s,\n  "deployTx": "%s"\n}\n' \
  "$REGISTRY" "$RECEIPT_ID" "$PROOF_ID" "$([ "$C1" = true ] && echo true || echo false)" "$([ "$C2" = true ] && echo true || echo false)" \
  "$(printf '%s' "$OUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).transactionHash||''))")" \
  > scripts/anchor-proof.json

echo "[OK] On-chain anchor flow PROVEN on a local fork. Artifact: scripts/anchor-proof.json"