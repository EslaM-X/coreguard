/**
 * Canonicalization security audit (Phase 0 P0.2).
 *
 * Rule: security-critical integers (amount, gas, timestamp, block, nonce,
 * chainId) MUST travel as canonical decimal strings or bigint in the public
 * builder APIs. JS Numbers are rejected outright because a Number literal like
 * `9007199254740993` has already been silently rounded by the runtime before
 * any function sees it (2^53 wall) — accepting Numbers makes silent precision
 * loss possible. Also pins the fix for the VALUE_LIMIT `max: "0"` falsy
 * bypass (a zero upper bound must cap, not be treated as "no bound").
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  securityUint,
  UINT256_MAX,
  UINT256_MAX_BI,
} from "../../packages/canonical/index.js";
import { createIntent } from "../../packages/intent/index.js";
import { createPolicy, evaluatePolicy, RuleResult } from "../../packages/policy/index.js";
import { normalizeExecution } from "../../packages/trace/index.js";

test("securityUint: JS Number rejected outright (safe and unsafe)", () => {
  assert.throws(() => securityUint("amount", 100), /JS Number is forbidden/);
  assert.throws(() => securityUint("amount", 9007199254740992), /JS Number is forbidden/);
  assert.throws(() => securityUint("chainId", 1114), /JS Number is forbidden/);
  assert.throws(() => securityUint("nonce", 0), /JS Number is forbidden/);
  assert.throws(() => securityUint("amount", NaN), /JS Number is forbidden/);
  assert.throws(() => securityUint("amount", -5), /JS Number is forbidden/);
  assert.throws(() => securityUint("amount", 1.5), /JS Number is forbidden/);
  assert.throws(() => securityUint("amount", Infinity), /JS Number is forbidden/);
});

test("securityUint: decimal strings and bigints accepted + normalized", () => {
  assert.equal(securityUint("amount", "100"), "100");
  assert.equal(securityUint("amount", 100n), "100");
  assert.equal(securityUint("amount", "0"), "0");
  assert.equal(securityUint("amount", 0n), "0");
  assert.equal(securityUint("amount", UINT256_MAX), UINT256_MAX);
  assert.equal(securityUint("amount", UINT256_MAX_BI), UINT256_MAX);
  assert.equal(securityUint("amount", "9007199254740993"), "9007199254740993");
  assert.equal(securityUint("amount", 9007199254740993n), "9007199254740993");
});

test("securityUint: RPC hex is validated, spelling preserved, value BigInt-exact", () => {
  assert.equal(securityUint("gas", "0x10"), "0x10");
  assert.equal(BigInt(securityUint("gas", "0x10")), 16n);
  assert.equal(securityUint("gas", "0Xff"), "0Xff");
  assert.equal(BigInt(securityUint("gas", "0Xff")), 255n);
  assert.equal(BigInt(securityUint("blockNumber", "0x1e240")), 123456n);
});

test("securityUint: malformed / out-of-range inputs fail closed", () => {
  assert.throws(() => securityUint("amount", ""), /uint/);
  assert.throws(() => securityUint("amount", "0x"), /uint/);
  assert.throws(() => securityUint("amount", "1e3"), /uint/);
  assert.throws(() => securityUint("amount", "1.5"), /uint/);
  assert.throws(() => securityUint("amount", "-1"), /uint/);
  assert.throws(() => securityUint("amount", "  16"), /uint/);
  assert.throws(() => securityUint("amount", "007"), /non-canonical decimal/);
  assert.throws(() => securityUint("amount", "0x" + "f".repeat(65)), /uint256 range|exceeds/);
  assert.throws(() => securityUint("amount", null), /unsupported type/);
});

test("createIntent: JS Number amount / chainId / nonce rejected", () => {
  const base = {
    chainId: "1116",
    signer: "0x1111111111111111111111111111111111111111",
    nonce: "1",
    validAfter: "0",
    validUntil: "9999999999",
    action: "TRANSFER",
    target: "0x2222222222222222222222222222222222222222",
    selector: "0xa9059cbb",
    asset: "0x3333333333333333333333333333333333333333",
    amount: "1000000000000000000",
    recipient: "0x4444444444444444444444444444444444444444",
  };
  assert.throws(() => createIntent({ ...base, amount: 1e18 }), /JS Number is forbidden/);
  assert.throws(() => createIntent({ ...base, chainId: 1116 }), /JS Number is forbidden/);
  assert.throws(() => createIntent({ ...base, nonce: 1 }), /JS Number is forbidden/);
  assert.throws(() => createIntent({ ...base, validAfter: 0 }), /JS Number is forbidden/);
  assert.throws(() => createIntent({ ...base, validUntil: 9999999999 }), /JS Number is forbidden/);
});

test("createIntent: large amount survives EXACTLY (no 2^53 rounding)", () => {
  const intent = createIntent({
    chainId: "1116",
    signer: "0x1111111111111111111111111111111111111111",
    nonce: "1",
    validAfter: "0",
    validUntil: "9999999999",
    action: "TRANSFER",
    target: "0x2222222222222222222222222222222222222222",
    selector: "0xa9059cbb",
    asset: "0x3333333333333333333333333333333333333333",
    amount: "9007199254740993",
    recipient: "0x4444444444444444444444444444444444444444",
  });
  assert.equal(intent.amount, "9007199254740993");
});

test("createIntent: hex spelling is preserved (declaration binding stays distinct)", () => {
  const hex = createIntent({
    chainId: "1116",
    signer: "0x1111111111111111111111111111111111111111",
    nonce: "1",
    validAfter: "0",
    validUntil: "9999999999",
    action: "TRANSFER",
    target: "0x2222222222222222222222222222222222222222",
    selector: "0xa9059cbb",
    asset: "0x3333333333333333333333333333333333333333",
    amount: "0x100",
    recipient: "0x4444444444444444444444444444444444444444",
  });
  assert.equal(hex.amount, "0x100");
  assert.notEqual(hex.amount, "256");
});

test("VALUE_LIMIT: JS Number params rejected", () => {
  const policy = createPolicy({
    policyId: "p",
    name: "numeric guard",
    rules: [{ ruleId: "v1", type: "VALUE_LIMIT", severity: "CRITICAL", params: { max: 1e18 } }],
  });
  assert.throws(
    () => evaluatePolicy(policy, { value: "100" }),
    /JS Number is forbidden/
  );
});

test("VALUE_LIMIT: max '0' is an upper bound of zero (falsy bypass fixed)", () => {
  const policy = createPolicy({
    policyId: "p",
    name: "zero bound",
    rules: [{ ruleId: "v1", type: "VALUE_LIMIT", severity: "CRITICAL", params: { max: "0" } }],
  });
  const over = evaluatePolicy(policy, { value: "1" });
  assert.equal(over.rules[0].result, RuleResult.FAIL);
  const exactly = evaluatePolicy(policy, { value: "0" });
  assert.equal(exactly.rules[0].result, RuleResult.PASS);
});

test("VALUE_LIMIT: min/max as bigint and hex params work via securityUint", () => {
  const policy = createPolicy({
    policyId: "p",
    name: "bound",
    rules: [{ ruleId: "v1", type: "VALUE_LIMIT", severity: "CRITICAL", params: { min: "0x10", max: 500n } }],
  });
  assert.equal(evaluatePolicy(policy, { value: "255" }).rules[0].result, RuleResult.PASS);
  assert.equal(evaluatePolicy(policy, { value: "501" }).rules[0].result, RuleResult.FAIL);
});

test("trace normalizeExecution: unsafe JS Number value fails closed (2^53 wall)", () => {
  assert.throws(
    () =>
      normalizeExecution(
        { hash: "0xaa", from: "0x1111111111111111111111111111111111111111", to: "0x2222222222222222222222222222222222222222", value: 1e21, input: "0x", nonce: "0x1" },
        { status: "0x1", gasUsed: "0x5208", blockNumber: "0x1", blockHash: "0xbb", timestamp: "0x1", logs: [] },
        [{ from: "0x1111111111111111111111111111111111111111", to: "0x2222222222222222222222222222222222222222", gasUsed: "0x0", input: "0x" }],
        {},
        {}
      ),
    /unsafe JS Number/
  );
  // Equivalent hex string is normalized to canonical decimal, no throw.
  const trace = normalizeExecution(
    { hash: "0xaa", from: "0x1111111111111111111111111111111111111111", to: "0x2222222222222222222222222222222222222222", value: "0xde0b6b3a7640000", input: "0x", nonce: "0x1" },
    { status: "0x1", gasUsed: "0x5208", blockNumber: "0x1", blockHash: "0xbb", timestamp: "0x1", logs: [] },
    [{ from: "0x1111111111111111111111111111111111111111", to: "0x2222222222222222222222222222222222222222", gasUsed: "0x0", input: "0x" }],
    {},
    {}
  );
  assert.equal(trace.value, "1000000000000000000");
});