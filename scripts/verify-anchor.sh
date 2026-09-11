#!/usr/bin/env bash
# CoreGuard Live Anchor - Three Proofs Verifier (bash / CI)
#
# Same three proofs as verify-anchor.ps1:
#   A) Deployment evidence       -> registry exists on-chain (deploy tx)
#   B) Registry commitment       -> verifyCommitment(proofId, commitment) == true
#   C) Independent recompute     -> receiptId + commitment + proofId recomputed
#                                   OFFLINE match what the chain returns
#
# Verdict semantics (single source of truth = scripts/anchor-verdict.mjs):
#   - Missing ANY required evidence -> UNVERIFIED (never VERIFIED)
#   - Any run check that FAILs      -> INVALID (dominates)
#   - VERIFIED only when every required check PASSes and nothing FAILs.
#
# proofId = H("CGEP/1:ANCHOR", {chainId, receiptId, commitment}) and is NEVER
# assumed equal to receiptId. A+B+C = VERIFIED ANCHOR INTEGRITY, NOT execution
# truth - the execution claim is carried by the receipt/evidence/replay bound
# to the commitment.
#
# Prereq: Foundry (cast) + Node.js on PATH.
# Usage:  bash scripts/verify-anchor.sh <registry> <deployTx> [anchorTx] [receiptFile]
#         RPC env:  RPC=https://rpc.coredao.org  LEVEL=L2

set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RPC="${RPC:-https://rpc.coredao.org}"
LEVEL="${LEVEL:-L2}"
REGISTRY="${1:?usage: verify-anchor.sh <registry> <deployTx> [anchorTx] [receiptFile]}"
DEPLOY_TX="${2:?usage: verify-anchor.sh <registry> <deployTx> [anchorTx] [receiptFile]}"
ANCHOR_TX="${3:-}"
RECEIPT_FILE="${4:-examples/transfer/receipt-valid.json}"

apply() { node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{gr=()=>{};try{const p=JSON.parse(d);process.stdout.write(String(p[$1]??''))}catch(e){process.stdout.write('')}})"; }

# CastFix: frozen canonical constants (same single source as verify-anchor.ps1).
# cast sig truncates to 4 bytes - never use a prefix match for event topics.
FROZEN_ANCHOR_TOPIC="0x0c33ee02e1b358686f70819be25e8d45c5c15ca5d9b48c790441b349b30f3475"

STATE_FILE="$(mktemp)"
state() { printf '%s\t%s\n' "$1" "$2" >> "$STATE_FILE"; }

echo "  CoreGuard LIVE ANCHOR - Three Proofs (P0 verdict semantics)"
echo "  Registry : $REGISTRY"
echo "  DeployTx : $DEPLOY_TX"
echo "  Level    : $LEVEL"
echo "  RPC      : $RPC"

echo "[1/6] Proof C - recomputing receiptId + commitment + proofId OFFLINE ..."
PLANNED="$(node scripts/compute-commitment.mjs --receipt "$RECEIPT_FILE" 2>&1)"
if [ $? -ne 0 ]; then
  state C_recompute FAIL
else
  RECEIPT_ID="$(printf '%s' "$PLANNED" | apply receiptId)"
  COMMITMENT="$(printf '%s' "$PLANNED" | apply commitment)"
  PROOF_ID="$(printf '%s' "$PLANNED" | apply proofId)"
  EVIDENCE_ROOT="$(printf '%s' "$PLANNED" | apply evidenceRoot)"
  echo "      receiptId : $RECEIPT_ID"
  echo "      commitment: $COMMITMENT"
  echo "      proofId   : $PROOF_ID"
  state C_recompute PASS
fi

echo "[2/6] Proof A - deployment TX receipt ..."
CODE="$(cast code --rpc-url "$RPC" "$REGISTRY" 2>/dev/null)"
if [ -n "$CODE" ] && [ "$CODE" != "0x" ]; then state A_deploy PASS; else state A_deploy FAIL; fi
OUT="$(cast rpc --rpc-url "$RPC" eth_getTransactionReceipt "$DEPLOY_TX" 2>/dev/null)"
DEPLOY_STATUS="$(printf '%s' "$OUT" | apply status)"
DEPLOY_CONTRACT="$(printf '%s' "$OUT" | apply contractAddress)"
if [ "$DEPLOY_STATUS" = "0x1" ] && [ "${DEPLOY_CONTRACT,,}" = "${REGISTRY,,}" ]; then state A_deployTx PASS; else state A_deployTx FAIL; fi

echo "[3/6] Proof B - verifyCommitment on chain (proofId) ..."
CHAIN="$(cast call --rpc-url "$RPC" "$REGISTRY" "verifyCommitment(bytes32,bytes32)(bool)" "$PROOF_ID" "$COMMITMENT" 2>/dev/null)"
if [ "$CHAIN" = "true" ]; then state B_anchor PASS; else state B_anchor FAIL; fi

echo "[4/6] Commit TX (optional for L0, required for L1+). Supply via - is not wired; set elsewhere."
state B_commitIntentTx NOT_RUN

