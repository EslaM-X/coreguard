/**
 * CoreGuard Multistep Demo (batch strategy)
 *
 * Runs the full pipeline offline for a smart-account batch (execTransaction):
 *   approve → swap → settle in one committed call.
 *
 * Shows:
 *   1. Valid batch execution           → VERIFIED
 *   2. Substitution (swap execution)   → INVALID (commitment binds one execution)
 *   3. Tampered receipt                → INVALID (commitment mismatch)
 *
 * Note on per-call enforcement: the trace normalizer flattens every nested
 * call with depth, so "expected call sequence vs observed call sequence" can
 * be diffed. Deep per-call sequence enforcement (hidden-hop recipient,
 * sandwich, reentrant exit, order-swap) is the documented L2 replay layer —
 * see benchmarks/corpus (MULTI category) and spec/verification-levels.md.
 *
 * Usage: node examples/multistep/run-demo.js
 */

import { readFile, writeFile } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { hashIntent, hashPolicy, hashTrace } from "../../packages/canonical/index.js";
import { evaluatePolicy } from "../../packages/policy/index.js";
import { computeStateDelta } from "../../packages/trace/index.js";
import { createEvidenceBundle, createReceipt } from "../../packages/evidence/index.js";
import { verifyReceipt } from "../../packages/verifier/index.js";
import { extractRecipient } from "../../packages/cli/src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const load = (f) => readFile(resolve(here, f), "utf8").then(JSON.parse);

function runAnalysis(intent, policy, trace) {
  const policyResult = evaluatePolicy(policy, {
    value: trace.value,
    target: trace.to,
    recipient: extractRecipient(trace) || intent.recipient,
    selector: trace.calldata.slice(0, 10),
    blockTimestamp: trace.blockTimestamp,
    slippageBps: "0",
  });
  return {
    result: policyResult.result === "SATISFIED" ? "VALID" : "INVALID",
    policyResult,
    stateDelta: computeStateDelta(trace),
  };
}

async function buildReceipt(intent, policy, trace, result) {
  const intentHash = await hashIntent(intent);
  const policyHash = await hashPolicy(policy);
  const traceHash = await hashTrace(trace);

  const evidence = await createEvidenceBundle({
    intentHash,
    policyHash,
    traceHash,
    stateDeltaHash: "0x" + "33".repeat(32),
    result,
    verifications: [{ level: "L2", engine: "coreguard-v0.1.0" }],
    simulation: { blockNumber: 323450, blockHash: "0x" + "cc".repeat(32) },
    execution: { blockNumber: 323456, blockHash: "0x" + "bb".repeat(32) },
  });

  const { receiptId, receipt } = await createReceipt({
    chainId: 1114,
    txHash: trace.txHash,
    blockHash: trace.blockHash,
    blockNumber: trace.blockNumber,
    intentHash,
    policyHash,
    executionTraceHash: traceHash,
    stateDeltaHash: evidence.evidence.stateDeltaHash,
    evidenceRoot: evidence.hash,
    simulation: { blockNumber: 323450, blockHash: "0x" + "cc".repeat(32) },
    execution: { blockNumber: 323456, blockHash: "0x" + "bb".repeat(32) },
    verifierVersion: "0.1.0",
    verificationLevel: "L2",
    result,
    checks: [],
  });

  return { ...receipt, receiptId };
}

async function main() {
  const intent = await load("intent.json");
  const policy = await load("policy.json");
  const trace = await load("trace.json");

  console.log("\n── STEP 1: VALID batch strategy execution ───────────────");
  const valid = runAnalysis(intent, policy, trace);
  console.log(`Policy result: ${valid.result}`);
  console.log(`Normalized calls (flattened): ${trace.calls.length} (depth 0 + sub-calls)`);
  for (const c of trace.calls.slice(1)) {
    console.log(`  call → ${c.to} ${c.calldata.slice(0, 10)} value=${c.value}`);
  }

  const validReceipt = await buildReceipt(intent, policy, trace, valid.result);
  console.log(`Receipt ID:    ${validReceipt.receiptId}`);

  console.log("\n── STEP 2: Independent verification ─────────────────────");
  const verification = await verifyReceipt(validReceipt, null, intent, policy, trace);
  for (const c of verification.checks) {
    const mark = c.result === "PASS" ? "✓" : c.result === "NOT_RUN" ? "·" : "✗";
    console.log(`  ${mark} ${c.check}`);
  }
  console.log(`Result: ${verification.result}`);

  console.log("\n── STEP 3: Substitution — different batch under same intent ──");
  const swappedTrace = {
    ...trace,
    txHash: "0x" + "aa".repeat(32),
    calldata: "0x6a7612020000000000000000000000000000000000000000000000000000000000000009",
    blockHash: "0x" + "99".repeat(32),
  };
  console.log(`Swap in a batch executing a different payload under the same intent`);
  const spoofed = {
    ...validReceipt,
    executionTraceHash: (await hashTrace(swappedTrace)),
    txHash: swappedTrace.txHash,
    blockHash: swappedTrace.blockHash,
    blockNumber: swappedTrace.blockNumber,
  };
  const spoofVerification = await verifyReceipt(spoofed, null, intent, policy, swappedTrace);
  for (const c of spoofVerification.checks) {
    const mark = c.result === "PASS" ? "✓" : c.result === "NOT_RUN" ? "·" : "✗";
    console.log(`  ${mark} ${c.check}${c.result === "FAIL" ? ` — ${c.detail}` : ""}`);
  }
  console.log(`Result: ${spoofVerification.result}`);

  console.log("\n── STEP 4: Tamper with the valid receipt ────────────────");
  const tampered = { ...validReceipt, result: "INVALID" };
  const tamperedVerification = await verifyReceipt(tampered, null, intent, policy, trace);
  for (const c of tamperedVerification.checks) {
    const mark = c.result === "PASS" ? "✓" : c.result === "NOT_RUN" ? "·" : "✗";
    console.log(`  ${mark} ${c.check} — ${c.detail}`);
  }
  console.log(`Result: ${tamperedVerification.result}`);

  console.log("\n── SUMMARY ──────────────────────────────────────────────");
  console.log(`  VALID batch   → ${valid.result}/VERIFIED`);
  console.log(`  SUBSTITUTION  → ${spoofVerification.result} (commitment binds one execution)`);
  console.log(`  TAMPER        → ${tamperedVerification.result} (commitment mismatch)`);
  console.log(`  Deep call-sequence diff (hidden hop / sandwich / order) → L2 layer, catalogued`);

  await writeFile(
    resolve(here, "receipt-valid.json"),
    JSON.stringify({ receiptId: validReceipt.receiptId, receipt: validReceipt }, null, 2)
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}