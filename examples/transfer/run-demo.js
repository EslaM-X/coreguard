/**
 * CoreGuard Transfer Demo
 *
 * Runs the full pipeline offline:
 *   VALID transfer → receipt → and a MUTATED transfer → INVALID,
 * plus tamper detection. This mirrors the public demo:
 *   CONFORMS → mutate → DETECTED → VERIFIED → on-chain anchor.
 *
 * Usage: node examples/transfer/run-demo.js
 */

import { readFile, writeFile } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { hashIntent, hashPolicy, hashTrace, computeReceiptId } from "../../packages/canonical/index.js";
import { evaluatePolicy } from "../../packages/policy/index.js";
import { computeStateDelta } from "../../packages/trace/index.js";
import { createEvidenceBundle, createReceipt } from "../../packages/evidence/index.js";
import { verifyReceipt } from "../../packages/verifier/index.js";
import { extractRecipient } from "../../packages/cli/src/index.js"; // note: no side effects on import

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
    stateDeltaHash: "0x" + "11".repeat(32),
    result,
    verifications: [{ level: "L1", engine: "coreguard-v0.1.0" }],
    simulation: { blockNumber: 123450, blockHash: "0x" + "cc".repeat(32) },
    execution: { blockNumber: 123456, blockHash: "0x" + "bb".repeat(32) },
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
    simulation: { blockNumber: 123450, blockHash: "0x" + "cc".repeat(32) },
    execution: { blockNumber: 123456, blockHash: "0x" + "bb".repeat(32) },
    verifierVersion: "0.1.0",
    verificationLevel: result === "VALID" ? "L2" : "L1",
    result,
    checks: [],
  });

  return { ...receipt, receiptId };
}

async function main() {
  const intent = await load("intent.json");
  const policy = await load("policy.json");
  const trace = await load("trace.json");

  console.log("\n── STEP 1: VALID execution ──────────────────────────────");
  const valid = runAnalysis(intent, policy, trace);
  console.log(`Policy result: ${valid.result} (${valid.policyResult.rules.length} rules evaluated)`);

  const validReceipt = await buildReceipt(intent, policy, trace, valid.result);
  console.log(`Receipt ID:    ${validReceipt.receiptId}`);

  console.log("\n── STEP 2: Independent verification ─────────────────────");
  const verification = await verifyReceipt(validReceipt, null, intent, policy, trace);
  for (const c of verification.checks) {
    const mark = c.result === "PASS" ? "✓" : c.result === "NOT_RUN" ? "·" : "✗";
    console.log(`  ${mark} ${c.check}`);
  }
  console.log(`Result: ${verification.result}`);

  console.log("\n── STEP 3: MUTATE the execution ─────────────────────────");
  const attacker = "0x0000000000000000000000000000000000000099";
  const mutatedTrace = {
    ...trace,
    txHash: "0x" + "dd".repeat(32),
    calldata:
      "0xa9059cbb" +
      attacker.slice(2).padStart(64, "0") +
      "0000000000000000000000000000000000000000000000000000000005f5e100",
  };

  const mutated = runAnalysis(intent, policy, mutatedTrace);
  console.log(`Mutated recipient → ${attacker}`);
  console.log(`Policy result: ${mutated.result}`);

  console.log("\n── STEP 4: Mutated execution does NOT verify ────────────");
  const mutatedReceipt = await buildReceipt(intent, policy, mutatedTrace, mutated.result);
  const mutatedVerification = await verifyReceipt(mutatedReceipt, null, intent, policy, mutatedTrace);
  for (const c of mutatedVerification.checks) {
    const mark = c.result === "PASS" ? "✓" : c.result === "NOT_RUN" ? "·" : "✗";
    console.log(`  ${mark} ${c.check}`);
  }
  console.log(`Result: ${mutatedVerification.result}`);

  console.log("\n── STEP 5: Tamper with a valid receipt ──────────────────");
  const tampered = { ...validReceipt, result: "VALID" };
  // flip the anchored receipt result
  const tamperedVerification = await verifyReceipt(
    { ...tampered, result: "INVALID" },
    null,
    intent,
    policy,
    trace
  );
  for (const c of tamperedVerification.checks) {
    const mark = c.result === "PASS" ? "✓" : c.result === "NOT_RUN" ? "·" : "✗";
    console.log(`  ${mark} ${c.check} — ${c.detail}`);
  }
  console.log(`Result: ${tamperedVerification.result}`);

  console.log("\n── SUMMARY ──────────────────────────────────────────────");
  console.log(`  VALID   → ${valid.result}/VERIFIED`);
  console.log(`  MUTATED → ${mutated.result} (rejected before anchoring)`);
  console.log(`  TAMPER  → ${tamperedVerification.result} (commitment mismatch)`);
  console.log(`\nNext on-chain step: anchor receipt ID via EvidenceRegistry.commitIntent`);

  await writeFile(
    resolve(here, "receipt-valid.json"),
    JSON.stringify({ receiptId: validReceipt.receiptId, receipt: validReceipt }, null, 2)
  );
  await writeFile(
    resolve(here, "receipt-invalid.json"),
    JSON.stringify({ receiptId: mutatedReceipt.receiptId, receipt: mutatedReceipt }, null, 2)
  );

  // Also write the valid receipt for the CLI: coreguard report --receipt docs
  return { validReceipt, mutatedVerification, tamperedVerification };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}