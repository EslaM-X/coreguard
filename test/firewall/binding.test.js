/**
 * Phase D — Declaration binding (Q-FW4): intentRef, recomputed manifestId,
 * bindingRef, executionScope. The engine recomputes the declaration hash from
 * canonical content; a caller-supplied id is never trusted.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import * as EVM from "../../packages/evm/index.js";
import { evaluateDeclarationBinding, computeDeclarationId, computeBindingRef, executionScopeOf } from "../../packages/firewall/binding.js";
import { hashIntent } from "../../packages/canonical/index.js";
import { seedKey, makeAddress, makeIntent, makeDeclaration, signDeclaration } from "./helpers.js";

test("binding: well-formed EOA closure binds the canonical intent", async () => {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  const result = await evaluateDeclarationBinding({ intent, declaration });
  assert.equal(result.status, "OK");
  assert.equal(result.label, "BOUND");
  assert.equal(result.intentRef, await hashIntent(intent));
  assert.equal(result.manifestId, declaration.manifestId);
  const expectedRef = await computeBindingRef({ intentRef: await hashIntent(intent), manifestId: declaration.manifestId, signature: declaration.signature });
  assert.equal(result.bindingRef, expectedRef);
});

test("binding: provided intent ≠ declared intent ⇒ NOT_PROVEN (content, not ids)", async () => {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  const other = makeIntent({ nonce: "7" });
  const result = await evaluateDeclarationBinding({ intent: other, declaration });
  assert.equal(result.status, "NOT_PROVEN");
  assert.equal(result.label, "DECLARATION_NOT_BOUND");
});

test("binding: declaration chainId ≠ intent chainId ⇒ NOT_PROVEN", async () => {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  declaration.chainId = "1114"; // tampered after signing
  const result = await evaluateDeclarationBinding({ intent, declaration });
  assert.equal(result.status, "NOT_PROVEN");
  assert.match(result.reason, /chainId/);
});

test("binding: tampered manifestId is recomputed and rejected", async () => {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  declaration.manifestId = "0x" + "ff".repeat(32);
  const result = await evaluateDeclarationBinding({ intent, declaration });
  assert.equal(result.status, "NOT_PROVEN");
  assert.match(result.reason, /manifestId/);
});

test("binding: wrong signerBinding address (≠ intent.signer) ⇒ NOT_PROVEN", async () => {
  const intent = makeIntent({});
  const declaration = await signDeclaration(
    await makeDeclaration({ intent, signerBinding: { address: makeAddress(0x99) } }),
    seedKey(1).priv
  );
  const result = await evaluateDeclarationBinding({ intent, declaration });
  assert.equal(result.status, "NOT_PROVEN");
  assert.match(result.reason, /signerBinding/);
});

test("binding: EIP-1271 signerBinding with EOA-typed scheme ⇒ consistency error", async () => {
  const intent = makeIntent({ signer: makeAddress(0x22) });
  const declaration = await makeDeclaration({
    intent,
    signerBinding: { address: intent.signer, kind: "EIP1271" },
  });
  declaration.signature = { scheme: "EIP-712", signer: intent.signer, r: "0x1", s: "0x1", v: 27 };
  declaration.manifestId = await computeDeclarationId(declaration);
  const result = await evaluateDeclarationBinding({ intent, declaration });
  assert.equal(result.status, "NOT_PROVEN");
  assert.match(result.reason, /EIP-712 envelope with kind EIP1271/);
});

test("binding: executionScope is the declared prediction (envelope, not a tx ref)", async () => {
  const intent = makeIntent({});
  const scope = executionScopeOf(intent);
  assert.equal(scope.chainId, "1116");
  assert.equal(scope.target, intent.target);
  assert.equal(scope.selector, intent.selector);
  assert.equal(scope.recipient, intent.recipient);
  assert.equal(scope.amount, intent.amount);
  assert.deepEqual(Object.keys(scope).sort(), ["amount", "asset", "chainId", "recipient", "selector", "target", "validAfter", "validUntil"].sort());
});

test("binding: missing signature on an EOA declaration ⇒ NOT_PROVEN, never silent", async () => {
  const intent = makeIntent({});
  const declaration = await makeDeclaration({ intent });
  const result = await evaluateDeclarationBinding({ intent, declaration });
  assert.equal(result.status, "NOT_PROVEN");
  assert.match(result.reason, /signature/);
});

test("binding: bindingRef is collision-stable and content-derived", async () => {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  const a = await computeBindingRef({ intentRef: intent.intentRef, manifestId: declaration.manifestId, signature: declaration.signature });
  const b = await computeBindingRef({ intentRef: intent.intentRef, manifestId: declaration.manifestId, signature: declaration.signature });
  assert.equal(a, b);
  const c = await computeBindingRef({ intentRef: intent.intentRef, manifestId: declaration.manifestId, signature: { ...declaration.signature, s: "0x2" } });
  assert.notEqual(a, c);
});