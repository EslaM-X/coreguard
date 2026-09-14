/**
 * WS-1 — Signed Intent / Authorization Binding (spec §0/§4/§6).
 *
 * Covers: intent↔declaration canonical equality, intentRef / manifestId /
 * bindingRef independent recomputation (consistency vs the Firewall), the
 * semantic-identity vs binding-instance-fingerprint split (TL-1 / MIT-4),
 * chain / nonce / scope binding, validAfter/validUntil, fail-closed envelope
 * handling, rejection of caller-supplied refs/booleans, relayer ≠ authority,
 * and the no-execution/conformance-leak seam scan.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { hashIntent, canonicalize, domainHash } from "../../../packages/canonical/index.js";
import {
  buildAuthorization,
  computeIntentRef,
  computeManifestId,
  computeBindingRef as ws1ComputeBindingRef,
  scopeOfIntent,
  WS1_DOMAINS,
} from "../../../packages/intent/authorization.js";
import {
  computeDeclarationId,
  computeBindingRef,
  evaluateDeclarationBinding,
} from "../../../packages/firewall/binding.js";
import {
  seedKey,
  makeAddress,
  makeIntent,
  makeDeclaration,
  signDeclaration,
} from "../helpers.js";
import {
  FORBIDDEN_TOKENS,
  FORBIDDEN_EQUIVALENTS,
  CONTRACT_ADDR,
} from "../attack-lab/helpers.js";

const flipFirstHex = (s) => (s.startsWith("0x") ? s.slice(2) : s).split("").map((c) => (c === "a" ? "b" : "a")).join("");

async function signed(overrides = {}) {
  const intent = makeIntent(overrides.intent || {});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  return { intent, declaration };
}

test("ws1: intentRef recomputes to the canonical domain hash, independently", async () => {
  const { intent, declaration } = await signed();
  const result = await buildAuthorization({ intent, declaration });
  assert.equal(result.status, "OK");
  assert.equal(result.label, "BOUND");
  assert.equal(result.semantics.intentRef, await hashIntent(intent));
  assert.equal(result.semantics.intentRef, await computeIntentRef(intent));
  assert.equal(result.semantics.intentRef, await domainHash(WS1_DOMAINS.INTENT, intent));
});

test("ws1: manifestId recomputes and matches both the declared value and the Firewall", async () => {
  const { intent, declaration } = await signed();
  const result = await buildAuthorization({ intent, declaration });
  assert.equal(result.semantics.manifestId, await computeManifestId(declaration));
  assert.equal(result.semantics.manifestId, await computeDeclarationId(declaration));
  assert.equal(result.semantics.manifestId, declaration.manifestId);
});

test("ws1: bindingRef matches the Firewall closure formula (instance fingerprint)", async () => {
  const { intent, declaration } = await signed();
  const result = await buildAuthorization({ intent, declaration });
  const expected = await computeBindingRef({
    intentRef: result.semantics.intentRef,
    manifestId: result.semantics.manifestId,
    signature: declaration.signature,
  });
  assert.equal(result.instance.bindingRef, expected);
  assert.equal(result.instance.bindingRef, await ws1ComputeBindingRef({
    intentRef: result.semantics.intentRef,
    manifestId: result.semantics.manifestId,
    signature: declaration.signature,
  }));
});

test("ws1: independent recompute is status-consistent with the Firewall binding", async () => {
  const { intent, declaration } = await signed();
  const ws1 = await buildAuthorization({ intent, declaration });
  const fw = await evaluateDeclarationBinding({ intent, declaration });
  assert.equal(ws1.status, fw.status);
  assert.equal(ws1.label, fw.label);
  assert.equal(ws1.semantics.intentRef, fw.intentRef);
  assert.equal(ws1.semantics.manifestId, fw.manifestId);
  assert.equal(ws1.instance.bindingRef, fw.bindingRef);
});

test("ws1: intent ≠ signed intent (canonical mismatch) ⇒ NOT_PROVEN, never ALLOW input", async () => {
  const { declaration } = await signed();
  const other = makeIntent({ nonce: "7" });
  const result = await buildAuthorization({ intent: other, declaration });
  assert.equal(result.status, "NOT_PROVEN");
  assert.equal(result.label, "DECLARATION_NOT_BOUND");
  assert.match(result.reason, /canonical mismatch/);
});

test("ws1: semantic identity vs instance fingerprint (TL-1/MIT-4) — different signature bytes ⇒ new bindingRef, SAME semantics", async () => {
  const { intent, declaration } = await signed();
  const b1 = await buildAuthorization({ intent, declaration });
  const sig2 = { ...declaration.signature, s: flipFirstHex(declaration.signature.s) };
  const declaration2 = { ...declaration, signature: sig2 };
  const b2 = await buildAuthorization({ intent, declaration: declaration2 });
  assert.equal(b1.status, "OK");
  assert.equal(b2.status, "OK");
  assert.notEqual(b1.instance.bindingRef, b2.instance.bindingRef);
  assert.notEqual(b1.instance.signature.s, b2.instance.signature.s);
  assert.deepEqual(b1.semantics, b2.semantics);
  assert.deepEqual(b1.semantics.scope, b2.semantics.scope);
});

test("ws1: chain separation — tampered declaration.chainId ⇒ NOT_PROVEN", async () => {
  const { intent, declaration } = await signed();
  const result = await buildAuthorization({ intent, declaration: { ...declaration, chainId: "1114" } });
  assert.equal(result.status, "NOT_PROVEN");
  assert.match(result.reason, /chainId/);
});

test("ws1: nonce is a binding term — declaration nonce ≠ intent nonce ⇒ NOT_PROVEN", async () => {
  const { intent, declaration } = await signed();
  const result = await buildAuthorization({ intent, declaration: { ...declaration, nonce: "9" } });
  assert.equal(result.status, "NOT_PROVEN");
  assert.match(result.reason, /nonce/);
});

test("ws1: nonce change = new authorization, never widening", async () => {
  const a = await signed();
  const b = await signed({ intent: { nonce: "7" } });
  const r1 = await buildAuthorization(a);
  const r2 = await buildAuthorization(b);
  assert.equal(r1.status, "OK");
  assert.equal(r2.status, "OK");
  assert.notEqual(r1.instance.bindingRef, r2.instance.bindingRef);
  assert.notEqual(r1.semantics.intentRef, r2.semantics.intentRef);
});

test("ws1: signer substitution without a fresh authorization ⇒ NOT_PROVEN", async () => {
  const { intent, declaration } = await signed();
  const tampered = { ...declaration, signerBinding: { address: makeAddress(0x99) } };
  const result = await buildAuthorization({ intent, declaration: tampered });
  assert.equal(result.status, "NOT_PROVEN");
  assert.match(result.reason, /signerBinding/);
});

test("ws1: scope is the closed set (envelope, not a tx ref)", async () => {
  const { intent } = await signed();
  const scope = scopeOfIntent(intent);
  assert.deepEqual(Object.keys(scope).sort(), ["amount", "asset", "chainId", "recipient", "selector", "target", "validAfter", "validUntil"].sort());
  assert.equal(scope.target, intent.target);
  assert.equal(scope.selector, intent.selector);
  assert.equal(scope.recipient, intent.recipient);
  assert.equal(scope.amount, intent.amount);
});

test("ws1: validAfter/validUntil ride in the envelope scope (controller window)", async () => {
  const { intent, declaration } = await signed({ intent: { validAfter: "1234", validUntil: "5678" } });
  const result = await buildAuthorization({ intent, declaration });
  assert.equal(result.status, "OK");
  assert.equal(result.semantics.scope.validAfter, "1234");
  assert.equal(result.semantics.scope.validUntil, "5678");
});

test("ws1: unsigned declaration ⇒ NOT_PROVEN (fail-closed)", async () => {
  const intent = makeIntent();
  const declaration = await makeDeclaration({ intent });
  const result = await buildAuthorization({ intent, declaration });
  assert.equal(result.status, "NOT_PROVEN");
  assert.match(result.reason, /signature/);
});

test("ws1: malformed envelope (scheme / rsv) ⇒ NOT_PROVEN", async () => {
  const { intent } = await signed();
  const cases = ["0x1", "0000000000000000000000000000000000000000000000000000000000000000"];
  for (const bad of [undefined, ...cases]) {
    const signature = bad === undefined ? { scheme: "EIP-712", signer: intent.signer, r: "0x1", s: "0x1", v: 27 } : { scheme: "BOGUS", signer: intent.signer, r: bad, s: "0x1", v: 27 };
    const declaration = { ...(await makeDeclaration({ intent })), signature };
    declaration.manifestId = await computeDeclarationId(declaration);
    const result = await buildAuthorization({ intent, declaration });
    assert.equal(result.status, "NOT_PROVEN");
  }
});

test("ws1: scheme/kind consistency mismatch ⇒ NOT_PROVEN", async () => {
  const intent = makeIntent({ signer: CONTRACT_ADDR });
  const declaration = await makeDeclaration({ intent, signerBinding: { address: CONTRACT_ADDR, kind: "EIP1271" } });
  declaration.signature = { scheme: "EIP-712", signer: CONTRACT_ADDR, r: "0x1", s: "0x1", v: 27 };
  declaration.manifestId = await computeDeclarationId(declaration);
  const result = await buildAuthorization({ intent, declaration });
  assert.equal(result.status, "NOT_PROVEN");
  assert.match(result.reason, /EIP-712 envelope with kind EIP1271/);
});

test("ws1: caller-supplied bindingRef/boolean NEVER short-circuit recomputation", async () => {
  const { intent, declaration } = await signed();
  const clean = await buildAuthorization({ intent, declaration });
  const claimed = await buildAuthorization({ intent, declaration, callerClaims: { bindingRef: "0xdeadbeef", authorityOk: true } });
  assert.deepEqual(claimed, clean);
});

test("ws1: relayer ≠ authority — the signer is the authorizer, and 'from'/relayer context changes nothing", async () => {
  const { intent, declaration } = await signed();
  const result = await buildAuthorization({ intent, declaration });
  assert.equal(result.status, "OK");
  assert.equal(result.semantics.signer, intent.signer);
  assert.ok(!("relayer" in result.semantics));
});

test("ws1: no execution/conformance tokens leak into the binding (seam deep-scan)", async () => {
  const { intent, declaration } = await signed();
  const result = await buildAuthorization({ intent, declaration });
  const text = JSON.stringify({ semantics: result.semantics, instance: result.instance });
  const found = [...FORBIDDEN_TOKENS, ...FORBIDDEN_EQUIVALENTS].filter((t) => text.includes(t));
  assert.deepEqual(found, [], `post-execution artifact(s) in WS-1 pre-execution binding: ${found.join(", ")}`);
});

test("ws1: requireFreshSemantics — a re-signed identical intent is NOT a new authorization (TL-1)", async () => {
  const { intent } = await signed();
  const d1 = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  const d2 = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  const r1 = await buildAuthorization({ intent, declaration: d1 });
  const r2 = await buildAuthorization({ intent, declaration: d2 });
  assert.deepEqual(r1.semantics, r2.semantics);
  assert.equal(r1.instance.bindingRef, r2.instance.bindingRef);
});