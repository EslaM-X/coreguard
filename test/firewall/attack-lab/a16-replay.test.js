/**
 * A16 — REPLAY / REPLAY-SUBSTITUTION (design §6, oracle IN6).
 *
 * FAMILY ORACLE (order mandated by design):
 *   FIRST ask: did a mutated unauthorized input produce ALLOW?  YES → DEFEATED.
 *   Otherwise (fail-closed DENY) assert the exact expected closed outcome.
 * The SAME bound intent always reproduces the SAME frozen record + decisionRef,
 * so a replay cannot attach itself to a different spent decision.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { decideFirewall } from "../../../packages/firewall/index.js";
import { attackCheck, allowedInputs } from "./helpers.js";
import { makeAddress, makeSimulation } from "../helpers.js";

const r = (name, fn) => test(`A16.${name}`, fn);

const allMutations = [
  ["amount", { amount: "999999999999" }],
  ["recipient", { recipient: makeAddress(0xab) }],
  ["target", { target: makeAddress(0xcd) }],
  ["selector", { selector: "0xDecafBadc" }],
  ["chainId", { chainId: "1115" }],
  ["validUntil", { validUntil: "300000" }],
  ["validAfter", { validAfter: "100000" }],
];

r("1 replay-substitution FLIP check: no unauthorized input change may ALLOW", async () => {
  const base = await allowedInputs({});
  for (const [name, patch] of allMutations) {
    await attackCheck({
      id: `A16.1[${name}]`,
      attempt: async () => {
        // The signed declaration stays FIXED; only the decision-time intent is
        // substituted. This is the real replay-substitution: unattested body.
        return decideFirewall({ ...base, intent: { ...base.intent, ...patch } });
      },
      oracle: ({ decision, predicate, _thrown }) => {
        if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
        if (decision === "ALLOW") return { verdict: "DEFEATED", reason: `${name} replay-substitution ALLOWed an unattested body` };
        if (decision !== "DENY") return { verdict: "DEFEATED", reason: `expected fail-closed DENY, got ${decision}` };
        if (predicate?.DECLARATION_BOUND !== false) return { verdict: "DEFEATED", reason: `${name} must fail on DECLARATION_BOUND` };
        return { verdict: "HELD" };
      },
    });
  }
});

r("2 exact expectation after flip-check: amount-swap lands on DECLARATION_BOUND:false", async () => {
  const base = await allowedInputs({});
  await attackCheck({
    id: "A16.2",
    attempt: async () => decideFirewall({ ...base, intent: { ...base.intent, amount: "999999999999" } }),
    oracle: ({ decision, record, predicate, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      assert.equal(decision, "DENY");
      assert.equal(predicate?.DECLARATION_BOUND, false);
      assert.equal(record.simConsistent, false);
      return { verdict: "HELD" };
    },
  });
});

r("3 exact expectation after flip-check: chainId-swap breaks the binding (sim stays consistent)", async () => {
  const base = await allowedInputs({});
  await attackCheck({
    id: "A16.3",
    attempt: async () => decideFirewall({ ...base, intent: { ...base.intent, chainId: "1115" } }),
    oracle: ({ decision, record, predicate, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      assert.equal(decision, "DENY");
      assert.equal(predicate?.DECLARATION_BOUND, false);
      assert.equal(record.simConsistent, true);
      return { verdict: "HELD" };
    },
  });
});

r("4 same bound intent replayed reproduces the SAME record + decisionRef", async () => {
  const base = await allowedInputs({});
  const first = await decideFirewall(base);
  const replay = await decideFirewall(base);
  await attackCheck({
    id: "A16.4",
    attempt: async () => {
      const third = await decideFirewall({ ...base, intent: { ...base.intent }, simulation: { ...base.simulation } });
      return { first: first.record, replay: replay.record, third: third.record };
    },
    oracle: ({ first, replay, third, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (JSON.stringify(first) !== JSON.stringify(replay)) return { verdict: "DEFEATED", reason: "replay drifted" };
      if (JSON.stringify(first) !== JSON.stringify(third)) return { verdict: "DEFEATED", reason: "re-signed identical replay drifted" };
      if (replay.decisionRef !== first.decisionRef || third.decisionRef !== first.decisionRef) return { verdict: "DEFEATED", reason: "decisionRef diverged across replay" };
      return { verdict: "HELD" };
    },
  });
});

r("5 resolution result is replay-anchored to its parent, not re-derivable elsewhere", async () => {
  const base = await allowedInputs({});
  const reviewPath = { configured: true, writers: [base.writer] };
  const unmodelable = { target: base.intent.target, selector: base.intent.selector, recipient: base.intent.recipient };
  const parent = await decideFirewall({ ...base, reviewPath, simulation: unmodelable });
  assert.equal(parent.decision, "REQUIRE_REVIEW");
  const { resolveReview } = await import("../../../packages/firewall/index.js");
  const reso1 = await resolveReview({ parentRecord: parent.record, writer: base.writer, reviewPath, resolvedSimulation: makeSimulation({}, base.intent), inputs: base });
  const reso2 = await resolveReview({ parentRecord: parent.record, writer: base.writer, reviewPath, resolvedSimulation: makeSimulation({}, base.intent), inputs: base });
  assert.equal(reso1.admitted, true);
  assert.equal(reso2.admitted, true);
  assert.equal(reso2.resolution.decisionRef, reso1.resolution.decisionRef);
});