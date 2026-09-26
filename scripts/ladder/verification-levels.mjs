#!/usr/bin/env node
/**
 * verification-levels.mjs — the machine-enforced verification protocol (L0-L4).
 *
 * L0 Commitment: intent -> canonicalize -> hash -> commitment. Replayable:
 * the same intent bytes always produce the same commitmentId.
 * L1 Chain receipt: VERIFIED requires (a) every required field PRESENT and
 *   CONSISTENT (status, blockHash, txHash, chainId) and (b) an on-chain
 *   authority confirming the txHash/blockHash pair via `chain.getReceipt`.
 *   Missing/inconsistent fields -> UNKNOWN; no chain authority -> UNKNOWN
 *   (NO_CHAIN_EVIDENCE, never VERIFIED on structure alone); a chain that
 *   contradicts -> MISMATCH.
 * L2 Deterministic replay: replay(intent, receipt, rules) -> MATCH | MISMATCH
 *   | UNKNOWN. No partial success ever upgrades to MATCH; missing evidence
 *   is UNKNOWN, a contradiction is MISMATCH.
 * L3 Merkle proof: real sha-256 tree with compact proofs; verify(proof, root,
 *   leaf) lets a third party prove one leaf without carrying the whole bundle.
 * L4 ZK boundary: RESEARCH until a real circuit/prover/verifier + benchmark +
 *   conformance exist. Only the interface boundary is provided here — no fake
 *   implementation, no "ZK supported" claim anywhere.
 *
 * Usage:
 *   node scripts/ladder/verification-levels.mjs --self-check
 */

import { createHash } from "node:crypto";

export const PROTOCOL_SCHEMA = "CGEP/1";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

function canonical(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonical).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") + "}";
}

/* ------------------------------------------------------------------ L0 */

export function commit(intent) {
  if (!intent || typeof intent !== "object") {
    throw new TypeError("commit: intent is required");
  }
  if (!intent.subject) throw new TypeError("commit: intent.subject is required");
  if (!Array.isArray(intent.policy) || intent.policy.length === 0) {
    throw new TypeError("commit: intent.policy must be a non-empty list");
  }
  const payload = canonical(intent);
  const intentHash = "0x" + sha256(payload);
  const commitmentId = "0x" + sha256(`${PROTOCOL_SCHEMA}:COMMIT\x00${intentHash}`);
  return {
    schemaVersion: PROTOCOL_SCHEMA,
    commitmentId,
    intentHash,
    subject: intent.subject,
    chainId: intent.chainId || null,
    timestamp: intent.timestamp || null,
    policy: intent.policy,
    replayable: true,
  };
}

export function isReplayableCommitment(c) {
  return !!(c && c.replayable === true && typeof c.commitmentId === "string" && c.commitmentId.startsWith("0x"));
}

/* ------------------------------------------------------------------ L1 */

const LX1_REQUIRED = ["status", "blockHash", "txHash", "chainId"];
const HASH64 = /^0x[0-9a-fA-F]{64}$/;

export function verifyReceipt(receipt, commitment, chain) {
  if (!receipt || !commitment) {
    return { verdict: "UNKNOWN", verdictCode: "REQUIRED_EVIDENCE_MISSING", requiredMissing: LX1_REQUIRED };
  }
  const requiredMissing = LX1_REQUIRED.filter((k) => !receipt[k]);
  if (requiredMissing.length > 0) {
    return { verdict: "UNKNOWN", verdictCode: "REQUIRED_EVIDENCE_MISSING", requiredMissing };
  }
  const failures = [];
  if (receipt.status !== "VERIFIED") failures.push("status");
  if (!HASH64.test(receipt.blockHash)) failures.push("blockHash");
  if (!HASH64.test(receipt.txHash)) failures.push("txHash");
  if (commitment.chainId && receipt.chainId !== commitment.chainId) failures.push("chainId");
  if (failures.length > 0) {
    return { verdict: "UNKNOWN", verdictCode: "EVIDENCE_INCONSISTENT", reasoning: failures };
  }
  if (!chain || typeof chain.getReceipt !== "function") {
    return {
      verdict: "UNKNOWN",
      verdictCode: "NO_CHAIN_EVIDENCE",
      reason:
        "a format-valid receipt is NOT verified: no chain authority confirmed this txHash. VERIFIED requires on-chain confirmation, never structure alone.",
    };
  }
  const onChain = chain.getReceipt(receipt.txHash);
  if (!onChain) {
    return { verdict: "MISMATCH", verdictCode: "TX_NOT_FOUND", reason: `txHash ${receipt.txHash} is unknown to the chain` };
  }
  if (onChain.blockHash !== receipt.blockHash) {
    return { verdict: "MISMATCH", verdictCode: "BLOCK_HASH_MISMATCH", reason: "receipt names a block the chain does not confirm" };
  }
  return { verdict: "VERIFIED", verdictCode: "RECEIPT_INTEGRITY", requiredMissing: [] };
}

