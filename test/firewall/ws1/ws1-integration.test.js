/**
 * WS-1 — Fail-closed decision integration (spec §7 boundary + §6 seam).
 *
 * `authorizeForDecision` decides ONLY whether a validated { intent,
 * declaration } pair may be forwarded to the Firewall. It never decides and
 * never forwards a broken binding. Integration smoke: an authorized EOA or
 * EIP-1271 pair fed to `decideFirewall` yields its normal, frozen ALLOW.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import * as EVM from "../../../packages/evm/index.js";
import { authorizeForDecision } from "../../../packages/intent/authorization.js";
import { decideFirewall } from "../../../packages/firewall/index.js";
import {
  makeIntent,
  makeDeclaration,
  signDeclaration,
  makePolicy,
  makeSimulation,
  seedKey,
  DEFAULT_REVIEW_PATH,
} from "../helpers.js";
import {
  providersFor,
  contractDeclaration,
  FORBIDDEN_TOKENS,
  FORBIDDEN_EQUIVALENTS,
  WRITER,
} from "../attack-lab/helpers.js";

async function eoaAuthorized() {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  const auth = await authorizeForDecision({
    intent,
    declaration,
    authorityAtState: "1024",
    evm: EVM,
    callerClaims: { bindingRef: "0xdeadbeef", authorityOk: true },
  });
  return { intent, declaration, auth };
}

test("ws1-int: authorizeForDecision OK for EOA baseline and decisionInputs forward to an ALLOW", async () => {
  const { intent, declaration, auth } = await eoaAuthorized();
  assert.equal(auth.ok, true);
  assert.equal(auth.authority.label, "RECOVERED_SIGNER");
  const out = await decideFirewall({
    intent,
    declaration,
    policy: makePolicy([]),
    activePolicyIds: ["pol-default"],
    simulation: makeSimulation({}, intent),
    authorityAtState: "1024",
    blockTimestamp: "1",
    evm: EVM,
    writer: WRITER,
  });
  assert.equal(out.decision, "ALLOW");
});

test("ws1-int: broken binding ⇒ ok:false stage=binding, decisionInputs null (never forwarded)", async () => {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  const auth = await authorizeForDecision({
    intent,
    declaration: { ...declaration, chainId: "1114" },
    authorityAtState: "1024",
    evm: EVM,
  });
  assert.equal(auth.ok, false);
  assert.equal(auth.stage, "binding");
  assert.equal(auth.decisionInputs, null);
});

test("ws1-int: authority failure ⇒ ok:false stage=authority, decisionInputs null", async () => {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(2).priv);
  const auth = await authorizeForDecision({
    intent,
    declaration,
    authorityAtState: "1024",
    evm: EVM,
  });
  assert.equal(auth.ok, false);
  assert.equal(auth.stage, "authority");
  assert.equal(auth.authority.label, "SIGNER_MISMATCH");
  assert.equal(auth.decisionInputs, null);
});

test("ws1-int: missing inputs ⇒ fail-closed (NOT_RUN), never forwarded", async () => {
  const { declaration } = await eoaAuthorized();
  for (const intent of [undefined, null]) {
    const auth = await authorizeForDecision({ intent, declaration, authorityAtState: "1024", evm: EVM });
    assert.equal(auth.ok, false);
    assert.equal(auth.status, "NOT_RUN");
    assert.equal(auth.stage, "binding");
    assert.equal(auth.decisionInputs, null);
  }
});

test("ws1-int: EIP-1271 authorization forwards to an ALLOW via decideFirewall", async () => {
  const { intent, declaration } = await contractDeclaration();
  const auth = await authorizeForDecision({
    intent,
    declaration,
    authorityAtState: "1024",
    evm: EVM,
    contractAuth: providersFor(declaration.chainId, await (
      await import("../../../packages/firewall/binding.js")
    ).computeDeclarationId(declaration)),
  });
  assert.equal(auth.ok, true);
  assert.equal(auth.authority.label, "EIP1271_MAGIC");
  const out = await decideFirewall({
    intent,
    declaration,
    policy: makePolicy([]),
    activePolicyIds: ["pol-default"],
    simulation: makeSimulation({}, intent),
    authorityAtState: "1024",
    blockTimestamp: "1",
    evm: EVM,
    contractAuth: providersFor(declaration.chainId, declaration.manifestId),
    writer: WRITER,
  });
  assert.equal(out.decision, "ALLOW");
});

test("ws1-int: caller-supplied claims never leak into decisionInputs", async () => {
  const { auth } = await eoaAuthorized();
  assert.deepEqual(Object.keys(auth.decisionInputs).sort(), ["declaration", "intent"].sort());
});

test("ws1-int: authorizeForDecision return never carries execution/conformance tokens (seam)", async () => {
  const { auth } = await eoaAuthorized();
  const text = JSON.stringify(auth);
  const found = [...FORBIDDEN_TOKENS, ...FORBIDDEN_EQUIVALENTS].filter((t) => text.includes(t));
  assert.deepEqual(found, [], `post-execution artifact(s) leaked in authorization integration: ${found.join(", ")}`);
});