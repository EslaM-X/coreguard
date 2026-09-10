/**
 * CoreGuard Verifier Tests
 *
 * Verify that the independent verifier detects tampering and validates correctly.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { hashIntent, hashPolicy, hashTrace } from "../../packages/canonical/index.js";
import { createEvidenceBundle, createReceipt } from "../../packages/evidence/index.js";
import { verifyReceipt } from "../../packages/verifier/index.js";

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

async function buildValidReceipt() {
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
    verificationLevel: "L2",
    result: "VALID",
    checks: [],
  });

  return { intentHash, policyHash, traceHash, evidence, receipt };
}

test("receipt ID is deterministic", async () => {
  const a = await buildValidReceipt();
  const b = await buildValidReceipt();
  assert.equal(a.receipt.receiptId, b.receipt.receiptId);
});

test("verifier passes for valid receipt", async () => {
  const { receipt, intentHash, policyHash, traceHash } = await buildValidReceipt();

  const result = await verifyReceipt(
    { ...receipt.receipt, receiptId: receipt.receiptId },
    null,
    intent,
    policy,
    trace
  );

  assert.equal(result.result, "VERIFIED");
  assert.ok(result.checks.length > 0);
});

test("verifier detects tampered intent hash", async () => {
  const { receipt, intentHash, policyHash, traceHash } = await buildValidReceipt();

  // Tamper with the receipt intentHash
  const tampered = {
    ...receipt.receipt,
    receiptId: receipt.receiptId,
    intentHash: "0x" + "ff".repeat(32),
  };

  const result = await verifyReceipt(tampered, null, intent, policy, trace);
  assert.equal(result.result, "INVALID");
});

test("verifier detects tampered trace", async () => {
  const { receipt, intentHash, policyHash } = await buildValidReceipt();

  // Tamper with the trace
  const tamperedTrace = {
    ...trace,
    recipient: "0xBAD",
  };

  const result = await verifyReceipt(
    { ...receipt.receipt, receiptId: receipt.receiptId },
    null,
    intent,
    policy,
    tamperedTrace
  );

  assert.equal(result.result, "INVALID");
});

test("verifier rejects changed quantity", async () => {
  const { receipt } = await buildValidReceipt();

  const mutatedReceipt = {
    ...receipt.receipt,
    receiptId: "0x" + "00".repeat(32), // Changed ID
  };

  const result = await verifyReceipt(mutatedReceipt, null, intent, policy, trace);
  assert.equal(result.result, "INVALID");
});