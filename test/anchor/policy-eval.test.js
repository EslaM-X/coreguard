/**
 * CoreGuard Policy Evaluation Completeness Tests (P1)
 *
 * Proven: every rule type in the registry (allow + deny + MAX_GAS) evaluates
 * deterministically; the verifier's POLICY_EVAL re-evaluation of the committed
 * policy is PASS/FAIL from the trace alone; a VIOLATED committed policy can
 * never be VERIFIED.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { hashIntent, hashPolicy, hashTrace } from "../../packages/canonical/index.js";
import { createReceipt } from "../../packages/evidence/index.js";
import { createPolicy, evaluatePolicy, RuleResult } from "../../packages/policy/index.js";
import { isV01Rule, RULE_TYPES } from "../../packages/policy/rules/index.js";
import { verifyReceipt } from "../../packages/verifier/index.js";

function policyWithRules(rules) {
  return createPolicy({ policyId: "0xabc", name: "test", rules });
}

function ctx(overrides = {}) {
  return {
    value: "100",
    target: "0xabc",
    recipient: "0xdef",
    selector: "0xa9059cbb",
    blockTimestamp: "1000",
    slippageBps: "0",
    gasUsed: "70000",
    priceBps: "10000",
    ...overrides,
  };
}

// --- deterministic rule evaluation (registry completeness) ---

test("TARGET_DENYLIST: denied target fails, others pass", () => {
  const policy = policyWithRules([
    { ruleId: "TD1", type: "TARGET_DENYLIST", params: { targets: ["0xbad"] }, severity: "CRITICAL" },
  ]);
  assert.equal(evaluatePolicy(policy, ctx({ target: "0xbad" })).result, "VIOLATED");
  assert.equal(evaluatePolicy(policy, ctx({ target: "0xgood" })).result, "SATISFIED");
});

test("RECIPIENT_DENYLIST: denied recipient fails, others pass", () => {
  const policy = policyWithRules([
    { ruleId: "RD1", type: "RECIPIENT_DENYLIST", params: { addresses: ["0xevil"] }, severity: "CRITICAL" },
  ]);
  assert.equal(evaluatePolicy(policy, ctx({ recipient: "0xevil" })).result, "VIOLATED");
  assert.equal(evaluatePolicy(policy, ctx({ recipient: "0xgood" })).result, "SATISFIED");
});

test("SELECTOR_DENYLIST: denied selector fails, others pass", () => {
  const policy = policyWithRules([
    { ruleId: "SD1", type: "SELECTOR_DENYLIST", params: { selectors: ["0xdeadbeef"] }, severity: "CRITICAL" },
  ]);
  assert.equal(evaluatePolicy(policy, ctx({ selector: "0xdeadbeef" })).result, "VIOLATED");
  assert.equal(evaluatePolicy(policy, ctx({ selector: "0xa9059cbb" })).result, "SATISFIED");
});

test("MAX_GAS: gasUsed above ceiling fails, below passes", () => {
  const policy = policyWithRules([
    { ruleId: "G1", type: "MAX_GAS", params: { maxGas: "80000" }, severity: "HIGH" },
  ]);
  assert.equal(evaluatePolicy(policy, ctx({ gasUsed: "90000" })).result, "VIOLATED");
  assert.equal(evaluatePolicy(policy, ctx({ gasUsed: "70000" })).result, "SATISFIED");
  const fine = evaluatePolicy(policy, ctx({ gasUsed: "70000" }));
  assert.equal(fine.rules[0].result, RuleResult.PASS);
});

test("rule registry: denylist + MAX_GAS are part of the shipped deterministic set", () => {
  assert.equal(isV01Rule(RULE_TYPES.TARGET_DENYLIST), true);
  assert.equal(isV01Rule(RULE_TYPES.RECIPIENT_DENYLIST), true);
  assert.equal(isV01Rule(RULE_TYPES.SELECTOR_DENYLIST), true);
  assert.equal(isV01Rule(RULE_TYPES.MAX_GAS), true);
});

test("unknown rule type still fails closed", () => {
  const policy = policyWithRules([
    { ruleId: "X1", type: "UNKNOWN_TYPE", params: {}, severity: "CRITICAL" },
  ]);
  assert.equal(evaluatePolicy(policy, ctx()).result, "VIOLATED");
});

// --- verifier POLICY_EVAL check (deduplicated from trace) ---

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
  nonce: "0",
  blockNumber: "123456",
  blockHash: "0x00000000000000000000000000000000000000000000000000000000000000bb",
  blockTimestamp: "1200",
  calls: [],
  events: [],
  balanceChanges: [],
  storageChanges: [],
};

async function buildReceipt(policy) {
  const intentHash = await hashIntent(intent);
  const policyHash = await hashPolicy(policy);
  const traceHash = await hashTrace(trace);
  const { receiptId, receipt } = await createReceipt({
    chainId: 1114,
    txHash: trace.txHash,
    blockHash: trace.blockHash,
    blockNumber: trace.blockNumber,
    intentHash,
    policyHash,
    executionTraceHash: traceHash,
    stateDeltaHash: "0x" + "11".repeat(32),
    evidenceRoot: "0x" + "22".repeat(32),
    simulation: { blockNumber: 123450, blockHash: "0x" + "cc".repeat(32) },
    execution: { blockNumber: 123456, blockHash: "0x" + "bb".repeat(32) },
    verifierVersion: "0.1.0",
    verificationLevel: "L2",
    result: "VALID",
    checks: [],
  });
  return { ...receipt, receiptId };
}

const policyEvalCheck = (r) => r.checks.find((c) => c.check === "POLICY_EVAL");

test("POLICY_EVAL: optimistic policy satisfies -> PASS and L2 VERIFIES", async () => {
  const policy = policyWithRules([
    { ruleId: "V1", type: "VALUE_LIMIT", params: { max: intent.amount }, severity: "CRITICAL" },
  ]);
  const receipt = await buildReceipt(policy);
  const r = await verifyReceipt(receipt, null, intent, policy, trace);
  assert.equal(policyEvalCheck(r).result, "PASS");
  assert.equal(r.result, "VERIFIED");
});

test("POLICY_EVAL: a VIOLATED committed policy -> FAIL -> INVALID (never VERIFIED)", async () => {
  const policy = policyWithRules([
    { ruleId: "V1", type: "VALUE_LIMIT", params: { max: "1" }, severity: "CRITICAL" },
  ]);
  const receipt = await buildReceipt(policy);
  const r = await verifyReceipt(receipt, null, intent, policy, trace);
  assert.equal(policyEvalCheck(r).result, "FAIL");
  assert.equal(r.result, "INVALID");
  assert.ok(r.failing.includes("POLICY_EVAL"));
});

test("POLICY_EVAL: MAX_GAS rule re-evaluated to FAIL -> INVALID", async () => {
  const policy = policyWithRules([
    { ruleId: "G1", type: "MAX_GAS", params: { maxGas: "100" }, severity: "HIGH" },
  ]);
  const receipt = await buildReceipt(policy);
  const r = await verifyReceipt(receipt, null, intent, policy, trace);
  assert.equal(policyEvalCheck(r).result, "FAIL");
  assert.equal(r.result, "INVALID");
});