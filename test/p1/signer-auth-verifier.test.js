/**
 * P1-1 integration: SIGNER_AUTHENTICATION inside the independent verifier.
 *
 * Optional-but-fail-closed: presence of a signature is never ignored; a forged
 * or self-inconsistent signature -> FAIL -> INVALID (contradiction dominates).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { hashIntent, hashPolicy, hashTrace } from "../../packages/canonical/index.js";
import { createReceipt } from "../../packages/evidence/index.js";
import { verifyReceipt, CheckResult } from "../../packages/verifier/index.js";
import { signIntent, generateSignerKeyPair } from "../../packages/crypto/index.js";

const POLICY = {
  version: "CGEP/1",
  policyId: "0xpolicyp1",
  name: "optimistic",
  rules: [],
};

const INTENT = {
  version: "CGEP/1",
  chainId: "1116",
  nonce: "7",
  target: "0x" + "11".repeat(20),
  recipient: "0x" + "22".repeat(20),
  calldata: "0x23b872dd" + "00".repeat(100),
  amount: "1000000",
  deadline: "2999999999",
  selector: "0x23b872dd",
  signer: "0x" + "33".repeat(20),
};

function makeTrace(overrides = {}) {
  return {
    txHash: "0x" + "0".repeat(62) + "aa",
    blockHash: "0x" + "b".repeat(64),
    blockNumber: "123456",
    blockTimestamp: "1750030000",
    from: "0x" + "33".repeat(20),
    to: "0x" + "11".repeat(20),
    calldata: "0x23b872dd" + "00".repeat(100),
    value: "1000000",
    gasUsed: "90000",
    gasLimit: "300000",
    nonce: "7",
    status: "1",
    logs: [],
    calls: [],
    stateDelta: {},
    ...overrides,
  };
}

async function buildReceipt(intent, trace) {
  const created = await createReceipt({
    chainId: 1116,
    txHash: trace.txHash,
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

test("verifier: signed intent -> SIGNER_AUTHENTICATION PASS and L2 VERIFIES", async () => {
  const pair = await generateSignerKeyPair();
  const signed = await signIntent(INTENT, pair.privateKeyJwk);
  const trace = makeTrace({ from: signed.signer });
  const receipt = await buildReceipt(signed, trace);
  const r = await verifyReceipt(receipt, null, signed, POLICY, trace);
  const auth = r.checks.find((c) => c.check === "SIGNER_AUTHENTICATION");
  assert.ok(auth, "SIGNER_AUTHENTICATION check must be emitted");
  assert.equal(auth.result, CheckResult.PASS);
  assert.equal(r.result, "VERIFIED");
});

test("verifier: forged signature -> FAIL -> INVALID (never VERIFIED)", async () => {
  const pair = await generateSignerKeyPair();
  const signed = await signIntent(INTENT, pair.privateKeyJwk);
  const trace = makeTrace({ from: signed.signer });
  const receipt = await buildReceipt(signed, trace);
  // Deterministic forgery: flip a byte in the middle of s (bitwise XOR), which
  // always changes the signature regardless of the random value produced. The
  // old "last hex nibble -> 0" trick was flaky: ~1/16 of keys end s in "0", in
  // which case the "forged" value equals the real signature and the test PASSED.
  const sBytes = Buffer.from(signed.signature.s, "hex");
  sBytes[Math.floor(sBytes.length / 2)] ^= 0x01;
  const forged = {
    ...signed,
    signature: { ...signed.signature, s: sBytes.toString("hex") },
  };
  const r = await verifyReceipt(receipt, null, forged, POLICY, trace);
  const auth = r.checks.find((c) => c.check === "SIGNER_AUTHENTICATION");
  assert.equal(auth.result, CheckResult.FAIL);
  assert.equal(r.result, "INVALID");
});

test("verifier: signer field edited after signing -> FAIL (identity substitution)", async () => {
  const pair = await generateSignerKeyPair();
  const signed = await signIntent(INTENT, pair.privateKeyJwk);
  const trace = makeTrace({ from: signed.signer });
  const receipt = await buildReceipt(signed, trace);
  const substituted = { ...signed, signer: "0x" + "00".repeat(20) };
  const r = await verifyReceipt(receipt, null, substituted, POLICY, trace);
  const auth = r.checks.find((c) => c.check === "SIGNER_AUTHENTICATION");
  assert.equal(auth.result, CheckResult.FAIL);
  assert.equal(r.result, "INVALID");
});

test("verifier: unsigned intent carries no SIGNER_AUTHENTICATION check (not penalized)", async () => {
  const trace = makeTrace();
  const receipt = await buildReceipt(INTENT, trace);
  const r = await verifyReceipt(receipt, null, INTENT, POLICY, trace);
  assert.ok(
    !r.checks.some((c) => c.check === "SIGNER_AUTHENTICATION"),
    "no signature -> check omitted"
  );
  assert.equal(r.result, "VERIFIED");
});