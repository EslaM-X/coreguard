/**
 * Phase D — Mutation Lab (spec §11, FINAL): M1-M13. Each mutation corrupts one
 * input and must either change the decision or be honestly scoped. Decisions
 * derive from recomputed content; post-hoc facts never feed a decision.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import * as EVM from "../../packages/evm/index.js";
import { decideFirewall, annotateConformance } from "../../packages/firewall/index.js";
import { computeDeclarationId } from "../../packages/firewall/binding.js";
import { seedKey, makeAddress, makeIntent, makeDeclaration, signDeclaration, makePolicy, makeSimulation } from "./helpers.js";

function makeTxHash(seed) {
  return "0x" + String(seed).padStart(64, "0");
}

const contracts = {
  AU: "0x22222222222222222222222222222222222222a1",
  RV: "0x22222222222222222222222222222222222222c1",
};

async function base() {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  const inputs = {
    intent,
    declaration,
    policy: makePolicy([]),
    activePolicyIds: ["pol-default"],
    simulation: makeSimulation({}, intent),
    authorityAtState: "1024",
    blockTimestamp: "1",
    evm: EVM,
  };
  const out = await decideFirewall(inputs);
  assert.equal(out.decision, "ALLOW");
  return { intent, declaration, inputs, out };
}

const m = (name, fn) => test(`M${name}`, fn);

m("1 Altered recipient", async () => {
  const { declaration, out } = await base();
  const evil = makeIntent({ recipient: makeAddress(0xee) });
  const mut = await decideFirewall({ intent: evil, declaration, policy: makePolicy([]), activePolicyIds: ["pol-default"], simulation: makeSimulation({}, evil), authorityAtState: "1024", blockTimestamp: "1", evm: EVM });
  assert.equal(mut.decision, "DENY");
  const ann = await annotateConformance({ decisionRecord: out.record, observed: { executionRef: { chainId: "1116", txHash: makeTxHash(1), blockNumber: "1030" }, recipient: makeAddress(0xee) } });
  assert.equal(ann.conformance, "DIVERGED");
});

m("2 Altered amount", async () => {
  const { declaration } = await base();
  const evil = makeIntent({ amount: "0x999" });
  const mut = await decideFirewall({ intent: evil, declaration, policy: makePolicy([]), activePolicyIds: ["pol-default"], simulation: makeSimulation({}, evil), authorityAtState: "1024", blockTimestamp: "1", evm: EVM });
  assert.equal(mut.decision, "DENY");
});

m("3 Altered calldata / selector", async () => {
  const { declaration } = await base();
  const evil = makeIntent({ selector: "0xdeadbeef" });
  const mut = await decideFirewall({ intent: evil, declaration, policy: makePolicy([]), activePolicyIds: ["pol-default"], simulation: makeSimulation({}, evil), authorityAtState: "1024", blockTimestamp: "1", evm: EVM });
  assert.equal(mut.decision, "DENY");
});

m("4 Wrong chain", async () => {
  const { declaration } = await base();
  const evil = makeIntent({ chainId: "1114" });
  const mut = await decideFirewall({ intent: evil, declaration, policy: makePolicy([]), activePolicyIds: ["pol-default"], simulation: makeSimulation({}, evil), authorityAtState: "1024", blockTimestamp: "1", evm: EVM });
  assert.equal(mut.decision, "DENY");
  assert.match(mut.record.reason, /binding:/);
});

m("5 Signer substitution (wrong key)", async () => {
  const { intent } = await base();
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(2).priv);
  const mut = await decideFirewall({ intent, declaration, policy: makePolicy([]), activePolicyIds: ["pol-default"], simulation: makeSimulation({}, intent), authorityAtState: "1024", blockTimestamp: "1", evm: EVM });
  assert.equal(mut.decision, "DENY");
  assert.equal(mut.record.authorityInputs.label, "SIGNER_MISMATCH");
});

m("6 Replay — same signature, mutated nonce", async () => {
  const { declaration } = await base();
  const intent2 = makeIntent({ nonce: "2" });
  const mut = await decideFirewall({ intent: intent2, declaration, policy: makePolicy([]), activePolicyIds: ["pol-default"], simulation: makeSimulation({}, intent2), authorityAtState: "1024", blockTimestamp: "1", evm: EVM });
  assert.equal(mut.decision, "DENY");
});

m("7 Missing provenance / unsigned declaration", async () => {
  const { intent } = await base();
  const declaration = await makeDeclaration({ intent });
  const mut = await decideFirewall({ intent, declaration, policy: makePolicy([]), activePolicyIds: ["pol-default"], simulation: makeSimulation({}, intent), authorityAtState: "1024", blockTimestamp: "1", evm: EVM });
  assert.equal(mut.decision, "DENY");
  assert.equal(mut.predicate.DECLARATION_BOUND, false);
});

m("8 Broken delegation — signer not the declared authority", async () => {
  const { intent } = await base();
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(3).priv);
  const mut = await decideFirewall({ intent, declaration, policy: makePolicy([]), activePolicyIds: ["pol-default"], simulation: makeSimulation({}, intent), authorityAtState: "1024", blockTimestamp: "1", evm: EVM });
  assert.equal(mut.decision, "DENY");
  assert.equal(mut.record.authorityInputs.status, "NOT_PROVEN");
});

m("9 Rubber-stamp EIP-1271 contract (magic for any digest)", async () => {
  const intent = makeIntent({ signer: contracts.AU });
  const declaration = await makeDeclaration({ intent, signerBinding: { address: contracts.AU, kind: "EIP1271" } });
  declaration.signature = { scheme: "EIP-1271", signer: contracts.AU, bytes: "0xdeadbeef" };
  declaration.manifestId = await computeDeclarationId(declaration);
  const out = await decideFirewall({
    intent, declaration, policy: makePolicy([]), activePolicyIds: ["pol-default"], simulation: makeSimulation({}, intent),
    authorityAtState: "1024", blockTimestamp: "1", evm: EVM,
    contractAuth: { ethCall: async () => ({ ok: true, data: "0x1626ba7e" + "00".repeat(28) }), getCode: async () => "0x60806040" },
  });
  // Honest scope: magic proves the contract authorized; it is NOT proof the
  // executor conformed. ALLOW here is undetectable at decision time; executor
  // binding is the B-1 verifier's job (CONTRACT_EXECUTION_BINDING), NOT this
  // record's.
  assert.equal(out.decision, "ALLOW");
  assert.equal(out.record.authorityInputs.label, "EIP1271_MAGIC");
  assert.ok(!("executionRef" in out.record));
});

m("10 Contract authorization without an execution binding", async () => {
  const m9 = { /* see M9 for signer constant */ AU: contracts.AU };
  const intent = makeIntent({ signer: m9.AU });
  const declaration = await makeDeclaration({ intent, signerBinding: { address: m9.AU, kind: "EIP1271" } });
  declaration.signature = { scheme: "EIP-1271", signer: m9.AU, bytes: "0xdeadbeef" };
  declaration.manifestId = await computeDeclarationId(declaration);
  const out = await decideFirewall({
    intent, declaration, policy: makePolicy([]), activePolicyIds: ["pol-default"], simulation: makeSimulation({}, intent),
    authorityAtState: "1024", blockTimestamp: "1", evm: EVM,
    contractAuth: { ethCall: async () => ({ ok: true, data: "0x1626ba7e" + "00".repeat(28) }), getCode: async () => "0x60806040" },
  });
  assert.equal(out.decision, "ALLOW");
  await assert.rejects(
    decideFirewall({ ...{ intent, declaration, policy: makePolicy([]), activePolicyIds: ["pol-default"], simulation: makeSimulation({}, intent), authorityAtState: "1024", blockTimestamp: "1", evm: EVM, contractAuth: { ethCall: async () => ({ ok: true, data: "0x1626ba7e" + "00".repeat(28) }), getCode: async () => "0x60806040" } }, executionBinding: { rule: "TRACE_CALLER", trace: [] } }),
    /post-execution evidence/
  );
});

