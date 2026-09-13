/**
 * CoreGuard — External Verification Surface (CGEP/1:VERIFY-RUN)
 *
 * Proves the public surface (packages/verifier/run.js) is:
 *   - fail-closed: missing required evidence → UNVERIFIED; any FAIL → INVALID;
 *     L3/L4 → INCONCLUSIVE; unknown level → UNVERIFIED
 *   - privacy-minimal: the report never embeds the intent/policy/trace/evidence
 *     bodies — commitments only
 *   - exit-code mapped: VERIFIED→0, INVALID→2, UNVERIFIED→3, INCONCLUSIVE→4
 *   - read-only chain bindings: absent → NOT_RUN (never blocks VERIFIED),
 *     contradiction → FAIL → INVALID
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { hashIntent, hashPolicy, hashTrace } from "../../packages/canonical/index.js";
import { createEvidenceBundle, createReceipt } from "../../packages/evidence/index.js";
import {
  runVerification,
  deriveRpcBindings,
  exitCodeForVerdict,
  normalizeReceiptDocument,
} from "../../packages/verifier/run.js";

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

test("verify-run: full L2 claim -> VERIFIED, exit 0", async () => {
  const { receipt, evidence } = await buildValidReceipt("L2");
  const doc = { receiptId: receipt.receiptId, receipt: receipt.receipt };
  const report = await runVerification({
    receipt: doc,
    evidence: evidence.evidence,
    intent,
    policy,
    trace,
  });

  assert.equal(report.contract, "CGEP/1:VERIFY-RUN");
  assert.equal(report.verdict.verdict, "VERIFIED");
  assert.equal(report.verdict.code, "RECEIPT_INTEGRITY");
  assert.equal(report.exitCode, 0);
  assert.ok(report.verified.every((c) => c.result === "PASS"));
});

test("verify-run: report never embeds intent/policy/trace bodies", async () => {
  const { receipt, evidence } = await buildValidReceipt("L2");
  const report = await runVerification({
    receipt: { receiptId: receipt.receiptId, receipt: receipt.receipt },
    evidence: evidence.evidence,
    intent,
    policy,
    trace,
  });
  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes(transferCalldata.slice(0, 40)));
  assert.ok(!serialized.includes("RECIPIENT_ALLOWLIST"));
  assert.ok(!serialized.includes(intent.recipient));
  assert.ok(!serialized.includes("9999999999"));
});

test("verify-run: L2 claim with NO trace -> UNVERIFIED, exit 3", async () => {
  const { receipt } = await buildValidReceipt("L2");
  const report = await runVerification({
    receipt: { receiptId: receipt.receiptId, receipt: receipt.receipt },
    intent,
    policy,
    trace: null,
  });
  assert.equal(report.verdict.verdict, "UNVERIFIED");
  assert.equal(report.verdict.code, "MISSING_REQUIRED_EVIDENCE");
  assert.equal(report.exitCode, 3);
  assert.ok(report.verdict.requiredMissing.includes("TRACE_HASH"));
  assert.ok(report.verdict.requiredMissing.includes("INTENT_EXECUTION_BINDING"));
});

test("verify-run: any FAIL dominates -> INVALID, exit 2", async () => {
  const { receipt } = await buildValidReceipt("L2");
  const tampered = { ...receipt.receipt, intentHash: "0x" + "ff".repeat(32) };
  const report = await runVerification({
    receipt: { receiptId: receipt.receiptId, receipt: tampered },
    intent,
    policy,
    trace,
  });
  assert.equal(report.verdict.verdict, "INVALID");
  assert.equal(report.verdict.code, "CONTRADICTION");
  assert.equal(report.exitCode, 2);
});

test("verify-run: L3/L4 unclaimable -> INCONCLUSIVE, exit 4", async () => {
  for (const level of ["L3", "L4"]) {
    const { receipt } = await buildValidReceipt(level);
    const report = await runVerification({
      receipt: { receiptId: receipt.receiptId, receipt: receipt.receipt },
      intent,
      policy,
      trace,
    });
    assert.equal(report.verdict.verdict, "INCONCLUSIVE");
    assert.equal(report.verdict.code, "LEVEL_UNAVAILABLE");
    assert.equal(report.exitCode, 4);
  }
});

test("verify-run: unknown level -> UNVERIFIED, exit 3", async () => {
  const { receipt } = await buildValidReceipt("L9");
  const report = await runVerification({
    receipt: { receiptId: receipt.receiptId, receipt: receipt.receipt },
    intent,
    policy,
    trace,
  });
  assert.equal(report.verdict.verdict, "UNVERIFIED");
  assert.equal(report.verdict.code, "UNSUPPORTED_LEVEL");
  assert.equal(report.exitCode, 3);
});

test("verify-run: read-only RPC bindings all match keep VERIFIED", async () => {
  const { receipt } = await buildValidReceipt("L2");
  const snapshot = {
    chainId: "0x45a", // 1114 in hex
    tx: { hash: "0x00000000000000000000000000000000000000000000000000000000000000aa", blockNumber: "0x1e240" },
    receiptLog: { blockHash: "0x00000000000000000000000000000000000000000000000000000000000000bb", blockNumber: "0x1e240" },
    block: { hash: "0x00000000000000000000000000000000000000000000000000000000000000bb", number: "0x1e240" },
  };
  const checks = deriveRpcBindings(receipt.receipt, snapshot);
  assert.deepEqual(
    checks.map((c) => c.result),
    ["PASS", "PASS", "PASS", "PASS"]
  );

  const report = await runVerification({
    receipt: { receiptId: receipt.receiptId, receipt: receipt.receipt },
    intent,
    policy,
    trace,
    rpcChecks: checks,
  });
  assert.equal(report.verdict.verdict, "VERIFIED");
  assert.equal(report.exitCode, 0);
});

test("verify-run: absent RPC data is NOT_RUN and never blocks VERIFIED", async () => {
  const { receipt } = await buildValidReceipt("L2");
  const checks = deriveRpcBindings(receipt.receipt, {});
  assert.ok(checks.every((c) => c.result === "NOT_RUN"));

  const report = await runVerification({
    receipt: { receiptId: receipt.receiptId, receipt: receipt.receipt },
    intent,
    policy,
    trace,
    rpcChecks: checks,
  });
  assert.equal(report.verdict.verdict, "VERIFIED");
});

test("verify-run: RPC contradiction (wrong chainId) -> INVALID, exit 2", async () => {
  const { receipt } = await buildValidReceipt("L2");
  const snapshot = { chainId: "0x1", tx: undefined, receiptLog: undefined, block: undefined };
  const checks = deriveRpcBindings(receipt.receipt, snapshot);
  assert.equal(checks[0].result, "FAIL");

  const report = await runVerification({
    receipt: { receiptId: receipt.receiptId, receipt: receipt.receipt },
    intent,
    policy,
    trace,
    rpcChecks: checks,
  });
  assert.equal(report.verdict.verdict, "INVALID");
  assert.equal(report.verdict.code, "CONTRADICTION");
  assert.equal(report.exitCode, 2);
});

test("verify-run: receipt document normalization accepts both shapes", async () => {
  const { receipt } = await buildValidReceipt("L2");
  const wrapped = { receiptId: receipt.receiptId, receipt: receipt.receipt };
  const flat = { ...receipt.receipt, receiptId: receipt.receiptId };

  const a = normalizeReceiptDocument(wrapped);
  const b = normalizeReceiptDocument(flat);
  assert.equal(a.receiptId, receipt.receiptId);
  assert.equal(b.receiptId, receipt.receiptId);
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
});

test("verify-run: derived hashes are independently recomputed", async () => {
  const { receipt, evidence } = await buildValidReceipt("L2");
  const report = await runVerification({
    receipt: { receiptId: receipt.receiptId, receipt: receipt.receipt },
    evidence: evidence.evidence,
    intent,
    policy,
    trace,
  });
  assert.equal(report.derived.receiptId, receipt.receiptId);
  assert.equal(report.derived.intentHash, receipt.receipt.intentHash);
  assert.equal(report.derived.policyHash, receipt.receipt.policyHash);
  assert.equal(report.derived.traceHash, receipt.receipt.executionTraceHash);
  assert.equal(report.derived.evidenceHash, receipt.receipt.evidenceRoot);
});

test("verify-run: exit code map is closed", () => {
  assert.equal(exitCodeForVerdict("VERIFIED"), 0);
  assert.equal(exitCodeForVerdict("INVALID"), 2);
  assert.equal(exitCodeForVerdict("UNVERIFIED"), 3);
  assert.equal(exitCodeForVerdict("INCONCLUSIVE"), 4);
  assert.equal(exitCodeForVerdict("NOPE"), 1);
});

test("verify-run: missing receipt throws (input error surface)", async () => {
  await assert.rejects(runVerification({}), /receipt is required/);
});