BLOCK=""
echo "[5/6] Anchor TX check ..."
if [ -n "$ANCHOR_TX" ]; then
  OUT2="$(cast rpc --rpc-url "$RPC" eth_getTransactionReceipt "$ANCHOR_TX" 2>/dev/null)"
  ASTATUS="$(printf '%s' "$OUT2" | apply status)"
  ATO="$(printf '%s' "$OUT2" | apply to)"
  BLOCK="$(printf '%s' "$OUT2" | apply blockNumber)"
  ABLOCKHASH="$(printf '%s' "$OUT2" | apply blockHash)"
  RC="$(printf '%s' "$PLANNED" | apply resultCode)"
  RCEXP="$(node -e "process.stdout.write('0'.repeat(62)+('0'+Number('$RC').toString(16)).slice(-2))")"
  LOGINFO="$(printf '%s' "$OUT2" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);const sig='$FROZEN_ANCHOR_TOPIC'.toLowerCase();const log=(r.logs||[]).find(l=>(l.topics[0]||'').toLowerCase()===sig);if(!log){process.stdout.write('NO_EVENT');return}const rp=log.data.slice(2,66);process.stdout.write(JSON.stringify({address:log.address,proofId:log.topics[1],commitment:log.topics[2],resultOk:(rp==='$RCEXP')}))})")"
  # CastFix: txHash vs blockHash are distinct fields; verify the tx reports the
  # blockHash that contains it via an independent eth_getTransactionByHash call.
  TXBYHASH="$(cast rpc --rpc-url "$RPC" eth_getTransactionByHash "$ANCHOR_TX" 2>/dev/null)"
  TXHASH="$(printf '%s' "$TXBYHASH" | apply hash)"
  TXBLOCKHASH="$(printf '%s' "$TXBYHASH" | apply blockHash)"
  BINDING="$(node -e "const [tx,th,bh,rh]=process.argv.slice(1);process.stdout.write((tx&&tx.toLowerCase()===th.toLowerCase()&&bh.toLowerCase()===rh.toLowerCase()&&bh.toLowerCase()!==tx.toLowerCase())?'PASS':'FAIL')" "$ANCHOR_TX" "$TXHASH" "$TXBLOCKHASH" "$ABLOCKHASH")"
  echo "      txBlockBinding: tx=$TXHASH block=$TXBLOCKHASH (receipt blockHash=$ABLOCKHASH) -> $BINDING"
  if [ "$LOGINFO" = "NO_EVENT" ]; then
    state B_anchorTx FAIL
  else
    EPAIR="$(printf '%s' "$LOGINFO" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const okTo=(p.address||'').toLowerCase()==='${REGISTRY,,}';const okProof=(p.proofId||'').toLowerCase()==='${PROOF_ID,,}';const okC=(p.commitment||'').toLowerCase()==='${COMMITMENT,,}';const okR=p.resultOk&&'$ASTATUS'==='0x1';process.stdout.write(okTo&&okProof&&okC&&okR?'PASS':'FAIL')})")"
    if [ "$EPAIR" = "PASS" ] && [ "$BINDING" = "PASS" ]; then state B_anchorTx PASS; else state B_anchorTx FAIL; fi
  fi
else
  state B_anchorTx NOT_RUN
fi
if [ -z "$BLOCK" ]; then BLOCK="$(printf '%s' "$OUT" | apply blockNumber)"; fi

echo "[6/6] Evaluating verdict via scripts/anchor-verdict.mjs ..."
VERDICT_RAW="$(node scripts/anchor-verdict.mjs --level "$LEVEL" --states "$(node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const s={};for(const line of d.trim().split("\n")){if(!line.trim())continue;const [v,n]=line.split("\t");s[v]=n}process.stdout.write(JSON.stringify(s))})' < "$STATE_FILE")")"
VERDICT="$(printf '%s' "$VERDICT_RAW" | apply verdict)"
VCODE="$(printf '%s' "$VERDICT_RAW" | apply code)"
VMISSING="$(printf '%s' "$VERDICT_RAW" | apply requiredMissing)"
VC="$VERDICT"
[ "$VC" != "VERIFIED" ] && VC="$VC/$VCODE"

node -e "
const raw = JSON.parse(process.argv[1]);
const v = JSON.parse(process.argv[2]);
const missing = JSON.parse(process.argv[3]);
Promise.resolve().then(() => {
  const out = {
    schema:'coreguard/v0.1.0-anchor-verdict',
    network:'core', rpc:raw.rpc, registry:raw.registry,
    deployTx:raw.deployTx, anchorTx:raw.anchorTx, block:raw.block,
    proofId:raw.proofId, receiptId:raw.receiptId, commitment:raw.commitment,
    evidenceRoot:raw.evidenceRoot, level:raw.level,
    verdict:v.verdict, verdictCode:v.code, requiredMissing:missing,
    semanticNote:'The registry proves that a specific commitment was anchored on Core. The execution claim is supported by the independently verifiable evidence/replay bound to that commitment.'
  };
  const fs = require('node:fs');
  fs.writeFileSync('scripts/verify-live.regenerated.json', JSON.stringify(out,null,2)+'\n');
})" "$(
  node -e "process.stdout.write(JSON.stringify({rpc:'$RPC',registry:'$REGISTRY',deployTx:'$DEPLOY_TX',anchorTx:'$ANCHOR_TX',block:'$BLOCK',proofId:'$PROOF_ID',receiptId:'$RECEIPT_ID',commitment:'$COMMITMENT',evidenceRoot:'$EVIDENCE_ROOT',level:'$LEVEL'}))"
)" "$VERDICT_RAW" "$VMISSING"

rm -f "$STATE_FILE"
echo ""
echo "  Verdict  : $VERDICT @ $LEVEL  (missing: $VMISSING)"
echo "  Semantic : The registry proves that a specific commitment was anchored on Core. The execution claim is supported by the independently verifiable evidence/replay bound to that commitment."
echo "[OK] Artifact: scripts/verify-live.regenerated.json"
if [ "$VERDICT" != "VERIFIED" ]; then echo "[FAIL] anchor verification did not reach VERIFIED"; exit 1; fi