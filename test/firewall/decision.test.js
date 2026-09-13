/**
 * Phase D — Firewall decision engine test matrix (FW-1..FW-8, FW-10/FW-11
 * guard suites + temporal seam). Spec: agent-provenance-firewall.md §17.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import * as EVM from "../../packages/evm/index.js";
import { decideFirewall } from "../../packages/firewall/index.js";
import { decisionRecordRef, RESOLUTION_RECORD_VERSION, CONFORMANCE_RECORD_VERSION } from "../../packages/firewall/index.js";
import { evaluateSimulation } from "../../packages/firewall/simulation.js";
import { annotateConformance, contradictionScan } from "../../packages/firewall/conformance.js";
import { seedKey, makeAddress, makeIntent, makeDeclaration, signDeclaration, makePolicy, makeSimulation, DEFAULT_REVIEW_PATH, makeTxHash } from "./helpers.js";

async function allowedBase({ policy = makePolicy([]), signature, ...rest } = {}) {
  const intent = makeIntent({});
  const key = seedKey(1);
  let declaration;
  if (signature === "unsigned") {
    declaration = await makeDeclaration({ intent });
  } else {
    declaration = await signDeclaration(await makeDeclaration({ intent }), key.priv);
  }
  const activePolicyIds = ["pol-default"];
  return { intent, declaration, policy, activePolicyIds, authorityAtState: "1024", blockTimestamp: "1", evm: EVM };
}

async function decide(inputs, overrides = {}) {
  const base = await allowedBase(inputs);
  return decideFirewall({ ...base, ...overrides });
}

test("FW-1: happy path — EOA authority + committed policy + consistent simulation ⇒ ALLOW with a frozen, replayable record", async () => {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  const out = await decideFirewall({
    intent,
    declaration,
    policy: makePolicy([]),
    activePolicyIds: ["pol-default"],
    simulation: makeSimulation({}, intent),
    authorityAtState: "1024",
    blockTimestamp: "1",
    writer: makeAddress(0x88),
    evm: EVM,
  });

  assert.equal(out.decision, "ALLOW");
  assert.equal(out.record.decision, "ALLOW");
  assert.equal(out.record.decisionBlock, "1024");
  assert.equal(out.record.binding.executionScope.chainId, "1116");
  assert.ok(out.record.decisionRef.startsWith("0x"));
  assert.equal(out.record.decisionRef, await decisionRecordRef(out.record));
  assert.ok(Object.isFrozen(out.record));
  assert.ok(Object.isFrozen(out.record.binding));

  const again = await decideFirewall({
    intent,
    declaration,
    policy: makePolicy([]),
    activePolicyIds: ["pol-default"],
    simulation: makeSimulation({}, intent),
    authorityAtState: "1024",
    blockTimestamp: "1",
    writer: makeAddress(0x88),
    evm: EVM,
  });
  assert.deepEqual(out.record, again.record);
  assert.deepEqual(out.predicate, {
    DECLARATION_BOUND: true,
    AUTHORITY_PROBE_OK: true,
    POLICY_SATISFIED: true,
    SIMCONSISTENT: true,
    REVIEW_OBLIGATION: false,
  });
});

test("FW-2: policy violation ⇒ DENY with the failing rule cited", async () => {
  const intent = makeIntent({ amount: "1000000000000000000" });
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  const out = await decideFirewall({
    intent,
    declaration,
    policy: makePolicy([{ ruleId: "r1", type: "VALUE_LIMIT", severity: "HIGH", params: { max: "500" } }]),
    activePolicyIds: ["pol-default"],
    simulation: makeSimulation({}, intent),
    authorityAtState: "1024",
    blockTimestamp: "1",
    writer: makeAddress(0x88),
    evm: EVM,
  });
  assert.equal(out.decision, "DENY");
  assert.match(out.record.policy.label, /POLICY_VIOLATED|VIOLATED/);
  assert.ok((out.record.reason || "").includes("policy:POLICY_VIOLATED"));
});

test("FW-3: NOT_RUN authority input ⇒ DENY (never ALLOW)", async () => {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  const out = await decideFirewall({
    intent,
    declaration,
    policy: makePolicy([]),
    activePolicyIds: ["pol-default"],
    simulation: makeSimulation({}, intent),
    authorityAtState: "1024",
    blockTimestamp: "1",
    writer: makeAddress(0x88),
    // evm deliberately absent → EOA probe NOT_RUN
  });
  assert.equal(out.decision, "DENY");
  assert.equal(out.predicate.AUTHORITY_PROBE_OK, false);
  assert.match(out.record.authorityInputs.label, /EVM_ADAPTER_UNAVAILABLE/);
  assert.match(out.record.reason, /probe:/);
});

test("FW-4: un-modelable simulation ⇒ REQUIRE_REVIEW when a review path is configured, else DENY (never ALLOW)", async () => {
  const withPath = await decide({}, {
    simulation: null,
    reviewPath: DEFAULT_REVIEW_PATH([makeAddress(0x77)]),
  });
  assert.equal(withPath.decision, "REQUIRE_REVIEW");
  assert.equal(withPath.record.reviewPathConfigured, true);

  const withoutPath = await decide({}, { simulation: null, reviewPath: { configured: false } });
  assert.equal(withoutPath.decision, "DENY");
  assert.match(withoutPath.record.reason, /REVIEW_NOT_CONFIGURED/);
  assert.equal(withoutPath.record.unmodelable, true);
});

test("FW-5: missing declaration binding ⇒ DENY (DECLARATION_NOT_BOUND)", async () => {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  const out = await decideFirewall({
    intent: makeIntent({ nonce: "999" }), // declared intent nonce differs
    declaration,
    policy: makePolicy([]),
    activePolicyIds: ["pol-default"],
    simulation: makeSimulation({}, intent),
    authorityAtState: "1024",
    blockTimestamp: "1",
    evm: EVM,
  });
  assert.equal(out.decision, "DENY");
  assert.equal(out.predicate.DECLARATION_BOUND, false);
});

test("FW-6: deny-upgrade attempt — a frozen DENY record cannot be mutated", async () => {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  const out = await decideFirewall({
    intent,
    declaration,
    policy: makePolicy([{ ruleId: "r", type: "VALUE_LIMIT", severity: "HIGH", params: { max: "1" } }]),
    activePolicyIds: ["pol-default"],
    simulation: makeSimulation({}, intent),
    authorityAtState: "1024",
    blockTimestamp: "1",
    writer: makeAddress(0x88),
    evm: EVM,
  });
  assert.equal(out.decision, "DENY");
  assert.throws(() => { out.record.decision = "ALLOW"; }, TypeError);
  assert.equal(out.record.decision, "DENY");
  assert.equal(out.record.decisionRef, await decisionRecordRef(out.record));
});

test("FW-7: decision determinism — identical inputs ⇒ identical decision + ref + canonical (I5)", async () => {
  const first = await decide({});
  const second = await decide({});
  assert.equal(first.decision, second.decision);
  assert.equal(first.decisionRef, second.decisionRef);
  assert.equal(first.canonical, second.canonical);
  assert.deepEqual(first.predicate, second.predicate);
});

test("FW-8: policy tamper / uncommitted — expected policy hash mismatch ⇒ DENY; inactive policy ⇒ DENY", async () => {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  const common = { intent, declaration, authorityAtState: "1024", blockTimestamp: "1", evm: EVM };
  const tampered = await decideFirewall({
    ...common,
    policy: makePolicy([{ ruleId: "r", type: "VALUE_LIMIT", severity: "HIGH", params: { max: "0" } }], "pol-default"),
    expectedPolicyHash: "0x" + "00".repeat(32),
    activePolicyIds: ["pol-default"],
    simulation: makeSimulation({}, intent),
  });
  assert.equal(tampered.decision, "DENY");
  assert.equal(tampered.record.policy.label, "POLICY_HASH_MISMATCH");

  const inactive = await decideFirewall({
    ...common,
    policy: makePolicy([]),
    activePolicyIds: ["pol-other"],
    simulation: makeSimulation({}, intent),
  });
  assert.equal(inactive.decision, "DENY");
  assert.equal(inactive.record.policy.label, "POLICY_NOT_ACTIVE");
});

test("FW-10 (temporal seam): post-execution inputs are rejected loudly at the decision boundary", async () => {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  const base = { intent, declaration, policy: makePolicy([]), activePolicyIds: ["pol-default"], simulation: makeSimulation({}, intent), authorityAtState: "1024", blockTimestamp: "1", evm: EVM };
  await assert.rejects(
    decideFirewall({ ...base, executionRef: { chainId: "1116", txHash: makeTxHash(1), blockNumber: "1024" } }),
    /post-execution evidence/
  );
  await assert.rejects(
    decideFirewall({ ...base, executionBinding: { rule: "TRACE_CALLER", trace: [] } }),
    /post-execution evidence/
  );
  await assert.rejects(
    decideFirewall({ ...base, CONTRACT_EXECUTION_BINDING: true }),
    /post-execution evidence/
  );
});

test("FW-11: firewall adds records only under its own frozen domains; conformance is a SEPARATE record (never a mutation)", async () => {
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
  });
  assert.equal(allow.decision, "ALLOW");
  assert.equal(allow.record.version, "CGEP/1:FW-DECISION/1");
  assert.ok(!("executionRef" in allow.record));

  const ann = await annotateConformance({
    decisionRecord: allow.record,
    observed: { executionRef: { chainId: "1116", txHash: makeTxHash(9), blockNumber: "1030" }, recipient: allow.record.binding.executionScope.recipient },
    annotator: makeAddress(0x99),
  });
  assert.equal(ann.record.version, CONFORMANCE_RECORD_VERSION);
  assert.equal(ann.record.ref, allow.record.decisionRef);
  assert.equal(ann.record.decision, "ALLOW");
  assert.equal(ann.conformance, "CONFORM");
  assert.notEqual(ann.record.conformanceRef, allow.record.decisionRef);
  assert.equal(allow.record.decision, "ALLOW");
});

test("FW-9 (integration anchor): the §11 Mutation Lab corpus is the expectation contract for decision+post-hoc", async () => {
  const sim = evaluateSimulation({ simulation: makeSimulation(), intent: makeIntent({}), policy: makePolicy([]) });
  assert.equal(sim.unmodelable, false);
  assert.equal(sim.consistent, true);

  const deny = await decide({}, {
    policy: makePolicy([{ ruleId: "r", type: "VALUE_LIMIT", severity: "HIGH", params: { max: "1" } }]),
  });
  assert.equal(deny.decision, "DENY");
  assert.equal(contradictionScan({ record: deny.record, claim: "VERIFIED" }).contradiction, true);
});