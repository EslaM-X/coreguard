/**
 * Phase D — Policy gating (Q-FW3/3a/3b): recomputed policyHash, activation
 * commitment (anti-rollback), optional trust anchors, REVIEW-rule filtering,
 * context strictly derived from the bound intent + sim.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluatePolicyForDecision } from "../../packages/firewall/policy.js";
import { hashPolicy } from "../../packages/canonical/index.js";
import { seedKey, makeIntent, makeDeclaration, makePolicy, makeSimulation } from "./helpers.js";
import { evaluateDeclarationBinding } from "../../packages/firewall/binding.js";
import * as EVM from "../../packages/evm/index.js";

async function ctx(overrides = {}) {
  const intent = makeIntent({});
  const declaration = await makeDeclaration({ intent });
  const binding = await evaluateDeclarationBinding({ intent, declaration, evm: EVM });
  const simulation = makeSimulation({}, intent);
  return {
    intent,
    binding,
    simulation,
    trustedPolicySource: undefined,
    activePolicyIds: ["pol-default"],
    expectedPolicyHash: undefined,
    policyTrust: undefined,
    blockTimestamp: "1",
    ...overrides,
  };
}

test("policy: satisfied empty policy with recomputed matching hash", async () => {
  const policy = makePolicy([]);
  const c = await ctx({ policy, expectedPolicyHash: await hashPolicy(policy) });
  const out = await evaluatePolicyForDecision({ policy, ...c });
  assert.equal(out.status, "SATISFIED");
  assert.equal(out.label, "POLICY_SATISFIED");
  assert.equal(out.reviewObligation, false);
});

test("policy: violation surfaces the offending rule id (fail-closed details)", async () => {
  const policy = makePolicy([{ ruleId: "r1", type: "VALUE_LIMIT", severity: "HIGH", params: { max: "500" } }]);
  const c = await ctx({ policy, expectedPolicyHash: await hashPolicy(policy) });
  const out = await evaluatePolicyForDecision({ policy, ...c });
  assert.equal(out.label, "POLICY_VIOLATED");
  assert.ok(out.rules.some((r) => r.ruleId === "r1" && r.result !== "PASS"));
});

test("policy: expectedPolicyHash mismatch ⇒ POLICY_HASH_MISMATCH (anti-rollback)", async () => {
  const policy = makePolicy([]);
  const c = await ctx({ policy, expectedPolicyHash: "0x" + "00".repeat(32) });
  const out = await evaluatePolicyForDecision({ policy, ...c });
  assert.equal(out.label, "POLICY_HASH_MISMATCH");
  assert.equal(out.status, "FAIL");
});

test("policy: policy not in activePolicyIds ⇒ POLICY_NOT_ACTIVE", async () => {
  const policy = makePolicy([], "pol-old");
  const c = await ctx({ policy, activePolicyIds: ["pol-default"] });
  const out = await evaluatePolicyForDecision({ policy, ...c });
  assert.equal(out.label, "POLICY_NOT_ACTIVE");
  assert.equal(out.status, "FAIL");
});

test("policy: missing/empty activePolicyIds ⇒ NOT_RUN (closed critical set)", async () => {
  const policy = makePolicy([]);
  const c = await ctx({ policy, activePolicyIds: [] });
  const out = await evaluatePolicyForDecision({ policy, ...c });
  assert.equal(out.label, "ACTIVATION_UNKNOWN");
  assert.equal(out.status, "NOT_RUN");
  const none = await ctx({ policy, activePolicyIds: undefined });
  assert.equal((await evaluatePolicyForDecision({ policy, ...none })).status, "NOT_RUN");
});

test("policy: optional trust anchors — accepted owner passes, stranger fails", async () => {
  const owner = seedKey(1).address;
  const policy = makePolicy([], "pol-anchored");
  const anchored = { ...policy, policyId: "pol-anchored", owner };
  const accepted = await evaluatePolicyForDecision({
    ...(await ctx({ activePolicyIds: ["pol-anchored"] })),
    policy: anchored,
    expectedPolicyHash: await hashPolicy(anchored),
    policyTrust: { anchors: [owner] },
  });
  assert.equal(accepted.label, "POLICY_SATISFIED");

  const stranger = await evaluatePolicyForDecision({
    ...(await ctx({ activePolicyIds: ["pol-anchored"] })),
    policy: anchored,
    expectedPolicyHash: await hashPolicy(anchored),
    policyTrust: { anchors: [seedKey(9).address] },
  });
  assert.equal(stranger.label, "POLICY_NOT_TRUSTED");
  assert.equal(stranger.status, "FAIL");
});

test("policy: REQUIRE_REVIEW rules are obligations, not evaluated — policy still satisfied", async () => {
  const policy = makePolicy([
    { ruleId: "rr", type: "REQUIRE_REVIEW", severity: "INFO", params: {} },
  ]);
  const c = await ctx({ policy, expectedPolicyHash: await hashPolicy(policy) });
  const out = await evaluatePolicyForDecision({ policy, ...c });
  assert.equal(out.status, "SATISFIED");
  assert.equal(out.label, "POLICY_SATISFIED");
  assert.equal(out.reviewObligation, true);
});

test("policy: unknown rule type fails closed (VIOLATED ⇒ DENY)", async () => {
  const policy = makePolicy([{ ruleId: "x", type: "SOMETHING_NEW", severity: "HIGH", params: {} }]);
  const c = await ctx({ policy, expectedPolicyHash: await hashPolicy(policy) });
  const out = await evaluatePolicyForDecision({ policy, ...c });
  assert.notEqual(out.status, "SATISFIED");
  assert.equal(out.label, "POLICY_VIOLATED");
});

test("policy: context is derived ONLY from bound intent + sim (no caller context co-insurance)", async () => {
  const recipient = seedKey(1).address;
  const policy = makePolicy([
    { ruleId: "r1", type: "RECIPIENT_ALLOWLIST", severity: "HIGH", params: { addresses: [recipient] } },
  ]);
  const intent = makeIntent({ recipient });
  const declaration = await makeDeclaration({ intent });
  const binding = await evaluateDeclarationBinding({ intent, declaration, evm: EVM });
  const out = await evaluatePolicyForDecision({
    policy,
    intent,
    binding,
    simulation: makeSimulation({ recipient }, intent),
    trustedPolicySource: undefined,
    activePolicyIds: ["pol-default"],
    expectedPolicyHash: await hashPolicy(policy),
    blockTimestamp: "1",
  });
  assert.equal(out.label, "POLICY_SATISFIED");
});