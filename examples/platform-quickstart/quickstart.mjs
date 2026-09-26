#!/usr/bin/env node
/**
 * quickstart.mjs — the CoreGuard Verification Platform in three verbs:
 * commit, capture, verify. Runs offline in a clean clone: no network, no
 * keys, no credentials, no claims about anything upstream.
 *
 *   node examples/platform-quickstart/quickstart.mjs
 *
 * The three verbs that matter (the whole integration surface is these calls):
 *
 *   const commitment = commit(intent);                     // L0 — deterministic
 *   const receipt    = { ...capture from the chain... };   // L1 — needs a chain authority
 *   const verdict    = verifyReceipt(receipt, commitment, chain); // L1 — never a promise
 *   const replayed   = replay(intent, receipt, rules);     // L2 — deterministic
 *   const proven     = verifyMerkle(proof, root, leaf);   // L3 — one leaf, no bundle
 *
 * Honesty contract, demonstrated below rather than asserted:
 *   - the same intent bytes always produce the same commitmentId;
 *   - a receipt captured WITHOUT a chain authority is UNKNOWN, never VERIFIED;
 *   - a swapped txHash is MISMATCH, not "probably fine";
 *   - a policy that fails one rule is MISMATCH, and a policy with no evidence
 *     at all is UNKNOWN — no partial success upgrades to MATCH;
 *   - the merkle proof proves ONE leaf without carrying the bundle;
 *   - L4 stays RESEARCH. There is no ZK claim in this file.
 */

import {
  commit,
  verifyReceipt,
  replay,
  merkleTree,
  merkleProof,
  verifyMerkle,
  L4_BOUNDARY,
} from "../../scripts/ladder/verification-levels.mjs";

/* The one tx the mock chain actually knows about. A chain that "confirms"
   everything is a toy; a chain that knows one honest transaction is a model. */
const MINED_TX = "0x" + "2".repeat(64);
const MINED_BLOCK = "0x" + "1".repeat(64);
const CHAIN_ID = "1116";

const intent = {
  subject: "escrow.release",
  chainId: CHAIN_ID,
  policy: [
    { id: "AUTHORITY", description: "the mandate authorises exactly one release" },
    { id: "CAP", description: "the cap is not exceeded" },
  ],
};

const rules = intent.policy.map((r) => ({ id: r.id }));

function mockChain(known = new Map([[MINED_TX, { txHash: MINED_TX, blockHash: MINED_BLOCK }]])) {
  return { getReceipt: (tx) => known.get(tx) ?? null };
}

function line(label, value) {
  console.log(`  ${label.padEnd(34)} ${value}`);
}

async function main() {
  console.log("CoreGuard quickstart — commit / capture / verify (offline, no keys)\n");

  /* ------------------------------------------------------------ L0 commit */
  const commitment = commit(intent);
  const again = commit(intent);
  console.log("L0  commit");
  line("commitmentId", commitment.commitmentId);
  line("replayable (same bytes, same id)", again.commitmentId === commitment.commitmentId);

  /* -------------------------------------------------- L1 capture + verify */
  const chain = mockChain();
  const receipt = {
    status: "VERIFIED",
    blockHash: MINED_BLOCK,
    txHash: MINED_TX,
    chainId: CHAIN_ID,
    evidence: [
      { rule: "AUTHORITY", result: "PASS" },
      { rule: "CAP", result: "PASS" },
    ],
    failedChecks: [],
  };

  console.log("\nL1  capture + chain-confirmed verify");
  const verified = verifyReceipt(receipt, commitment, chain);
  line("verdict (with a chain authority)", `${verified.verdict} / ${verified.verdictCode}`);
  const unconfirmed = verifyReceipt(receipt, commitment);
  line("verdict (no chain authority)", `${unconfirmed.verdict} / ${unconfirmed.verdictCode}`);
  const swapped = verifyReceipt({ ...receipt, txHash: "0x" + "e".repeat(64) }, commitment, chain);
  line("verdict (swapped txHash)", `${swapped.verdict} / ${swapped.verdictCode}`);

  /* ------------------------------------------------------------- L2 replay */
  console.log("\nL2  deterministic replay");
  const clean = replay(intent, receipt, rules);
  line("every rule PASS", `${clean.verdict} / ${clean.verdictCode}`);
  const oneFailed = replay(intent, { ...receipt, failedChecks: [{ rule: "CAP" }] }, rules);
  line("one rule contradicted", `${oneFailed.verdict} / ${oneFailed.verdictCode}`);
  const noEvidence = replay(intent, { evidence: [], failedChecks: [] }, rules);
  line("no evidence at all", `${noEvidence.verdict} / ${noEvidence.verdictCode}`);

  /* --------------------------------------------------------- L3 merkle proof */
  console.log("\nL3  merkle proof (one leaf, no bundle)");
  const bundle = ["commitment:" + commitment.commitmentId, "receipt:" + receipt.txHash, "replay:VALUE", "risk:OK"];
  const tree = merkleTree(bundle);
  const proof = merkleProof(tree.tree, 1);
  line("root", tree.root);
  line("leaf 1 proves against the root", verifyMerkle(proof, tree.root, bundle[1]));
  line("a forged leaf is rejected", !verifyMerkle(proof, tree.root, "receipt:0xdeadbeef"));

  /* ------------------------------------------------------------------ L4 */
  console.log("\nL4  ZK boundary");
  line("status", `${L4_BOUNDARY.status} — no circuit, no prover, no "ZK supported" claim`);

  const ok =
    again.commitmentId === commitment.commitmentId &&
    verified.verdict === "VERIFIED" &&
    unconfirmed.verdict === "UNKNOWN" &&
    swapped.verdict === "MISMATCH" &&
    clean.verdict === "MATCH" &&
    oneFailed.verdict === "MISMATCH" &&
    noEvidence.verdict === "UNKNOWN" &&
    verifyMerkle(proof, tree.root, bundle[1]) &&
    L4_BOUNDARY.status === "RESEARCH";

  console.log(`\nQUICKSTART SELF-CHECK: ${ok ? "PASS" : "FAIL"}`);
  if (!ok) process.exitCode = 1;
}

main();
