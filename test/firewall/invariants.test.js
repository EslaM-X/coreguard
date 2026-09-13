/**
 * Phase D — Invariant suite (spec §12): I1-I7. The firewall's guarantees.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import * as EVM from "../../packages/evm/index.js";
import { decideFirewall } from "../../packages/firewall/index.js";
import { decisionRecordRef } from "../../packages/firewall/index.js";
import { seedKey, makeAddress, makeIntent, makeDeclaration, signDeclaration, makePolicy, makeSimulation } from "./helpers.js";

function makeTxHash(seed) {
  return "0x" + String(seed).padStart(64, "0");
}

async function build({ policy = makePolicy([]), declarationPatch } = {}) {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  return { intent, declaration, policy };
}

test("I1: an ALLOW is a pre-execution policy decision; no execution artifact ever lands in the record", async () => {
  const { intent, declaration, policy } = await build();
  const out = await decideFirewall({
    intent, declaration, policy, activePolicyIds: ["pol-default"], simulation: makeSimulation({}, intent),
    authorityAtState: "1024", blockTimestamp: "1", evm: EVM,
  });
  assert.equal(out.decision, "ALLOW");
  for (const key of ["executionRef", "executionBinding", "CONTRACT_AUTHORIZATION", "CONTRACT_EXECUTION_BINDING", "executionBlock"]) {
    assert.ok(!(key in out.record), `record must not carry ${key}`);
  }
  // Deep invariant: NO post-execution token may exist anywhere in the record
  // (in defense in depth — closed sim model + recorded whitelist).
  const recordText = JSON.stringify(out.record);
  for (const token of ["executionRef", "executionBinding", "CONTRACT_EXECUTION_BINDING", "executionBlock"]) {
    assert.ok(!recordText.includes(token), `record text must not contain ${token}`);
  }
});

test("I2: records are deeply frozen; a decision cannot be rewritten", async () => {
  const { intent, declaration, policy } = await build();
  const deny = await decideFirewall({
    intent, declaration, policy: makePolicy([{ ruleId: "r", type: "VALUE_LIMIT", severity: "HIGH", params: { max: "1" } }]),
    activePolicyIds: ["pol-default"], simulation: makeSimulation({}, intent), authorityAtState: "1024", blockTimestamp: "1", evm: EVM,
  });
  assert.equal(deny.decision, "DENY");
  assert.ok(Object.isFrozen(deny.record));
  assert.ok(Object.isFrozen(deny.record.binding));
  assert.ok(Object.isFrozen(deny.record.policy));
  assert.ok(Object.isFrozen(deny.record.authorityInputs));
  assert.throws(() => { deny.record.policy.label = "POLICY_SATISFIED"; }, TypeError);
  assert.equal(deny.record.decision, "DENY");
  assert.equal(deny.decisionRef, await decisionRecordRef(deny.record));
});

test("I3: the closed critical set fail-closed — every NOT_RUN critical input is a DENY", async () => {
  const { intent, declaration, policy } = await build();
  const cases = [];
  // authority probe un-available (no evm)
  cases.push(decideFirewall({ intent, declaration, policy, activePolicyIds: ["pol-default"], simulation: makeSimulation({}, intent), authorityAtState: "1024", blockTimestamp: "1" }));
  // activation un-known
  cases.push(decideFirewall({ intent, declaration, policy, activePolicyIds: [], simulation: makeSimulation({}, intent), authorityAtState: "1024", blockTimestamp: "1", evm: EVM }));
  // binding not-run (unsigned)
  const unsigned = await makeDeclaration({ intent });
  cases.push(decideFirewall({ intent, declaration: unsigned, policy, activePolicyIds: ["pol-default"], simulation: makeSimulation({}, intent), authorityAtState: "1024", blockTimestamp: "1", evm: EVM }));
  for (const c of cases) {
    const out = await c;
    assert.equal(out.decision, "DENY", "NOT_RUN critical inputs must never ALLOW or REQUIRE_REVIEW (Q-FW7a)");
  }
});

test("I4: temporal seam holds for both ALLOW and DENY records", async () => {
  const { intent, declaration, policy } = await build();
  for (const p of [policy, makePolicy([{ ruleId: "r", type: "VALUE_LIMIT", severity: "HIGH", params: { max: "1" } }])]) {
    const out = await decideFirewall({
      intent, declaration, policy: p, activePolicyIds: ["pol-default"], simulation: makeSimulation({}, intent),
      authorityAtState: "1024", blockTimestamp: "1", evm: EVM,
    });
    for (const key of ["executionRef", "executionBinding", "CONTRACT_EXECUTION_BINDING"]) {
      assert.ok(!(key in out.record));
    }
  }
});

test("I5: deterministic decisions — same inputs twice, same ref (ALLOW and DENY)", async () => {
  const { intent, declaration, policy } = await build();
  const args = { intent, declaration, policy, activePolicyIds: ["pol-default"], simulation: makeSimulation({}, intent), authorityAtState: "1024", blockTimestamp: "1", evm: EVM };
  const a1 = await decideFirewall({ ...args });
  const a2 = await decideFirewall({ ...args });
  assert.equal(a1.decision, a2.decision);
  assert.equal(a1.decisionRef, a2.decisionRef);
  const denyPolicy = makePolicy([{ ruleId: "r", type: "VALUE_LIMIT", severity: "HIGH", params: { max: "1" } }]);
  const d1 = await decideFirewall({ ...args, policy: denyPolicy });
  const d2 = await decideFirewall({ ...args, policy: denyPolicy });
  assert.equal(d1.decision, d2.decision);
  assert.equal(d1.decisionRef, d2.decisionRef);
});

test("I6: policy commitment — forged hash or rolled-back activation ⇒ DENY", async () => {
  const { intent, declaration, policy } = await build();
  const forged = await decideFirewall({
    intent, declaration, policy, activePolicyIds: ["pol-default"], simulation: makeSimulation({}, intent),
    authorityAtState: "1024", blockTimestamp: "1", evm: EVM, expectedPolicyHash: "0x" + "00".repeat(32),
  });
  const rolled = await decideFirewall({
    intent, declaration, policy, activePolicyIds: ["pol-inactive"], simulation: makeSimulation({}, intent),
    authorityAtState: "1024", blockTimestamp: "1", evm: EVM,
  });
  assert.equal(forged.decision, "DENY");
  assert.equal(rolled.decision, "DENY");
});

test("I7: authority/method is an INPUT to the decision, not an outcome of it", async () => {
  // 1) The record always carries the probe result as an input artifact.
  const { intent, declaration, policy } = await build();
  const ok = await decideFirewall({
    intent, declaration, policy, activePolicyIds: ["pol-default"], simulation: makeSimulation({}, intent),
    authorityAtState: "1024", blockTimestamp: "1", evm: EVM,
  });
  assert.equal(ok.record.authorityInputs.status, "OK");
  // 2) An earlier ALLOW does not infect a later authority-less attempt.
  const later = await decideFirewall({
    intent, declaration, policy, activePolicyIds: ["pol-default"], simulation: makeSimulation({}, intent),
    authorityAtState: "1024", blockTimestamp: "1",
  });
  assert.equal(later.decision, "DENY");
  assert.equal(later.record.authorityInputs.label, "EVM_ADAPTER_UNAVAILABLE");
});