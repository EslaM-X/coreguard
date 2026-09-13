/**
 * Phase D — Conformance annotation (Q-FW8/c, Q-FW9a): a SEPARATE frozen record
 * that observes post-execution evidence; it never mutates or re-decides the
 * frozen decision record, and denial cannot be "verified" into allowed.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import * as EVM from "../../packages/evm/index.js";
import { decideFirewall, annotateConformance, contradictionScan, compareObserved } from "../../packages/firewall/index.js";
import { CONFORMANCE_RECORD_VERSION } from "../../packages/firewall/index.js";
import { seedKey, makeAddress, makeIntent, makeDeclaration, signDeclaration, makePolicy, makeSimulation } from "./helpers.js";

function makeTxHash(seed) {
  return "0x" + String(seed).padStart(64, "0");
}

async function allowed() {
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
    evm: EVM,
  });
  assert.equal(out.decision, "ALLOW");
  return { intent, out };
}

test("conformance: observation matching the declared scope yields CONFORM as a separate record", async () => {
  const { intent, out } = await allowed();
  const ann = await annotateConformance({
    decisionRecord: out.record,
    observed: {
      executionRef: { chainId: "1116", txHash: makeTxHash(1), blockNumber: "1030" },
      recipient: intent.recipient,
      amount: intent.amount,
      target: intent.target,
    },
    annotator: makeAddress(0x99),
  });
  assert.equal(ann.conformance, "CONFORM");
  assert.equal(ann.record.version, CONFORMANCE_RECORD_VERSION);
  assert.equal(ann.record.ref, out.record.decisionRef);
  assert.notEqual(ann.record.conformanceRef, out.record.decisionRef);
  assert.deepEqual(ann.mismatches, []);
  assert.ok(Object.isFrozen(ann.record));
  assert.notEqual(ann.record.conformanceRef, out.record.decisionRef);
});

test("conformance: divergent observation is flagged, decision record stays writable-proof frozen ALLOW", async () => {
  const { intent, out } = await allowed();
  const ann = await annotateConformance({
    decisionRecord: out.record,
    observed: {
      executionRef: { chainId: "1116", txHash: makeTxHash(2), blockNumber: "1031" },
      recipient: makeAddress(0xde), // diverged
      amount: intent.amount,
      target: intent.target,
    },
    annotator: makeAddress(0x99),
  });
  assert.equal(ann.conformance, "DIVERGED");
  assert.equal(ann.mismatches.length, 1);
  assert.equal(out.record.decision, "ALLOW");
  assert.throws(() => { out.record.decision = "DENY"; }, TypeError);
});

test("conformance: a DENY decision contradicted by a CONFORM claim is flagged (never silently upgraded)", async () => {
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
  });
  assert.equal(deny.decision, "DENY");
  assert.equal(contradictionScan({ record: deny.record, claim: "VERIFIED" }).contradiction, true);
  assert.equal(contradictionScan({ record: deny.record, claim: "CONFORM" }).contradiction, true);
  assert.equal(contradictionScan({ record: deny.record, claim: "DIVERGED" }).contradiction, false);

  const ann = await annotateConformance({
    decisionRecord: deny.record,
    observed: { executionRef: { chainId: "1116", txHash: makeTxHash(3), blockNumber: "1032" } },
    annotator: makeAddress(0x99),
  });
  assert.equal(ann.conformance, "DIVERGED");
  assert.ok(ann.mismatches.includes("DENY_VERDICT_CONTRADICTION"));
  assert.equal(ann.record.decision, "DENY");
  assert.equal(deny.record.decision, "DENY");
});

test("conformance: compareObserved is pure — no decision inputs leak", async () => {
  const { intent, out } = await allowed();
  const scope = out.record.binding.executionScope;
  const mismatches = compareObserved({
    decisionRecord: out.record,
    observed: { executionRef: { chainId: "1116", blockNumber: "1033" }, recipient: scope.recipient, amount: scope.amount, target: scope.target, selector: scope.selector },
  });
  assert.deepEqual(mismatches, []);
  assert.equal(out.record.executionScope, undefined); // executionScope never lands on the record
});

test("conformance: frozen decision record is required; a loose object is rejected", async () => {
  const { out } = await allowed();
  const loose = { ...out.record };
  await assert.rejects(annotateConformance({ decisionRecord: loose, observed: {} }), /frozen/);
});