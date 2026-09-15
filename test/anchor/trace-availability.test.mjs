/**
 * Verification-level truth + Trace Availability Proof (Phase 0 P0.3).
 *
 * Pins:
 *   - L0/L1/L2 are REQUIRED evidence sets (self-declaration must be explicit).
 *   - L1 is NOT a trace proof (reason text says so).
 *   - L2 with no canonical trace => UNVERIFIED (never VERIFIED), with an
 *     explicit TRACE_UNAVAILABLE reason when one is declared.
 *   - TRACE_AVAILABLE block must be well-formed or the claim FAILs closed.
 *   - traceAvailability / levelReason are ADDITIVE receipt fields.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { hashIntent, hashPolicy, hashTrace } from "../../packages/canonical/index.js";
import { createPolicy } from "../../packages/policy/index.js";
import { normalizeExecution } from "../../packages/trace/index.js";
import {
  createReceipt,
  buildTraceAvailability,
  traceUnavailable,
} from "../../packages/evidence/index.js";
import {
  verifyReceipt,
  levelTruth,
  REQUIRED_BY_LEVEL,
  OPTIONAL_CHECKS_V,
} from "../../packages/verifier/index.js";

const ADDR = {
  alice: "0x1111111111111111111111111111111111111111",
  bob: "0x2222222222222222222222222222222222222222",
  token: "0x3333333333333333333333333333333333333333",
};

const intent = {
  version: "CGEP/1",
  chainId: "1116",
  signer: ADDR.alice,
  nonce: "1",
  validAfter: "0",
  validUntil: "9999999999",
  action: "TRANSFER",
  target: ADDR.token,
  selector: "0xa9059cbb",
  asset: ADDR.token,
  amount: "1000",
  recipient: ADDR.bob,
  constraints: [],
};

const policy = createPolicy({
  policyId: "p",
  name: "trace-availability policy",
  rules: [
    { ruleId: "v", type: "VALUE_LIMIT", severity: "CRITICAL", params: { max: "1000" } },
    { ruleId: "t", type: "TARGET_ALLOWLIST", severity: "CRITICAL", params: { targets: [ADDR.token] } },
    { ruleId: "r", type: "RECIPIENT_ALLOWLIST", severity: "CRITICAL", params: { addresses: [ADDR.bob] } },
  ],
});

const trace = normalizeExecution(
  {
    hash: "0x00000000000000000000000000000000000000000000000000000000000000aa",
    from: ADDR.alice,
    to: ADDR.token,
    value: "0x3e8",
    input: "0x",
    nonce: "0x1",
    gas: "0x5208",
  },
  {
    status: "0x1",
    gasUsed: "0x5208",
    blockNumber: "0x7b",
    blockHash: "0x00000000000000000000000000000000000000000000000000000000000000bb",
    timestamp: "0x3e8",
    logs: [],
  },
  [{ from: ADDR.alice, to: ADDR.token, gasUsed: "0x5208", input: "0x", output: "0x" }],
  {},
  {}
);

const AVAILABLE = buildTraceAvailability({
  provider: "core_testnet2_archive (eth_getTransactionReceipt + debug_traceTransaction)",
  depth: 3,
  frames: 4,
  coverage: ["from", "to", "value", "gasUsed", "calldata"],
});

async function makeReceipt({ level = "L2", traceAvailability, levelReason, provideTrace = true } = {}) {
  const intentHash = await hashIntent(intent);
  const policyHash = await hashPolicy(policy);
  const executionTraceHash = await hashTrace(trace);
  const { receiptId, receipt } = await createReceipt({
    chainId: "1116",
    txHash: "0x00000000000000000000000000000000000000000000000000000000000000aa",
    blockHash: "0x00000000000000000000000000000000000000000000000000000000000000bb",
    blockNumber: "123",
    intentHash,
    policyHash,
    executionTraceHash,
    stateDeltaHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    evidenceRoot: "0x2222222222222222222222222222222222222222222222222222222222222222",
    simulation: {
      blockNumber: "100",
      blockHash: "0x00000000000000000000000000000000000000000000000000000000000000cc",
    },
    execution: {
      blockNumber: "123",
      blockHash: "0x00000000000000000000000000000000000000000000000000000000000000bb",
    },
    verifierVersion: "0.1.0",
    verificationLevel: level,
    levelReason,
    traceAvailability,
    result: "VALID",
    checks: [],
  });
  return { receipt: { ...receipt, receiptId }, intent, policy, trace: provideTrace ? trace : null };
}

test("levelTruth: L0/L1/L2 are required evidence sets; L1 is not a trace proof", () => {
  const l0 = levelTruth("L0");
  const l1 = levelTruth("L1");
  const l2 = levelTruth("L2", { traceAvailability: AVAILABLE });

  assert.deepEqual(l0.required, REQUIRED_BY_LEVEL.L0);
  assert.deepEqual(l1.required, REQUIRED_BY_LEVEL.L1);
  assert.deepEqual(l2.required, REQUIRED_BY_LEVEL.L2);
  assert.match(l1.levelReason, /not a trace proof/);
  assert.equal(l0.verificationLevel, "L0");
  assert.equal(l2.verificationLevel, "L2");
});

test("levelTruth: L2 without a trace must say TRACE_UNAVAILABLE explicitly", () => {
  const st = levelTruth("L2", { traceAvailability: traceUnavailable("no archive node in scope") });
  assert.match(st.levelReason, /TRACE_UNAVAILABLE/);
  assert.match(st.levelReason, /no archive node in scope/);
  assert.match(st.levelReason, /cannot reach L2/);

  const bare = levelTruth("L2", {});
  assert.match(bare.levelReason, /TRACE_UNAVAILABLE/);
});

test("buildTraceAvailability: canonical Trace Availability block", () => {
  assert.equal(AVAILABLE.status, "TRACE_AVAILABLE");
  assert.equal(AVAILABLE.provider, "core_testnet2_archive (eth_getTransactionReceipt + debug_traceTransaction)");
  assert.equal(AVAILABLE.frames, "4");
  assert.equal(AVAILABLE.depth, "3");
  assert.equal(traceUnavailable("x").status, "TRACE_UNAVAILABLE");
});

test("TRACE_AVAILABILITY is an optional check, never required", () => {
  assert.ok(OPTIONAL_CHECKS_V.includes("TRACE_AVAILABILITY"));
  for (const level of Object.keys(REQUIRED_BY_LEVEL)) {
    assert.ok(!REQUIRED_BY_LEVEL[level].includes("TRACE_AVAILABILITY"));
  }
});

test("control: L2 + trace + available proof => VERIFIED with a PASS availability check", async () => {
  const { receipt } = await makeReceipt({ level: "L2", traceAvailability: AVAILABLE });
  const result = await verifyReceipt(receipt, null, intent, policy, trace);
  assert.equal(result.result, "VERIFIED");
  const ta = result.checks.find((c) => c.check === "TRACE_AVAILABILITY");
  assert.equal(ta.result, "PASS");
});

test("L2 + declarated TRACE_UNAVAILABLE => still UNVERIFIED (trace hash is required, never skipped)", async () => {
  const { receipt } = await makeReceipt({
    level: "L2",
    provideTrace: false,
    traceAvailability: traceUnavailable("no archive node in scope"),
    levelReason: levelTruth("L2", { traceAvailability: traceUnavailable("no archive node in scope") }).levelReason,
  });
  const result = await verifyReceipt(receipt, null, intent, policy, null);
  assert.equal(result.result, "UNVERIFIED");
  assert.equal(result.verdictCode, "MISSING_REQUIRED_EVIDENCE");
  assert.deepEqual(result.requiredMissing, ["TRACE_HASH", "INTENT_EXECUTION_BINDING"]);
  const ta = result.checks.find((c) => c.check === "TRACE_AVAILABILITY");
  assert.equal(ta.result, "PASS");
  assert.match(receipt.levelReason, /TRACE_UNAVAILABLE/);
});

test("L1 with TRACE_UNAVAILABLE declared => VERIFIED (L1 does not need a trace) and reason is honest", async () => {
  const unreachable = traceUnavailable("keeper has no archive endpoint for this tx");
  const truth = levelTruth("L1", { traceAvailability: unreachable });
  const { receipt } = await makeReceipt({ level: "L1", traceAvailability: unreachable, levelReason: truth.levelReason });
  const result = await verifyReceipt(receipt, null, intent, policy, null);
  assert.equal(result.result, "VERIFIED");
  const ta = result.checks.find((c) => c.check === "TRACE_AVAILABILITY");
  assert.equal(ta.result, "PASS");
  assert.equal(receipt.verificationLevel, "L1");
});

test("malformed TRACE_AVAILABLE (no frames/provider) FAILs and never upgrades", async () => {
  const { receipt } = await makeReceipt({
    level: "L2",
    traceAvailability: { status: "TRACE_AVAILABLE", provider: "x", frames: "0" },
  });
  const result = await verifyReceipt(receipt, null, intent, policy, trace);
  assert.equal(result.result, "INVALID");
  assert.equal(result.verdictCode, "CONTRADICTION");
  const ta = result.checks.find((c) => c.check === "TRACE_AVAILABILITY");
  assert.equal(ta.result, "FAIL");

  const { receipt: bad2 } = await makeReceipt({
    level: "L2",
    traceAvailability: { status: "TRACE_AVAILABLE", frames: "4" },
  });
  assert.equal((await verifyReceipt(bad2, null, intent, policy, trace)).result, "INVALID");
});

test("unknown traceAvailability status FAILs (fail closed)", async () => {
  const { receipt } = await makeReceipt({
    level: "L2",
    traceAvailability: { status: "SOMETIMES" },
  });
  const result = await verifyReceipt(receipt, null, intent, policy, trace);
  assert.equal(result.result, "INVALID");
});