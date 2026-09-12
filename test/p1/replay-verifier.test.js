/**
 * P1-6 integration: REPLAY_CONSISTENCY inside the independent verifier.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { hashIntent, hashPolicy, hashTrace } from "../../packages/canonical/index.js";
import { createReceipt } from "../../packages/evidence/index.js";
import { verifyReceipt, CheckResult } from "../../packages/verifier/index.js";

const POLICY = { version: "CGEP/1", policyId: "0xreplaypol", name: "optimistic", rules: [] };
const INTENT = {
  version: "CGEP/1",
  chainId: "1116",
  nonce: "9",
  target: "0x" + "11".repeat(20),
  calldata: "0x23b872dd",
  signer: "0x" + "22".repeat(20),
};

function makeTrace(overrides = {}) {
  return {
    from: "0x" + "22".repeat(20),
    to: "0x" + "11".repeat(20),
    calldata: "0x23b872dd" + "00".repeat(100),
    gasUsed: "90000",
    gasLimit: "300000",
    blockNumber: "123456",
    blockHash: "0x" + "b".repeat(64),
    blockTimestamp: "1750030000",
    calls: [],
    ...overrides,
  };
}

async function buildReceipt(intent, trace) {
  const created = await createReceipt({
    chainId: 1116,
    txHash: "0x" + "0".repeat(62) + "aa",
    blockHash: trace.blockHash,
    blockNumber: trace.blockNumber,
    intentHash: await hashIntent(intent),
    policyHash: await hashPolicy(POLICY),
    executionTraceHash: await hashTrace(trace),
    stateDeltaHash: "0x" + "11".repeat(32),
    evidenceRoot: "0x" + "22".repeat(32),
    simulation: { blockNumber: 123450, blockHash: "0x" + "cc".repeat(32) },
    execution: { blockNumber: 123456, blockHash: "0x" + "bb".repeat(32) },
    verifierVersion: "0.1.0",
    verificationLevel: "L2",
    result: "VALID",
    checks: [],
  });
  return { ...created.receipt, receiptId: created.receiptId };
}

test("verifier: coherent trace -> REPLAY_CONSISTENCY PASS and L2 VERIFIES", async () => {
  const trace = makeTrace();
  const receipt = await buildReceipt(INTENT, trace);
  const r = await verifyReceipt(receipt, null, INTENT, POLICY, trace);
  const rep = r.checks.find((c) => c.check === "REPLAY_CONSISTENCY");
  assert.ok(rep, "REPLAY_CONSISTENCY check must be emitted for any trace");
  assert.equal(rep.result, CheckResult.PASS);
  assert.equal(r.result, "VERIFIED");
  assert.match(r.replay.digest, /^0x[0-9a-f]{64}$/);
});

test("verifier: self-contradictory trace (depth jump) -> FAIL -> INVALID", async () => {
  const trace = makeTrace();
  trace.calls = [
    { depth: 0, from: trace.from, to: trace.to, calldata: trace.calldata, value: "0", gasUsed: "90000", status: "SUCCESS" },
    { depth: 5, from: trace.to, to: trace.to, value: "0", gasUsed: "5000", status: "SUCCESS" },
  ];
  const receipt = await buildReceipt(INTENT, trace);
  const r = await verifyReceipt(receipt, null, INTENT, POLICY, trace);
  const rep = r.checks.find((c) => c.check === "REPLAY_CONSISTENCY");
  assert.equal(rep.result, CheckResult.FAIL);
  assert.match(rep.detail, /depth jump/);
  assert.equal(r.result, "INVALID");
});

test("verifier: replay digest is stable across verifications of identical evidence", async () => {
  const trace = makeTrace();
  const receipt = await buildReceipt(INTENT, trace);
  const r1 = await verifyReceipt(receipt, null, INTENT, POLICY, trace);
  const r2 = await verifyReceipt(receipt, null, INTENT, POLICY, trace);
  assert.equal(r1.replay.digest, r2.replay.digest);
});