/* ------------------------------------------------------------------ L2 */

export function replay(intent, receipt, rules) {
  if (!intent || !receipt || !rules || rules.length === 0) {
    return { verdict: "UNKNOWN", verdictCode: "REQUIRED_EVIDENCE_MISSING", reason: "intent/receipt/rules incomplete" };
  }
  const failed = Array.isArray(receipt.failedChecks) ? receipt.failedChecks : [];
  const evidence = Array.isArray(receipt.evidence) ? receipt.evidence : [];
  for (const rule of rules) {
    if (failed.some((f) => f.rule === rule.id)) {
      return { verdict: "MISMATCH", verdictCode: "RULE_FAILED", reason: `${rule.id} contradicted` };
    }
  }
  for (const rule of rules) {
    const hit = evidence.find((e) => e.rule === rule.id);
    if (!hit) {
      return { verdict: "UNKNOWN", verdictCode: "EVIDENCE_MISSING", reason: `${rule.id} has no evidence` };
    }
    if (hit.result !== "PASS") {
      return { verdict: "MISMATCH", verdictCode: "RULE_FAILED", reason: `${rule.id} evidence is not PASS` };
    }
  }
  if (failed.length > 0 || rules.some((r) => !evidence.some((e) => e.rule === r.id && e.result === "PASS"))) {
    return { verdict: "UNKNOWN", verdictCode: "PARTIAL_SUCCESS_NOT_MATCH", reason: "no partial success upgrades to MATCH" };
  }
  return { verdict: "MATCH", verdictCode: "REPLAY_CONSISTENT", reason: "every canonical rule replayed to PASS" };
}

/* ------------------------------------------------------------------ L3 */

export function merkleTree(leaves) {
  if (!Array.isArray(leaves) || leaves.length === 0) {
    throw new TypeError("merkleTree: at least one leaf is required");
  }
  const leafHashes = leaves.map((l) => "0x" + sha256("leaf\x00" + l));
  const tree = [null];
  let level = leafHashes;
  tree.push([...level]);
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = i + 1 < level.length ? level[i + 1] : a;
      next.push("0x" + sha256("node\x00" + a.slice(2) + b.slice(2)));
    }
    tree.push(next);
    level = next;
  }
  return { leaves: leafHashes, tree, root: level[0], leafCount: leaves.length };
}

export function merkleProof(tree, index) {
  const proof = [];
  let level = tree[1];
  let idx = index;
  for (let h = 1; h < tree.length - 1; h++) {
    const siblingIndex = idx % 2 === 0 ? idx + 1 : idx - 1;
    const sibling = level[siblingIndex];
    if (sibling !== undefined) proof.push({ sibling, left: idx % 2 === 1 });
    idx = Math.floor(idx / 2);
    level = tree[h + 1];
  }
  return { leafIndex: index, path: proof };
}

export function verifyMerkle(proof, root, leaf) {
  if (!proof || !root || typeof leaf !== "string") return false;
  let h = "0x" + sha256("leaf\x00" + leaf);
  for (const step of proof.path) {
    const a = step.left ? step.sibling.slice(2) : h.slice(2);
    const b = step.left ? h.slice(2) : step.sibling.slice(2);
    h = "0x" + sha256("node\x00" + a + b);
  }
  return h === root;
}

/* ------------------------------------------------------------------ L4 */

