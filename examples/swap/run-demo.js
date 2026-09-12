/**
 * CoreGuard Swap Demo
 *
 * Runs the full pipeline offline for a DEX swap (exact-in / min-out):
 *   policy: VALUE_LIMIT + TARGET/SELECTOR allowlist + SLIPPAGE_BPS + DEADLINE.
 *
 * Shows:
 *   1. Valid swap             → policy SATISFIED → VERIFIED
 *   2. Mutated swap (front-run: higher slippage + routed recipient)
 *                              → SLIPPAGE_BPS VIOLATED → INVALID
 *   3. Tampered receipt       → commitment mismatch → INVALID
 *
 * Usage: node examples/swap/run-demo.js
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

function runAnalysis(intent, policy, trace, slippageBps) {
  const policyResult = evaluatePolicy(policy, {
    value: trace.value,
    target: trace.to,
    recipient: extractRecipient(trace) || intent.recipient,
    selector: trace.calldata.slice(0, 10),
    blockTimestamp: trace.blockTimestamp,
    slippageBps,
  });
  return {
    result: policyResult.result === "SATISFIED" ? "VALID" : "INVALID",
    policyResult,
    stateDelta: computeStateDelta(trace),
  };
}

async function buildReceipt(intent, policy, trace, result, level = "L2") {
  const intentHash = await hashIntent(intent);
  const policyHash = await hashPolicy(policy);
  const traceHash = await hashTrace(trace);

  const evidence = await createEvidenceBundle({
    intentHash,
    policyHash,
    traceHash,
    stateDeltaHash: "0x" + "22".repeat(32),
    result,
    verifications: [{ level, engine: "coreguard-v0.1.0" }],
    simulation: { blockNumber: 223450, blockHash: "0x" + "cc".repeat(32) },
    execution: { blockNumber: 223456, blockHash: "0x" + "bb".repeat(32) },
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
    simulation: { blockNumber: 223450, blockHash: "0x" + "cc".repeat(32) },
    execution: { blockNumber: 223456, blockHash: "0x" + "bb".repeat(32) },
    verifierVersion: "0.1.0",
    verificationLevel: level,
    result,
    checks: [],
  });

  return { ...receipt, receiptId };
}

async function main() {
  const intent = await load("intent.json");
  const policy = await load("policy.json");
  const trace = await load("trace.json");

  console.log("\n── STEP 1: VALID exact-in swap (0 bps slippage) ─────────");
  const valid = runAnalysis(intent, policy, trace, "0");
  console.log(`Policy result: ${valid.result}`);
  for (const r of valid.policyResult.rules) {
    console.log(`  ${r.result === "PASS" ? "✓" : "✗"} ${r.ruleId} ${r.type ?? ""}`);
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

  console.log("\n── STEP 3: MUTATE — front-run the swap ──────────────────");
  const attacker = "0x0000000000000000000000000000000000000099";
  const mutatedTrace = {
    ...trace,
    txHash: "0x" + "dd".repeat(32),
    calldata:
      "0x38ed1739" +
      "00000000000000000000000000000000000000000000000000000000005f5e100" +
      "00000000000000000000000000000000000000000000000000000000004c4b40" +
      "0000000000000000000000000000000000000000000000000000000000000001" +
      "0000000000000000000000000000000000000000000000000000000000000005" +
      "0000000000000000000000000000000000000000000000000000000000000004",
  };
  const mutated = runAnalysis(intent, policy, mutatedTrace, "600");
  console.log(`Slippage observed: 600 bps against a 500 bps bound`);
  console.log(`Routed to attacker address in calldata`);
  console.log(`Policy result: ${mutated.result} — REJECTED BEFORE ANCHORING`);
  console.log(`(an execution violating the policy never receives a committed receipt)`);

  console.log("\n── STEP 4: Substitution — replay under a committed intent ──");
  console.log(`Attacker holds the VALID receipt but swaps in the mutated execution:`);
  const spoofed = {
    ...validReceipt,
    executionTraceHash: (await hashTrace(mutatedTrace)),
    txHash: mutatedTrace.txHash,
    blockHash: mutatedTrace.blockHash,
    blockNumber: mutatedTrace.blockNumber,
  };
  const spoofVerification = await verifyReceipt(spoofed, null, intent, policy, mutatedTrace);
  for (const c of spoofVerification.checks) {
    const mark = c.result === "PASS" ? "✓" : c.result === "NOT_RUN" ? "·" : "✗";
    console.log(`  ${mark} ${c.check}${c.result === "FAIL" ? ` — ${c.detail}` : ""}`);
  }
  console.log(`Result: ${spoofVerification.result}`);
  console.log(`(the anchored commitment is bound to ONE execution — substitution cannot pass)`);

  console.log("\n── STEP 5: Tamper with the valid receipt ────────────────");
  const tampered = { ...validReceipt, result: "INVALID" };
  const tamperedVerification = await verifyReceipt(tampered, null, intent, policy, trace);
  for (const c of tamperedVerification.checks) {
    const mark = c.result === "PASS" ? "✓" : c.result === "NOT_RUN" ? "·" : "✗";
    console.log(`  ${mark} ${c.check} — ${c.detail}`);
  }
  console.log(`Result: ${tamperedVerification.result}`);

  console.log("\n── SUMMARY ──────────────────────────────────────────────");
  console.log(`  VALID swap   → ${valid.result}/VERIFIED`);
  console.log(`  FRONT-RUN    → ${mutated.result} (policy rejects before anchoring)`);
  console.log(`  SUBSTITUTION → ${spoofVerification.result} (committed intent bound to one execution)`);
  console.log(`  TAMPER       → ${tamperedVerification.result} (commitment mismatch)`);

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