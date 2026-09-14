/**
 * WS-2 — SDK binding recomputation chain (spec §4.0/§4.1/§4.2, oracles
 * W2-I1/I3/I6/I7/I8/I10).
 *
 * Every output is independently re-derived from trusted inputs every call;
 * scope is read ONLY from the frozen decision record (FSR-1); authority runs
 * only through injected adapters (Q-SDK6); the caller-supplied bindingRef is
 * comparison/reference metadata only (FSR-2); fail-closed everywhere.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { hashIntent, domainHash, canonicalize } from "../../packages/canonical/index.js";
import {
  computeIntentRef,
  computeManifestId,
  computeBindingRef as ws1ComputeBindingRef,
  scopeOfIntent,
  WS1_DOMAINS,
} from "../../packages/intent/authorization.js";
import {
  computeDeclarationId,
  computeBindingRef as fwComputeBindingRef,
} from "../../packages/firewall/binding.js";
import { DECISION_DOMAIN } from "../../packages/firewall/decision-record.js";
import { verifyBinding, FW_DECISION_DOMAIN } from "../../packages/sdk/index.js";
import {
  eoaArgs,
  contractArgs,
  verifyEOA,
  verifyContract,
  statePinnedProviders,
  callerContextProviders,
  flipRef,
  makeAddress,
  CONTRACT_ADDR,
} from "./helpers.js";

const recordBodyOf = (record) => {
  const { decisionRef: _ref, ...body } = record;
  return body;
};

const eoaBase = async (extra = {}) => {
  const { intent, declaration, frozenRecord, authorityAtState, evm } = await eoaArgs();
  return { intent, declaration, frozenRecord, authorityAtState, evm, ...extra };
};

test("W2-I1: sdk recompute closure — every ref recomputes to the same value", async () => {
  const base = await eoaBase();
  const result = await verifyBinding(base);
  assert.equal(result.status, "OK");
  assert.equal(result.label, "BOUND");
  assert.equal(result.stage, null);

  assert.equal(result.recomputed.intentRef, await hashIntent(base.intent));
  assert.equal(result.recomputed.intentRef, await computeIntentRef(base.intent));
  assert.equal(result.recomputed.intentRef, await domainHash(WS1_DOMAINS.INTENT, base.intent));
  assert.equal(result.recomputed.intentRef, result.semantics.intentRef);

  assert.equal(result.recomputed.manifestId, await computeManifestId(base.declaration));
  assert.equal(result.recomputed.manifestId, await computeDeclarationId(base.declaration));
  assert.equal(result.recomputed.manifestId, result.semantics.manifestId);

  const expected = await ws1ComputeBindingRef({
    intentRef: result.recomputed.intentRef,
    manifestId: result.recomputed.manifestId,
    signature: base.declaration.signature,
  });
  assert.equal(result.recomputed.bindingRef, expected);
  assert.equal(result.recomputed.bindingRef, await fwComputeBindingRef({
    intentRef: result.recomputed.intentRef,
    manifestId: result.recomputed.manifestId,
    signature: base.declaration.signature,
  }));
  assert.equal(result.recomputed.bindingRef, result.instance.bindingRef);

  // Deep re-derivation: a second call gives an identical derivation.
  const again = await verifyBinding(base);
  assert.deepEqual(again, result);
});

test("W2-I1: decisionRef is content-derived from the frozen record", async () => {
  const base = await eoaBase();
  const result = await verifyBinding(base);
  assert.equal(result.decisionRef, base.frozenRecord.decisionRef);
  assert.equal(result.decisionRef, await domainHash(FW_DECISION_DOMAIN, recordBodyOf(base.frozenRecord)));
  assert.equal(FW_DECISION_DOMAIN, DECISION_DOMAIN);
});

test("W2-I3: executionScope is byte-identical to the frozen record scope", async () => {
  const base = await eoaBase();
  const result = await verifyBinding(base);
  assert.deepEqual(result.executionScope, base.frozenRecord.binding.executionScope);
  assert.equal(canonicalize(result.executionScope), canonicalize(scopeOfIntent(base.intent)));

  // A separately-passed scope object is NEVER accepted (W2-I3/Q-W2-5).
  const resultPoisoned = await verifyBinding({
    ...base,
    executionScope: { chainId: "1", amount: "1", recipient: makeAddress(0x999) },
  });
  assert.equal(resultPoisoned.status, "OK");
  assert.deepEqual(resultPoisoned.executionScope, base.frozenRecord.binding.executionScope);
  assert.deepEqual(resultPoisoned, result);
});

test("W2-I4: from/relayer NEVER become the authorizer (EOA path is inert to from)", async () => {
  const clean = await verifyEOA();
  assert.equal(clean.status, "OK");
  assert.deepEqual(await verifyEOA({ from: makeAddress(0x999) }), clean);
  assert.deepEqual(await verifyEOA({ relayer: makeAddress(0x555) }), clean);
});

test("W2-I4: EIP-1271 from is eth_call caller CONTEXT — probe semantics only, identity unchanged", async () => {
  const { declaration } = await contractArgs();
  const manifestId = await computeDeclarationId(declaration);
  const caller = makeAddress(0x1234);
  const providers = callerContextProviders(declaration.chainId, manifestId, caller);

  const noCaller = await verifyContract({ contractAuth: providers });
  assert.equal(noCaller.status, "NOT_PROVEN");
  assert.equal(noCaller.label, "NOT_MAGIC");
  assert.equal(noCaller.authority.path, "EIP1271");
  assert.equal(noCaller.authority.status, "NOT_PROVEN");

  const withCaller = await verifyContract({ contractAuth: providers, from: caller });
  assert.equal(withCaller.status, "OK");
  assert.equal(withCaller.label, "BOUND");
  assert.equal(withCaller.authority.path, "EIP1271");
  assert.equal(withCaller.authority.status, "OK");
  assert.equal(withCaller.authority.label, "EIP1271_MAGIC");

  // Probe result changed with `from`, but the AUTHORIZATION IDENTITY never did.
  assert.equal(noCaller.semantics.signer, CONTRACT_ADDR);
  assert.equal(withCaller.semantics.signer, CONTRACT_ADDR);
  assert.notEqual(withCaller.semantics.signer.toLowerCase(), caller.toLowerCase());
  assert.deepEqual(noCaller.semantics.signer, withCaller.semantics.signer);

  const relayer = makeAddress(0x777);
  const withRelayer = await verifyContract({ contractAuth: providers, from: caller, relayer });
  assert.equal(withRelayer.status, "OK");
  assert.equal(withRelayer.semantics.signer, CONTRACT_ADDR);
  assert.notEqual(withRelayer.semantics.signer.toLowerCase(), relayer.toLowerCase());
});

test("W2-I8: non-widening — same intent, different signed bytes: stable semantics, detectable instance change", async () => {
  const cA = await contractArgs();
  const declarationB = {
    ...cA.declaration,
    signature: { ...cA.declaration.signature, bytes: "0xbeefdead" },
  };
  assert.equal(cA.declaration.signature.bytes, "0xdeadbeef");
  assert.equal(declarationB.signature.bytes, "0xbeefdead");
  assert.notEqual(cA.declaration.signature.bytes, declarationB.signature.bytes);

  const a = await verifyContract({ declaration: cA.declaration });
  const b = await verifyContract({ declaration: declarationB });
  assert.equal(a.status, "OK");
  assert.equal(b.status, "OK");

  // Semantic identity is STABLE (TL-1): same intentRef / manifestId / scope...
  assert.equal(a.semantics.intentRef, b.semantics.intentRef);
  assert.equal(a.semantics.manifestId, b.semantics.manifestId);
  assert.deepEqual(a.semantics.scope, b.semantics.scope);
  assert.equal(a.semantics.signer, b.semantics.signer);
  // ...but the binding INSTANCE fingerprint changed with the signature bytes.
  assert.notEqual(a.instance.bindingRef, b.instance.bindingRef);
  assert.notEqual(a.recomputed.bindingRef, b.recomputed.bindingRef);
});

test("W2-I6: fail-closed — never an implicit OK on any missing/absent leg", async () => {
  const base = await eoaBase();

  const r1 = await verifyBinding({ ...base, intent: undefined });
  assert.equal(r1.status, "NOT_RUN");
  assert.equal(r1.label, "INTENT_MISSING");
  assert.equal(r1.stage, "binding");

  const r2 = await verifyBinding({ ...base, declaration: undefined });
  assert.equal(r2.status, "NOT_RUN");
  assert.equal(r2.label, "DECLARATION_MISSING");
  assert.equal(r2.stage, "binding");

  const r3 = await verifyBinding({ ...base, declaration: { ...base.declaration, chainId: "1114" } });
  assert.equal(r3.status, "NOT_PROVEN");
  assert.equal(r3.label, "DECLARATION_NOT_BOUND");
  assert.equal(r3.stage, "binding");

  const r4 = await verifyBinding({ ...base, frozenRecord: undefined });
  assert.equal(r4.status, "NOT_RUN");
  assert.equal(r4.label, "DECISION_RECORD_MISSING");
  assert.equal(r4.stage, "scope");

  const badRecord = { ...base, frozenRecord: { ...base.frozenRecord, decisionRef: "0x" + "00".repeat(32) } };
  const r5 = await verifyBinding(badRecord);
  assert.equal(r5.status, "NOT_RUN");
  assert.equal(r5.label, "DECISION_RECORD_INVALID");
  assert.equal(r5.stage, "scope");

  const r6 = await verifyBinding({ ...base, evm: undefined });
  assert.equal(r6.status, "NOT_RUN");
  assert.equal(r6.label, "EVM_ADAPTER_UNAVAILABLE");
  assert.equal(r6.stage, "authority");

  const noArgs = await verifyBinding();
  assert.equal(noArgs.status, "NOT_RUN");
  assert.equal(noArgs.label, "INTENT_MISSING");
  assert.equal(noArgs.stage, "binding");

  for (const r of [r1, r2, r3, r4, r5, r6, noArgs]) {
    assert.notEqual(r.status, "OK");
  }
});

test("W2-I6: EIP-1271 without a pinned authorityAtState ⇒ NOT_RUN/NO_AUTHORITY_STATE (no latest fallback)", async () => {
  const { intent, declaration, frozenRecord, evm, contractAuth } = await contractArgs();
  const base = { intent, declaration, frozenRecord, evm, contractAuth };

  const missing = await verifyBinding({ ...base, authorityAtState: undefined });
  assert.equal(missing.status, "NOT_RUN");
  assert.equal(missing.label, "NO_AUTHORITY_STATE");
  assert.equal(missing.stage, "authority");

  const latest = await verifyBinding({ ...base, authorityAtState: "latest" });
  assert.equal(latest.status, "NOT_RUN");
  assert.equal(latest.label, "NO_AUTHORITY_STATE");
});

test("W2-I7: determinism — identical trusted inputs + pinned state ⇒ identical result", async () => {
  assert.deepEqual(await verifyEOA(), await verifyEOA());
  const c1 = await verifyContract({ authorityAtState: "1024" });
  const c2 = await verifyContract({ authorityAtState: "1024" });
  assert.deepEqual(c1, c2);
  assert.equal(c1.status, "OK");
});

test("W2-I7: EIP-1271 status reflects the probe AT the pinned state/context (no cross-state promise)", async () => {
  const { declaration } = await contractArgs();
  const manifestId = await computeDeclarationId(declaration);
  const pinned = statePinnedProviders(declaration.chainId, manifestId, "1024");

  const at1024 = await verifyContract({ contractAuth: pinned, authorityAtState: "1024" });
  assert.equal(at1024.status, "OK");
  assert.equal(at1024.authority.atState, "1024");

  const at1025 = await verifyContract({ contractAuth: pinned, authorityAtState: "1025" });
  assert.equal(at1025.status, "NOT_PROVEN");
  assert.equal(at1025.label, "NOT_MAGIC");
  assert.equal(at1025.authority.atState, "1025");
});

test("W2-I10: bindingRef reference mismatch ⇒ deterministic NOT_PROVEN/BINDING_REFERENCE_MISMATCH", async () => {
  const base = await eoaBase();

  // Absent reference → no comparison → OK.
  const good = await verifyBinding(base);
  assert.equal(good.status, "OK");
  assert.equal(good.stage, null);

  // A matching reference changes nothing.
  const matching = await verifyBinding({ ...base, callerBindingRef: good.recomputed.bindingRef });
  assert.equal(matching.status, "OK");
  assert.deepEqual(matching, good);

  // A mismatching reference ⇒ NOT_PROVEN, never OK/BOUND, never forwarded.
  const mismatch = await verifyBinding({ ...base, callerBindingRef: flipRef(good.recomputed.bindingRef) });
  assert.equal(mismatch.status, "NOT_PROVEN");
  assert.equal(mismatch.label, "BINDING_REFERENCE_MISMATCH");
  assert.equal(mismatch.stage, "reference");
  assert.notEqual(mismatch.status, "OK");

  // Same on the EIP-1271 path.
  const c = await contractArgs();
  const cGood = await verifyBinding(c);
  const cMismatch = await verifyBinding({ ...c, callerBindingRef: flipRef(cGood.recomputed.bindingRef) });
  assert.equal(cMismatch.status, "NOT_PROVEN");
  assert.equal(cMismatch.label, "BINDING_REFERENCE_MISMATCH");
});

test("W2-I10: the mismatch outcome is deterministic across runs", async () => {
  const base = await eoaBase();
  const bad = flipRef((await verifyBinding(base)).recomputed.bindingRef);
  const r1 = await verifyBinding({ ...base, callerBindingRef: bad });
  const r2 = await verifyBinding({ ...base, callerBindingRef: bad });
  assert.deepEqual(r1, r2);
  assert.equal(r1.status, "NOT_PROVEN");
  assert.equal(r1.label, "BINDING_REFERENCE_MISMATCH");
});