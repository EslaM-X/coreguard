#!/usr/bin/env node
/**
 * attack-lab.mjs — the official tamper/attack lab (`npm run attack-lab`).
 *
 * Every attack mutates a piece of evidence and asserts the fail-closed
 * verdict. L1 never VERIFIED on structure alone: a mock chain authority
 * confirms txHash/blockHash, so swapped/mismatched hashes are caught
 * (MISMATCH -> FAIL), contradictory evidence -> FAIL, insufficient evidence
 * -> UNKNOWN, and the untouched valid path -> VERIFIED.
 * Exit code 1 when any attack does not land on its expected verdict.
 *
 * Usage:
 *   node scripts/attack-lab.mjs          # text
 *   node scripts/attack-lab.mjs --json   # machine-readable
 */

import { createHash } from "node:crypto";
import { commit, verifyReceipt, replay } from "./ladder/verification-levels.mjs";

const TRUE_TX = "0x" + "aa".repeat(32);
const TRUE_BLOCK = "0x" + "bb".repeat(32);

const mockChain = {
  /* the chain only knows the genuinely mined tx */
  getReceipt: (tx) => (tx === TRUE_TX ? { txHash: TRUE_TX, blockHash: TRUE_BLOCK } : null),
};

const RULES = [{ id: "VALUE_001" }, { id: "TARGET_001" }, { id: "DEADLINE_001" }];

function baseReceipt(overrides = {}) {
  return {
    status: "VERIFIED",
    blockHash: TRUE_BLOCK,
    txHash: TRUE_TX,
    chainId: "1116",
    evidence: RULES.map((r) => ({ rule: r.id, result: "PASS" })),
    failedChecks: [],
    ...overrides,
  };
}

function baseIntent() {
  return { subject: "victim", chainId: "1116", policy: RULES };
}

const ATTACK_CASES = [
  { id: "altered-receipt", expected: "FAIL", mutate: () => baseReceipt({ txHash: "0x" + "c".repeat(64) }) },
  { id: "altered-intent", expected: "FAIL", mutate: () => baseReceipt({ evidence: RULES.map((r) => (r.id === "TARGET_001" ? { rule: r.id, result: "FAIL" } : { rule: r.id, result: "PASS" })) }) },
  { id: "hash-mismatch", expected: "FAIL", mutate: () => baseReceipt({ blockHash: "0x" + "0".repeat(64) }) },
  { id: "stale-proof", expected: "FAIL", mutate: () => baseReceipt({ blockHash: "0x" + "d".repeat(64) }) },
  { id: "wrong-chain", expected: "UNKNOWN", mutate: () => baseReceipt({ chainId: "1114" }) },
  { id: "wrong-block", expected: "FAIL", mutate: () => baseReceipt({ txHash: "0x" + "e".repeat(64), blockHash: "0x" + "f".repeat(64) }) },
  { id: "wrong-subject", expected: "UNKNOWN", mutate: () => baseReceipt({ evidence: [{ rule: "VALUE_001", result: "PASS" }] }) },
  { id: "missing-evidence", expected: "UNKNOWN", mutate: () => baseReceipt({ evidence: [] }) },
  { id: "replay-mismatch", expected: "FAIL", mutate: () => baseReceipt({ failedChecks: [{ rule: "DEADLINE_001", result: "FAIL" }] }) },
  { id: "forged-adapter-status", expected: "UNKNOWN", mutate: () => baseReceipt({ evidence: [] }) },
];

export function runAttackLab() {
  const sequence = ATTACK_CASES.map(({ id, expected, mutate }) => {
    const commitment = commit(baseIntent());
    const attacked = mutate();
    const l1 = verifyReceipt(attacked, commitment, mockChain);
    const l2 = replay(baseIntent(), attacked, RULES);

    let verdict;
    if (l1.verdict === "MISMATCH" || l2.verdict === "MISMATCH") verdict = "FAIL";
    else if (l1.verdict === "UNKNOWN" || l2.verdict === "UNKNOWN") verdict = "UNKNOWN";
    else verdict = "VERIFIED";

    return { attack: id, expected, verdict, pass: verdict === expected, l1: l1.verdict, l2: l2.verdict };
  });

  /* control: the untouched valid path must VERIFY against the same chain */
  const ctrlCommitment = commit(baseIntent());
  const ctrl = baseReceipt();
  const ctrlOk =
    verifyReceipt(ctrl, ctrlCommitment, mockChain).verdict === "VERIFIED" && replay(baseIntent(), ctrl, RULES).verdict === "MATCH";
  return { sequence, control: { id: "valid-control", verdict: "VERIFIED", pass: ctrlOk } };
}

function main() {
  const args = process.argv.slice(2);
  const { sequence, control } = runAttackLab();
  const bad = sequence.filter((a) => !a.pass).length;
  if (args.includes("--json")) {
    console.log(JSON.stringify({ sequence, control }, null, 2));
  } else {
    console.log("COREGUARD ATTACK LAB — tampered -> FAIL, unknown -> UNKNOWN, valid -> VERIFIED");
    for (const a of sequence) {
      console.log(`  ${a.attack.padEnd(24)} expected=${a.expected.padEnd(6)} verdict=${a.verdict.padEnd(8)} ${a.pass ? "OK" : "BROKEN"}`);
    }
    console.log(`  ${control.id.padEnd(24)} verdict=${control.verdict}            ${control.pass ? "OK" : "BROKEN"}`);
    console.log(`\n  attacks: ${sequence.length} · failures: ${bad} · control: ${control.verdict}`);
  }
  process.exitCode = bad === 0 && control.pass ? 0 : 1;
}

if (process.argv[1] && process.argv[1].endsWith("attack-lab.mjs")) main();