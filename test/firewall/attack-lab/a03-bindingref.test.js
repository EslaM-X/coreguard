/**
 * A3 — BINDING-REF integrity (design §6, Q-FW4: intentRef ↔ manifestId ↔
 * signature envelope closure).
 *
 * FAMILY ORAcles live inline here:
 *  - A3.1/2: recompute domain closure — any tamper with intentRef/manifestId/
 *            signature content must yield a DIFFERENT bindingRef (and the
 *            engine refuses at the DECISION level on the tampered inputs).
 *  - A3.3:   bindingRef is content-derived (same inputs ⇒ same ref), and it
 *            never leaks into the decision record.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { decideFirewall } from "../../../packages/firewall/index.js";
import { computeBindingRef } from "../../../packages/firewall/binding.js";
import { domainHash } from "../../../packages/canonical/index.js";
import { attackCheck, allowedInputs } from "./helpers.js";
import { makeAddress } from "../helpers.js";

const r = (name, fn) => test(`A3.${name}`, fn);

r("1 bindingRef = H(CGEP/1:FW-BINDING || {intentRef, manifestId, signature}) — domain-closed", async () => {
  const base = await allowedInputs({});
  const { intentRef } = await (async () => {
    const b = await import("../../../packages/firewall/binding.js");
    const res = await b.evaluateDeclarationBinding({ intent: base.intent, declaration: base.declaration });
    return res;
  })();
  const expected = await computeBindingRef({
    intentRef,
    manifestId: base.declaration.manifestId,
    signature: base.declaration.signature,
  });
  const recomputed = await domainHash("CGEP/1:FW-BINDING", {
    intentRef,
    manifestId: base.declaration.manifestId,
    signature: base.declaration.signature,
  });
  assert.equal(expected, recomputed, "computeBindingRef must be the domain hash of the triple");
});

r("2 tampering ANY leg (intentRef / manifestId / signature) changes the bindingRef", async () => {
  const base = await allowedInputs({});
  const b = await import("../../../packages/firewall/binding.js");
  const { intentRef } = await b.evaluateDeclarationBinding({ intent: base.intent, declaration: base.declaration });
  const clean = await computeBindingRef({ intentRef, manifestId: base.declaration.manifestId, signature: base.declaration.signature });

  const otherIntent = await allowedInputs({ intent: { recipient: makeAddress(0xee) } });
  const otherB = await b.evaluateDeclarationBinding({ intent: otherIntent.intent, declaration: otherIntent.declaration });
  const tamperedIntentRef = await computeBindingRef({ intentRef: otherB.intentRef, manifestId: base.declaration.manifestId, signature: base.declaration.signature });
  const tamperedManifest = await computeBindingRef({ intentRef, manifestId: "0x" + "ee".repeat(32), signature: base.declaration.signature });
  const tamperedSig = await computeBindingRef({ intentRef, manifestId: base.declaration.manifestId, signature: { r: "0x" + "00".repeat(32), s: "0x" + "00".repeat(32), v: 28 } });

  assert.notEqual(tamperedIntentRef, clean);
  assert.notEqual(tamperedManifest, clean);
  assert.notEqual(tamperedSig, clean);
});

r("3 mutated intent is refused at decision time regardless of hand-computed refs", async () => {
  const base = await allowedInputs({});
  const original = await allowedInputs({});
  await attackCheck({
    id: "A3.3",
    attempt: async () =>
      decideFirewall({
        ...base,
        intent: { ...original.intent, recipient: makeAddress(0xee) },
        declaration: original.declaration,
      }),
    oracle: ({ decision, predicate, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (decision === "ALLOW") return { verdict: "DEFEATED", reason: "mutated intent ALLOWed" };
      if (decision === "DENY" && predicate?.DECLARATION_BOUND === false) return { verdict: "HELD" };
      return { verdict: "DEFEATED", reason: `expected fail-closed DENY, got ${decision}` };
    },
  });
});

r("4 bindingRef is content-derived and stable across identical calls", async () => {
  const base = await allowedInputs({});
  const b = await import("../../../packages/firewall/binding.js");
  const { intentRef } = await b.evaluateDeclarationBinding({ intent: base.intent, declaration: base.declaration });
  const a = await computeBindingRef({ intentRef, manifestId: base.declaration.manifestId, signature: base.declaration.signature });
  const c = await computeBindingRef({ intentRef, manifestId: base.declaration.manifestId, signature: base.declaration.signature });
  assert.equal(a, c);
});