m("11 Simulation divergence — post-hoc, never a decision change", async () => {
  const { intent, out } = await base();
  assert.equal(out.decision, "ALLOW");
  const ann = await annotateConformance({
    decisionRecord: out.record,
    observed: { executionRef: { chainId: "1116", txHash: makeTxHash(2), blockNumber: "1030" }, recipient: makeAddress(0xee), amount: intent.amount, target: intent.target },
  });
  assert.equal(ann.conformance, "DIVERGED");
  assert.equal(out.record.decision, "ALLOW");
});

m("12 Rollback — policy committed-forged", async () => {
  const { intent, declaration } = await base();
  const permissive = makePolicy([]);
  const mut = await decideFirewall({
    intent, declaration, policy: permissive, activePolicyIds: ["pol-default"], simulation: makeSimulation({}, intent),
    authorityAtState: "1024", blockTimestamp: "1", evm: EVM,
    expectedPolicyHash: "0x" + "00".repeat(32),
  });
  assert.equal(mut.decision, "DENY");
  assert.equal(mut.record.policy.label, "POLICY_HASH_MISMATCH");
});

m("13 Allow-upgrade on a DENY (forbidden)", async () => {
  const { intent, declaration } = await base();
  const deny = await decideFirewall({
    intent, declaration, policy: makePolicy([{ ruleId: "r", type: "VALUE_LIMIT", severity: "HIGH", params: { max: "1" } }]),
    activePolicyIds: ["pol-default"], simulation: makeSimulation({}, intent), authorityAtState: "1024", blockTimestamp: "1", evm: EVM,
  });
  assert.equal(deny.decision, "DENY");
  assert.throws(() => { deny.record.decision = "ALLOW"; }, TypeError);
  assert.equal(deny.record.decision, "DENY");
  const ann = await annotateConformance({
    decisionRecord: deny.record,
    observed: { executionRef: { chainId: "1116", txHash: makeTxHash(3), blockNumber: "1032" } },
  });
  assert.ok(ann.mismatches.includes("DENY_VERDICT_CONTRADICTION"));
  assert.equal(deny.record.decision, "DENY");
});