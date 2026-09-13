/**
 * Phase D — Simulation consistency (Q-FW5): observed simulation must match the
 * declared executionScope, else REQUIRE_REVIEW/DENY. Un-modelable simulations
 * are never silently consistent.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import * as EVM from "../../packages/evm/index.js";
import { evaluateSimulation } from "../../packages/firewall/simulation.js";
import { evaluateDeclarationBinding } from "../../packages/firewall/binding.js";
import { makeIntent, makeDeclaration, makePolicy, makeSimulation } from "./helpers.js";

async function bound(intent = makeIntent({})) {
  const declaration = await makeDeclaration({ intent });
  const binding = await evaluateDeclarationBinding({ intent, declaration });
  return { ...intent, binding };
}

function run(sim, intent, policy = makePolicy([])) {
  return evaluateSimulation({ simulation: sim, intent, policy });
}

test("simulation: consistent envelope ⇒ SIMCONSISTENT", async () => {
  const intent = await bound();
  const out = run(makeSimulation({}, intent), intent);
  assert.equal(out.consistent, true);
  assert.equal(out.unmodelable, false);
});

test("simulation: recipient mismatch ⇒ inconsistent, violation recorded", async () => {
  const intent = await bound();
  const out = run(makeSimulation({ recipient: "0xdddddddddddddddddddddddddddddddddddddddd" }, intent), intent);
  assert.equal(out.consistent, false);
  assert.ok(out.comparisons.some((v) => v.field === "recipient" && v.ok === false));
});

test("simulation: amount mismatch ⇒ inconsistent", async () => {
  const intent = await bound();
  const out = run(makeSimulation({ amount: "0x1" }, intent), intent);
  assert.equal(out.consistent, false);
});

test("simulation: SWAP without a received quantity is un-modelable (never consistent)", async () => {
  const intent = await bound(makeIntent({ action: "SWAP" }));
  const withReceived = run(makeSimulation({ received: "500000000000000000" }, intent), intent);
  assert.equal(withReceived.consistent, true);
  assert.equal(withReceived.unmodelable, false);
  const without = run(makeSimulation({ amount: "499" }, intent), intent);
  assert.equal(without.unmodelable, true);
});

test("simulation: missing required field ⇒ unmodelable (never consistent)", async () => {
  const intent = await bound();
  const out = run({ amount: intent.amount }, intent); // missing recipient/target/selector
  assert.equal(out.consistent, false);
  assert.equal(out.unmodelable, true);
});

test("simulation: unsupported action ⇒ un-modelable", async () => {
  const intent = await bound(makeIntent({ action: "SOME_ACTION" }));
  const out = run(makeSimulation({}, intent), intent);
  assert.equal(out.unmodelable, true);
});

test("simulation: MAX_GAS ceiling from committed policy rejectable at the sim gate", async () => {
  const intent = await bound();
  const policy = makePolicy([{ ruleId: "g", type: "MAX_GAS", severity: "HIGH", params: { maxGas: "50000" } }]);
  const out = run(makeSimulation({ gasUsed: "60000" }, intent), intent, policy);
  assert.equal(out.consistent, false);
  assert.ok(out.comparisons.some((v) => String(v.field).includes("gasUsed") && v.ok === false));
});

test("simulation: past-deadline forecast ⇒ inconsistent, not review", async () => {
  const intent = await bound(makeIntent({ validUntil: "100" }));
  const out = run(makeSimulation({ blockTimestamp: "200" }, intent), intent);
  assert.equal(out.consistent, false);
  assert.equal(out.unmodelable, false);
});