/**
 * CoreGuard Verifier — P0 required-evidence verdict semantics
 *
 * Proves the offline verifier can NEVER reach VERIFIED when a required-evidence
 * item for the claimed level is missing, and that any FAIL dominates.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { hashIntent, hashPolicy, hashTrace } from "../../packages/canonical/index.js";
import { createEvidenceBundle, createReceipt } from "../../packages/evidence/index.js";
import { verifyReceipt, evaluateCheckVerdict } from "../../packages/verifier/index.js";

const intent = {
  version: "CGEP/1",
  chainId: "1114",
  signer: "0x0000000000000000000000000000000000000001",
  nonce: "0",
  validAfter: "0",
  validUntil: "9999999999",
  action: "TRANSFER",
  target: "0x0000000000000000000000000000000000000002",
  selector: "0xa9059cbb",
  asset: "0x0000000000000000000000000000000000000002",
  amount: "100000000",
  recipient: "0x0000000000000000000000000000000000000003",
  constraints: [],
};

const policy = {
  version: "CGEP/1",
  policyId: "0xabc",
  name: "test",
  rules: [],
};

const transferCalldata =
  "0xa9059cbb" +
  intent.recipient.slice(2).padStart(64, "0") +
  intent.amount.padStart(64, "0");

const trace = {
  version: "CGEP/1",
  txHash: "0x00000000000000000000000000000000000000000000000000000000000000aa",
  from: "0x0000000000000000000000000000000000000001",
  to: "0x0000000000000000000000000000000000000002",
  value: "100000000",
  calldata: transferCalldata,
  status: "SUCCESS",
  gasUsed: "70000",
  blockNumber: "123456",
  blockHash: "0x00000000000000000000000000000000000000000000000000000000000000bb",
  blockTimestamp: "1200",
  calls: [],
  events: [],
  balanceChanges: [],
  storageChanges: [],
};

async function buildValidReceipt(level = "L2") {
  const intentHash = await hashIntent(intent);
  const policyHash = await hashPolicy(policy);
  const traceHash = await hashTrace(trace);

  const evidence = await createEvidenceBundle({
    intentHash,
    policyHash,
    traceHash,
    stateDeltaHash: "0x" + "11".repeat(32),
    result: "VALID",
    verifications: [],
    simulation: { blockNumber: 123450, blockHash: "0x" + "cc".repeat(32) },
    execution: { blockNumber: 123456, blockHash: "0x" + "bb".repeat(32) },
  });

  const receipt = await createReceipt({
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
    verificationLevel: level,
    result: "VALID",
    checks: [],
  });

  return { receipt, evidence };
}

test("verifier: full L2 evidence -> VERIFIED", async () => {
  const { receipt } = await buildValidReceipt("L2");
  const r = await verifyReceipt(
    { ...receipt.receipt, receiptId: receipt.receiptId },
    null,
    intent,
    policy,
    trace
  );
  assert.equal(r.result, "VERIFIED");
  assert.ok(r.checks.every((c) => c.result === "PASS"));
});

test("verifier: L2 claim with NO trace -> UNVERIFIED, never VERIFIED", async () => {
  const { receipt } = await buildValidReceipt("L2");
  const r = await verifyReceipt(
    { ...receipt.receipt, receiptId: receipt.receiptId },
    null,
    intent,
    policy,
    null
  );
  assert.equal(r.result, "UNVERIFIED");
  assert.ok(r.requiredMissing.includes("TRACE_HASH"));
  assert.ok(r.requiredMissing.includes("INTENT_EXECUTION_BINDING"));
});

test("verifier: L2 claim without intent -> UNVERIFIED", async () => {
  const { receipt } = await buildValidReceipt("L2");
  const r = await verifyReceipt(
    { ...receipt.receipt, receiptId: receipt.receiptId },
    null,
    null,
    policy,
    trace
  );
  assert.equal(r.result, "UNVERIFIED");
  assert.ok(r.requiredMissing.includes("INTENT_HASH"));
});

test("verifier: L1 claim can pass without trace (trace is optional at L1)", async () => {
  const { receipt } = await buildValidReceipt("L1");
  const r = await verifyReceipt(
    { ...receipt.receipt, receiptId: receipt.receiptId },
    null,
    intent,
    policy,
    null
  );
  assert.equal(r.result, "VERIFIED");
});

test("verifier: any FAIL dominates -> INVALID even at L0", async () => {
  const { receipt } = await buildValidReceipt("L0");
  const tampered = {
    ...receipt.receipt,
    receiptId: receipt.receiptId,
    intentHash: "0x" + "ff".repeat(32),
  };
  const r = await verifyReceipt(tampered, null, intent, policy, trace);
  assert.equal(r.result, "INVALID");
});

test("verifier: optional evidence FAIL still INVALID (contradiction dominates)", async () => {
  const { receipt } = await buildValidReceipt("L1");
  const badEvidence = { version: "CGEP/1", junk: true };
  const r = await verifyReceipt(
    { ...receipt.receipt, receiptId: receipt.receiptId },
    badEvidence,
    intent,
    policy,
    null
  );
  assert.equal(r.result, "INVALID");
});

test("verifier: unknown claim level -> UNVERIFIED, never silently VERIFIED", async () => {
  const { receipt } = await buildValidReceipt("L9");
  const r = await verifyReceipt(
    { ...receipt.receipt, receiptId: receipt.receiptId },
    null,
    intent,
    policy,
    trace
  );
  assert.equal(r.result, "UNVERIFIED");
  assert.equal(r.verdictCode, "UNSUPPORTED_LEVEL");
});

test("evaluateCheckVerdict: L3/L4 exist but are not claimable -> INCONCLUSIVE (matches anchor-verdict)", () => {
  for (const level of ["L3", "L4"]) {
    const checks = [{ check: "RECEIPT_COMMITMENT", result: "PASS" }];
    const v = evaluateCheckVerdict(level, checks);
    assert.equal(v.verdict, "INCONCLUSIVE");
    assert.equal(v.code, "LEVEL_UNAVAILABLE");
  }
  // Unknown levels are UNVERIFIED — never silently VERIFIED.
  const v = evaluateCheckVerdict("L9", [{ check: "RECEIPT_COMMITMENT", result: "PASS" }]);
  assert.equal(v.verdict, "UNVERIFIED");
  assert.equal(v.code, "UNSUPPORTED_LEVEL");
});