export const L4_BOUNDARY = Object.freeze({
  version: "L4-BOUNDARY/CGEP-1",
  status: "RESEARCH",
  providerInterface: Object.freeze({
    VerificationProvider: Object.freeze([
      "CommitmentVerifier",
      "ReceiptVerifier",
      "ReplayVerifier",
      "MerkleVerifier",
      "ZKVerifier",
    ]),
  }),
  contract:
    "L4 is RESEARCH until a real ZK circuit/prover/verifier exists with a benchmark and conformance. The interface boundary is frozen now so a later implementation does not re-architect CoreGuard.",
  note: "No fake implementation. 'ZK supported' is never claimed.",
});

export function providerConformance(impl) {
  const required = ["commit", "verifyReceipt", "replay", "merkleVerify", "zkVerify"];
  const missing = required.filter((m) => !impl || typeof impl[m] !== "function");
  if (missing.length > 0) {
    return { status: "UNKNOWN", verdictCode: "PROVIDER_INCOMPLETE", missing };
  }
  return { status: "VERIFIED", verdictCode: "PROVIDER_CONFORMANT", missing: [] };
}

/* ------------------------------------------------------------------ CLI */

function selfCheck() {
  const c1 = commit({ subject: "alice", chainId: "1116", policy: [{ id: "VALUE_001" }] });
  const c2 = commit({ subject: "alice", chainId: "1116", policy: [{ id: "VALUE_001" }] });
  const replayable = c1.commitmentId === c2.commitmentId && isReplayableCommitment(c1);
  const goodTx = "0x" + "2".repeat(64);
  const goodBlock = "0x" + "1".repeat(64);
  const mockChain = {
    /* only the genuinely mined tx is known to the chain */
    getReceipt: (tx) => (tx === goodTx ? { txHash: goodTx, blockHash: goodBlock } : null),
  };
  const good = verifyReceipt(
    { status: "VERIFIED", blockHash: goodBlock, txHash: goodTx, chainId: "1116" },
    c1,
    mockChain,
  );
  const unconfirmed = verifyReceipt(
    { status: "VERIFIED", blockHash: goodBlock, txHash: goodTx, chainId: "1116" },
    c1,
  );
  const forged = verifyReceipt(
    { status: "VERIFIED", blockHash: "0x" + "f".repeat(64), txHash: "0x" + "e".repeat(64), chainId: "1116" },
    c1,
    mockChain,
  );
  const bad = verifyReceipt({ status: "VERIFIED", blockHash: "0x1234", txHash: "0x", chainId: "9999" }, c1, mockChain);
  const t = merkleTree(["a", "b", "c", "d"]);
  const p = merkleProof(t.tree, 1);
  const okProof = verifyMerkle(p, t.root, "b") && !verifyMerkle(p, t.root, "x");
  const plat = replay(
    { subject: "alice", policy: [{ id: "VALUE_001" }] },
    { evidence: [{ rule: "VALUE_001", result: "PASS" }] },
    [{ id: "VALUE_001" }],
  );
  const line = (label, pass) => console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}`);
  line("L0 deterministic + replayable", replayable);
  line("L1 VERIFIED only with full receipt + chain confirm", good.verdict === "VERIFIED");
  line("L1 no chain authority -> UNKNOWN", unconfirmed.verdict === "UNKNOWN");
  line("L1 chain contradiction -> MISMATCH", forged.verdict === "MISMATCH");
  line("L1 inconsistent -> UNKNOWN", bad.verdict === "UNKNOWN");
  line("L2 all-PASS -> MATCH", plat.verdict === "MATCH");
  line("L3 merkle proof honest", okProof);
  line("L4 boundary RESEARCH", L4_BOUNDARY.status === "RESEARCH");
  const ok =
    replayable &&
    good.verdict === "VERIFIED" &&
    unconfirmed.verdict === "UNKNOWN" &&
    forged.verdict === "MISMATCH" &&
    bad.verdict === "UNKNOWN" &&
    plat.verdict === "MATCH" &&
    okProof &&
    L4_BOUNDARY.status === "RESEARCH";
  console.log(`\nVERIFICATION-LEVELS SELF-CHECK: ${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && process.argv[1].endsWith("verification-levels.mjs")) {
  if (process.argv.includes("--self-check")) selfCheck();
}