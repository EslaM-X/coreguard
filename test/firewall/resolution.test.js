/**
 * Phase D — Review resolution (Q-FW2a/Q-FW9a): REQUIRE_REVIEW → ALLOW only via
 * an authorized reviewer; resolution is a NEW frozen record; DENY stays DENY.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import * as EVM from "../../packages/evm/index.js";
import { decideFirewall, resolveReview } from "../../packages/firewall/index.js";
import { RESOLUTION_RECORD_VERSION } from "../../packages/firewall/index.js";
import { seedKey, makeAddress, makeIntent, makeDeclaration, signDeclaration, makePolicy, makeSimulation, DEFAULT_REVIEW_PATH } from "./helpers.js";

const WRITER = makeAddress(0x77);

async function pendingReview() {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  const out = await decideFirewall({
    intent,
    declaration,
    policy: makePolicy([]),
    activePolicyIds: ["pol-default"],
    simulation: null,
    authorityAtState: "1024",
    blockTimestamp: "1",
    evm: EVM,
    reviewPath: DEFAULT_REVIEW_PATH([WRITER]),
  });
  assert.equal(out.decision, "REQUIRE_REVIEW");
  return {
    out,
    intent,
    declaration,
    inputs: {
      intent,
      declaration,
      policy: makePolicy([]),
      activePolicyIds: ["pol-default"],
      authorityAtState: "1024",
      blockTimestamp: "2",
      evm: EVM,
      reviewPath: DEFAULT_REVIEW_PATH([WRITER]),
    },
  };
}

test("resolution: authorized writer admits a frozen resolution linked to the requirement review", async () => {
  const { out, inputs } = await pendingReview();
  const res = await resolveReview({
    parentRecord: out.record,
    writer: WRITER,
    reviewPath: DEFAULT_REVIEW_PATH([WRITER]),
    resolvedSimulation: makeSimulation({}, inputs.intent),
    reason: "verified simulation",
    inputs,
  });

  assert.equal(res.admitted, true);
  assert.equal(res.decision, "ALLOW");
  assert.equal(res.resolution.version, RESOLUTION_RECORD_VERSION);
  assert.equal(res.resolution.ref, out.record.decisionRef);
  assert.equal(res.resolution.from, "REQUIRE_REVIEW");
  assert.equal(res.resolution.to, "ALLOW");
  assert.equal(res.resolution.writer, WRITER);
  assert.ok(Object.isFrozen(res.resolution));

  // The original record is untouched and still frozen as REQUIRE_REVIEW.
  assert.equal(out.record.decision, "REQUIRE_REVIEW");
  assert.equal(out.record.decisionRef, res.resolution.ref);
});

test("resolution: un-authorized writer is rejected", async () => {
  const { out, inputs } = await pendingReview();
  const res = await resolveReview({
    parentRecord: out.record,
    writer: makeAddress(0x66),
    reviewPath: DEFAULT_REVIEW_PATH([WRITER]),
    resolvedSimulation: makeSimulation({}, inputs.intent),
    reason: "nope",
    inputs,
  });
  assert.equal(res.admitted, false);
  assert.match(res.error, /not authorized/);
});

test("resolution: DENY parent can never be resolved to ALLOW", async () => {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  const deny = await decideFirewall({
    intent,
    declaration,
    policy: makePolicy([{ ruleId: "r", type: "VALUE_LIMIT", severity: "HIGH", params: { max: "1" } }]),
    activePolicyIds: ["pol-default"],
    simulation: makeSimulation({}, intent),
    authorityAtState: "1024",
    blockTimestamp: "1",
    evm: EVM,
    reviewPath: DEFAULT_REVIEW_PATH([WRITER]),
  });
  assert.equal(deny.decision, "DENY");
  const res = await resolveReview({
    parentRecord: deny.record,
    writer: WRITER,
    reviewPath: DEFAULT_REVIEW_PATH([WRITER]),
    resolvedSimulation: makeSimulation({}, intent),
    reason: "would be retroactive",
    inputs: {
      intent,
      declaration,
      policy: makePolicy([]),
      activePolicyIds: ["pol-default"],
      authorityAtState: "1024",
      blockTimestamp: "2",
      evm: EVM,
      reviewPath: DEFAULT_REVIEW_PATH([WRITER]),
    },
  });
  assert.equal(res.admitted, false);
  assert.match(res.error, /DENY → ALLOW/);
  assert.equal(deny.record.decision, "DENY");
});

test("resolution: unresolvable review (simulation still missing) is not admitted", async () => {
  const { out, inputs } = await pendingReview();
  const res = await resolveReview({
    parentRecord: out.record,
    writer: WRITER,
    reviewPath: DEFAULT_REVIEW_PATH([WRITER]),
    resolvedSimulation: null,
    reason: "still unknown",
    inputs,
  });
  assert.equal(res.admitted, false);
});

test("resolution: a resolution that re-decides to DENY is not admitted", async () => {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  const review = await decideFirewall({
    intent,
    declaration,
    policy: makePolicy([]),
    activePolicyIds: ["pol-default"],
    simulation: null,
    authorityAtState: "1024",
    blockTimestamp: "1",
    evm: EVM,
    reviewPath: DEFAULT_REVIEW_PATH([WRITER]),
  });
  assert.equal(review.decision, "REQUIRE_REVIEW");
  const res = await resolveReview({
    parentRecord: review.record,
    writer: WRITER,
    reviewPath: DEFAULT_REVIEW_PATH([WRITER]),
    resolvedSimulation: makeSimulation({}, intent),
    reason: "turned out to be bad",
    inputs: {
      intent,
      declaration,
      policy: makePolicy([{ ruleId: "r", type: "VALUE_LIMIT", severity: "HIGH", params: { max: "1" } }]),
      activePolicyIds: ["pol-default"],
      authorityAtState: "1024",
      blockTimestamp: "2",
      evm: EVM,
      reviewPath: DEFAULT_REVIEW_PATH([WRITER]),
    },
  });
  assert.equal(res.admitted, false);
  assert.match(res.error, /did not yield ALLOW/);
});

test("resolution: ALLOW parent is not a review obligation", async () => {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  const allow = await decideFirewall({
    intent,
    declaration,
    policy: makePolicy([]),
    activePolicyIds: ["pol-default"],
    simulation: makeSimulation({}, intent),
    authorityAtState: "1024",
    blockTimestamp: "1",
    evm: EVM,
    reviewPath: DEFAULT_REVIEW_PATH([WRITER]),
  });
  assert.equal(allow.decision, "ALLOW");
  const res = await resolveReview({
    parentRecord: allow.record,
    writer: WRITER,
    reviewPath: DEFAULT_REVIEW_PATH([WRITER]),
    resolvedSimulation: makeSimulation({}, intent),
    reason: "unnecessary",
    inputs: {
      intent,
      declaration,
      policy: makePolicy([]),
      activePolicyIds: ["pol-default"],
      authorityAtState: "1024",
      blockTimestamp: "2",
      evm: EVM,
      reviewPath: DEFAULT_REVIEW_PATH([WRITER]),
    },
  });
  assert.equal(res.admitted, false);
  assert.match(res.error, /DENY → ALLOW|only defined for REQUIRE_REVIEW/);
});