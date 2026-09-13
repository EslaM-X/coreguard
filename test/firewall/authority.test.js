/**
 * Phase D — Authority probe recomputation (Q-FW1a/Q-FW10), EOA + EIP-1271.
 * The probe is recomputed from bound inputs through injected adapters; a
 * caller-supplied boolean is never accepted. NOT_RUN semantics mirror B-1.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import * as EVM from "../../packages/evm/index.js";
import { decideFirewall, evaluateAuthorityProbe } from "../../packages/firewall/index.js";
import { computeDeclarationId } from "../../packages/firewall/binding.js";
import { seedKey, makeAddress, makeIntent, makeDeclaration, signDeclaration, makePolicy, makeSimulation } from "./helpers.js";

const CHAIN = "1116";
const CONTRACT = "0x2222222222222222222222222222222222222222";
const MAGIC = "0x1626ba7e" + "00".repeat(28);
const WRONG = "0xffffffff" + "00".repeat(28);

async function probeFor(declaration, chainId = CHAIN, authorityAtState = "1024", evm = EVM, contractAuth = undefined) {
  const manifestId = await computeDeclarationId(declaration);
  return evaluateAuthorityProbe({ declaration, manifestId, chainId, authorityAtState, evm, contractAuth });
}

test("probe: EOA — recomputed recovery matches the declared authority (never trusts a flag)", async () => {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  const probe = await probeFor(declaration);
  assert.equal(probe.status, "OK");
  assert.equal(probe.label, "RECOVERED_SIGNER");
  assert.equal(probe.path, "EOA");
});

test("probe: EOA — signature by a DIFFERENT key fails closed (wrong signer)", async () => {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(2).priv);
  const probe = await probeFor(declaration);
  assert.equal(probe.status, "NOT_PROVEN");
  assert.equal(probe.label, "SIGNER_MISMATCH");
});

test("probe: EOA — cross-chain replay detection (1114-signed digest ≠ 1116 digest → recovery mismatch)", async () => {
  const intent = makeIntent({});
  const decl1116 = await makeDeclaration({ intent });
  const signedWith1114Digest = await signDeclaration(decl1116, seedKey(1).priv, "1114");
  const probe = await probeFor(signedWith1114Digest, CHAIN);
  assert.equal(probe.status, "NOT_PROVEN");
  assert.equal(probe.label, "SIGNER_MISMATCH");
});

test("probe: EOA — no injected EVM adapter ⇒ NOT_RUN, never fabricated", async () => {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  const probe = await probeFor(declaration, CHAIN, "1024", null);
  assert.equal(probe.status, "NOT_RUN");
  assert.equal(probe.label, "EVM_ADAPTER_UNAVAILABLE");
});

async function contractDeclaration() {
  const intent = makeIntent({ signer: CONTRACT });
  const declaration = await makeDeclaration({
    intent,
    signerBinding: { address: CONTRACT, kind: "EIP1271" },
  });
  declaration.signature = { scheme: "EIP-1271", signer: CONTRACT, bytes: "0xdeadbeef" };
  declaration.manifestId = await computeDeclarationId(declaration);
  return { intent, declaration };
}

const TYPES = { ManifestDeclaration: [{ name: "manifestId", type: "bytes32" }] };

function providersFor(acceptChain, manifestId, code = "0x60806040") {
  const expected = Buffer.from(EVM.typedDataDigest("ManifestDeclaration", TYPES, { manifestId }, acceptChain)).toString("hex").toLowerCase();
  return {
    ethCall: async ({ data }) => {
      const digestIn = String(data).toLowerCase().slice(10, 74);
      return { ok: true, data: digestIn === expected ? MAGIC : WRONG };
    },
    getCode: async () => code,
  };
}

test("probe: EIP-1271 — magic at authorityAtState ⇒ OK (never executor proof)", async () => {
  const { intent, declaration } = await contractDeclaration();
  const manifestId = await computeDeclarationId(declaration);
  const out = await decideFirewall({
    intent,
    declaration,
    policy: makePolicy([]),
    activePolicyIds: ["pol-default"],
    simulation: makeSimulation({}, intent),
    authorityAtState: "1024",
    blockTimestamp: "1",
    evm: EVM,
    contractAuth: providersFor(Number(CHAIN), manifestId),
  });
  assert.equal(out.decision, "ALLOW");
  assert.equal(out.record.authorityInputs.path, "EIP1271");
  assert.equal(out.record.authorityInputs.status, "OK");
  assert.equal(out.record.authorityInputs.label, "EIP1271_MAGIC");
});

test("probe: EIP-1271 — wrong magic / revert ⇒ NOT_PROVEN (call ran, fail-closed)", async () => {
  const { declaration } = await contractDeclaration();
  const wrong = await probeFor(declaration, CHAIN, "1024", EVM, {
    ethCall: async () => ({ ok: true, data: WRONG }),
    getCode: async () => "0x60806040",
  });
  assert.equal(wrong.status, "NOT_PROVEN");
  assert.equal(wrong.label, "NOT_MAGIC");

  const reverted = await probeFor(declaration, CHAIN, "1024", EVM, {
    ethCall: async () => ({ ok: false, code: "REVERTED" }),
    getCode: async () => "0x60806040",
  });
  assert.equal(reverted.status, "NOT_PROVEN");
  assert.equal(reverted.label, "REVERTED");
});

test("probe: EIP-1271 — empty code (EOA under contract kind) ⇒ NOT_PROVEN", async () => {
  const { declaration } = await contractDeclaration();
  const probe = await probeFor(declaration, CHAIN, "1024", EVM, {
    ethCall: async () => ({ ok: true, data: MAGIC }),
    getCode: async () => "0x",
  });
  assert.equal(probe.status, "NOT_PROVEN");
  assert.equal(probe.label, "NO_CODE_AT_STATE");
});

test("probe: EIP-1271 — missing injected providers / state ⇒ NOT_RUN (no latest fallback)", async () => {
  const { declaration } = await contractDeclaration();
  const noProviders = await probeFor(declaration, CHAIN, "1024", EVM, undefined);
  assert.equal(noProviders.status, "NOT_RUN");
  assert.equal(noProviders.label, "NO_PROVIDERS");

  const noState = await probeFor(declaration, CHAIN, null, EVM, {
    ethCall: async () => ({ ok: true, data: MAGIC }),
    getCode: async () => "0x60806040",
  });
  assert.equal(noState.status, "NOT_RUN");
  assert.equal(noState.label, "NO_AUTHORITY_STATE");
});

test("probe: EIP-1271 — cross-chain: contract accepting only the 1114 digest ⇒ NOT_MAGIC on 1116 (V10-shaped)", async () => {
  const { intent, declaration } = await contractDeclaration();
  const manifestId = await computeDeclarationId(declaration);
  const out = await decideFirewall({
    intent,
    declaration,
    policy: makePolicy([]),
    activePolicyIds: ["pol-default"],
    simulation: makeSimulation({}, intent),
    authorityAtState: "1024",
    blockTimestamp: "1",
    evm: EVM,
    contractAuth: providersFor(1114, manifestId),
  });
  assert.equal(out.record.authorityInputs.status, "NOT_PROVEN");
  assert.equal(out.record.authorityInputs.label, "NOT_MAGIC");
  assert.equal(out.decision, "DENY");
});