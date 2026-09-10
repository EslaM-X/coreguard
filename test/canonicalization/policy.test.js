/**
 * CoreGuard Policy Engine Tests
 *
 * Verify deterministic rule evaluation.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createPolicy,
  evaluatePolicy,
  RuleResult,
} from "../../packages/policy/index.js";

function policyWithRules(rules) {
  return createPolicy({ policyId: "0xabc", name: "test", rules });
}

function context({ value = "100", target = "0xabc", recipient = "0xdef", selector = "0xa9059cbb", blockTimestamp = "1000", slippageBps = "0" } = {}) {
  return { value, target, recipient, selector, blockTimestamp, slippageBps };
}

test("VALUE_LIMIT: within bounds passes", () => {
  const policy = policyWithRules([
    { ruleId: "V1", type: "VALUE_LIMIT", params: { max: "100" }, severity: "CRITICAL" },
  ]);
  const result = evaluatePolicy(policy, context({ value: "50" }));
  assert.equal(result.result, "SATISFIED");
  assert.equal(result.rules[0].result, RuleResult.PASS);
});

test("VALUE_LIMIT: exceeding max fails", () => {
  const policy = policyWithRules([
    { ruleId: "V1", type: "VALUE_LIMIT", params: { max: "100" }, severity: "CRITICAL" },
  ]);
  const result = evaluatePolicy(policy, context({ value: "150" }));
  assert.equal(result.result, "VIOLATED");
  assert.equal(result.rules[0].result, RuleResult.FAIL);
  assert.equal(result.rules[0].observed, "150");
  assert.equal(result.rules[0].expected, "<= 100");
});

test("TARGET_ALLOWLIST: allowed target passes", () => {
  const policy = policyWithRules([
    { ruleId: "T1", type: "TARGET_ALLOWLIST", params: { targets: ["0xabc"] }, severity: "CRITICAL" },
  ]);
  assert.equal(evaluatePolicy(policy, context({ target: "0xabc" })).result, "SATISFIED");
});

test("TARGET_ALLOWLIST: disallowed target fails", () => {
  const policy = policyWithRules([
    { ruleId: "T1", type: "TARGET_ALLOWLIST", params: { targets: ["0xabc"] }, severity: "CRITICAL" },
  ]);
  const result = evaluatePolicy(policy, context({ target: "0x111" }));
  assert.equal(result.result, "VIOLATED");
  assert.equal(result.rules[0].observed, "0x111");
});

test("RECIPIENT_ALLOWLIST: allowed recipient passes", () => {
  const policy = policyWithRules([
    { ruleId: "R1", type: "RECIPIENT_ALLOWLIST", params: { addresses: ["0xdef"] }, severity: "CRITICAL" },
  ]);
  assert.equal(evaluatePolicy(policy, context({ recipient: "0xdef" })).result, "SATISFIED");
});

test("RECIPIENT_ALLOWLIST: disallowed recipient fails", () => {
  const policy = policyWithRules([
    { ruleId: "R1", type: "RECIPIENT_ALLOWLIST", params: { addresses: ["0xdef"] }, severity: "CRITICAL" },
  ]);
  const result = evaluatePolicy(policy, context({ recipient: "0x999" }));
  assert.equal(result.result, "VIOLATED");
  assert.equal(result.rules[0].observed, "0x999");
});

test("SELECTOR_ALLOWLIST: allowed selector passes", () => {
  const policy = policyWithRules([
    { ruleId: "S1", type: "SELECTOR_ALLOWLIST", params: { selectors: ["0xa9059cbb"] }, severity: "CRITICAL" },
  ]);
  assert.equal(evaluatePolicy(policy, context({ selector: "0xa9059cbb" })).result, "SATISFIED");
});

test("SELECTOR_ALLOWLIST: disallowed selector fails", () => {
  const policy = policyWithRules([
    { ruleId: "S1", type: "SELECTOR_ALLOWLIST", params: { selectors: ["0xa9059cbb"] }, severity: "CRITICAL" },
  ]);
  const result = evaluatePolicy(policy, context({ selector: "0x23b872dd" }));
  assert.equal(result.result, "VIOLATED");
});

test("DEADLINE: before deadline passes", () => {
  const policy = policyWithRules([
    { ruleId: "D1", type: "DEADLINE", params: { deadline: "5000" }, severity: "CRITICAL" },
  ]);
  assert.equal(evaluatePolicy(policy, context({ blockTimestamp: "1000" })).result, "SATISFIED");
});

test("DEADLINE: after deadline fails", () => {
  const policy = policyWithRules([
    { ruleId: "D1", type: "DEADLINE", params: { deadline: "5000" }, severity: "CRITICAL" },
  ]);
  const result = evaluatePolicy(policy, context({ blockTimestamp: "6000" }));
  assert.equal(result.result, "VIOLATED");
  assert.equal(result.rules[0].observed, "6000");
  assert.equal(result.rules[0].expected, "<= 5000");
});

test("SLIPPAGE_BPS: within bound passes", () => {
  const policy = policyWithRules([
    { ruleId: "SL1", type: "SLIPPAGE_BPS", params: { bps: "50" }, severity: "HIGH" },
  ]);
  assert.equal(evaluatePolicy(policy, context({ slippageBps: "30" })).result, "SATISFIED");
});

test("SLIPPAGE_BPS: exceeding bound fails", () => {
  const policy = policyWithRules([
    { ruleId: "SL1", type: "SLIPPAGE_BPS", params: { bps: "50" }, severity: "HIGH" },
  ]);
  const result = evaluatePolicy(policy, context({ slippageBps: "80" }));
  assert.equal(result.result, "VIOLATED");
});

test("multiple rules: all must pass", () => {
  const policy = policyWithRules([
    { ruleId: "V1", type: "VALUE_LIMIT", params: { max: "100" }, severity: "CRITICAL" },
    { ruleId: "T1", type: "TARGET_ALLOWLIST", params: { targets: ["0xabc"] }, severity: "CRITICAL" },
  ]);
  const result = evaluatePolicy(policy, context({ value: "150", target: "0xabc" }));
  assert.equal(result.result, "VIOLATED");
  // The rule that failed should be recorded
  assert.equal(result.rules[0].result, RuleResult.FAIL);
});

test("unknown rule type fails", () => {
  const policy = policyWithRules([
    { ruleId: "X1", type: "UNKNOWN_TYPE", params: {}, severity: "CRITICAL" },
  ]);
  const result = evaluatePolicy(policy, context());
  assert.equal(result.result, "VIOLATED");
});