/**
 * A7 — AUTHORITY-PROBE SUBSTITUTION (design §6).
 *
 * FAMILY ORACLE: authority is derived ONLY by re-compute through the
 * harness-owned injected adapters. Every substitution attempt must land on
 * NOT_PROVEN / NOT_RUN with DENY — never on OK. When injected pieces are
 * missing the probe is NOT_RUN (fail-closed), never fabricated.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import * as EVM from "../../../packages/evm/index.js";
import { decideFirewall } from "../../../packages/firewall/index.js";
import { computeDeclarationId } from "../../../packages/firewall/binding.js";
import { attackCheck, allowedInputs, contractDeclaration, providersFor, CHAIN } from "./helpers.js";
import { seedKey, makeIntent, makeDeclaration, signDeclaration, makeSimulation } from "../helpers.js";

const r = (name, fn) => test(`A7.${name}`, fn);

/** Oracle: DENY with the given authority label (or a NOT_RUN label) — never OK. */
const deniedWith = (labelRe) =>
  ({ decision, record, predicate, _thrown }) => {
    if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
    if (decision === "ALLOW") return { verdict: "DEFEATED", reason: "substituted authority ALLOWed" };
    if (decision !== "DENY") return { verdict: "DEFEATED", reason: `expected DENY, got ${decision}` };
    assert.ok(record?.authorityInputs?.label, "record must carry an authority label");
    if (labelRe && !labelRe.test(record.authorityInputs.label)) {
      return { verdict: "DEFEATED", reason: `expected label ~ ${labelRe}, got ${record.authorityInputs.label}` };
    }
    return { verdict: "HELD" };
  };

r("1 signed by a different key than declared ⇒ SIGNER_MISMATCH ⇒ DENY", async () => {
  const base = await allowedInputs({});
  await attackCheck({
    id: "A7.1",
    attempt: async () => {
      const declaration = await signDeclaration(await makeDeclaration({ intent: base.intent }), seedKey(2).priv);
      return decideFirewall({ ...base, declaration });
    },
    oracle: deniedWith(/SIGNER_MISMATCH|NOT_PROVEN/),
  });
});

r("2 recover-substitution: declared signerBinding ≠ actual signing key ⇒ DENY", async () => {
  const key1 = seedKey(1);
  const key2 = seedKey(2);
  const intent = makeIntent({ signer: key2.address });
  await attackCheck({
    id: "A7.2",
    attempt: async () => {
      const declaration = await signDeclaration(await makeDeclaration({ intent, signerBinding: { address: key2.address } }), key1.priv);
      return decideFirewall({ ...(await allowedInputs({})), intent, declaration, simulation: makeSimulation({}, intent) });
    },
    oracle: deniedWith(/SIGNER_MISMATCH|NOT_PROVEN/),
  });
});

r("3 cross-chain signature replay ⇒ SIGNER_MISMATCH ⇒ DENY", async () => {
  const base = await allowedInputs({});
  await attackCheck({
    id: "A7.3",
    attempt: async () => {
      const cross = await signDeclaration(await makeDeclaration({ intent: base.intent }), seedKey(1).priv, "1114");
      return decideFirewall({ ...base, declaration: cross });
    },
    oracle: deniedWith(/SIGNER_MISMATCH|NOT_PROVEN/),
  });
});

r("4 kind/scheme mismatch ⇒ DENY", async () => {
  const base = await allowedInputs({});
  await attackCheck({
    id: "A7.4",
    attempt: async () => {
      const d = JSON.parse(JSON.stringify(base.declaration));
      d.signerBinding.kind = "EIP1271";
      return decideFirewall({ ...base, declaration: d });
    },
    oracle: ({ decision, record, predicate, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (decision === "ALLOW") return { verdict: "DEFEATED", reason: "kind-mismatched envelope ALLOWed" };
      if (decision !== "DENY") return { verdict: "DEFEATED", reason: `expected DENY, got ${decision}` };
      if (!/binding:/.test(record.reason || "")) return { verdict: "DEFEATED", reason: "must cite the binding term" };
      return { verdict: "HELD" };
    },
  });
});

r("5 malformed r/s/v ⇒ SIG_MALFORMED ⇒ DENY", async () => {
  const base = await allowedInputs({});
  const patches = [
    { r: "00".repeat(32) },
    { s: "00".repeat(32) },
    { v: 29 },
    { r: "abc" },
  ];
  for (const patch of patches) {
    await attackCheck({
      id: `A7.5[${Object.keys(patch)[0]}=${patch[Object.keys(patch)[0]]}]`,
      attempt: async () => {
        const d = { ...JSON.parse(JSON.stringify(base.declaration)), signature: { ...base.declaration.signature, ...patch } };
        return decideFirewall({ ...base, declaration: d });
      },
      oracle: ({ decision, record, _thrown }) => {
        if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
        if (decision === "ALLOW") return { verdict: "DEFEATED", reason: "malformed signature ALLOWed" };
        if (decision === "DENY") return { verdict: "HELD" };
        return { verdict: "DEFEATED", reason: `expected DENY, got ${decision}` };
      },
    });
  }
});

r("6 EIP-1271 with missing injected adapters/providers/state ⇒ NOT_RUN ⇒ DENY", async () => {
  const { intent, declaration } = await contractDeclaration();
  const manifestId = await computeDeclarationId(declaration);
  const base = {
    intent,
    declaration,
    policy: (await allowedInputs({})).policy,
    activePolicyIds: ["pol-default"],
    simulation: makeSimulation({}, intent),
    authorityAtState: "1024",
    blockTimestamp: "1",
  };
  await attackCheck({
    id: "A7.6[no-evm]",
    attempt: async () => decideFirewall({ ...base, evm: undefined, contractAuth: providersFor(Number(CHAIN), manifestId) }),
    oracle: deniedWith(/EVM_ADAPTER_UNAVAILABLE/),
  });
  await attackCheck({
    id: "A7.6[no-providers]",
    attempt: async () => decideFirewall({ ...base, evm: EVM, contractAuth: undefined }),
    oracle: deniedWith(/NO_PROVIDERS/),
  });
  await attackCheck({
    id: "A7.6[no-state]",
    attempt: async () => decideFirewall({ ...base, evm: EVM, contractAuth: providersFor(Number(CHAIN), manifestId), authorityAtState: undefined }),
    oracle: deniedWith(/NO_AUTHORITY_STATE/),
  });
});

r("7 EIP-1271 revert / wrong magic / empty code ⇒ NOT_PROVEN ⇒ DENY", async () => {
  const { intent, declaration } = await contractDeclaration();
  const base = {
    intent,
    declaration,
    policy: (await allowedInputs({})).policy,
    activePolicyIds: ["pol-default"],
    simulation: makeSimulation({}, intent),
    authorityAtState: "1024",
    blockTimestamp: "1",
    evm: EVM,
  };
  await attackCheck({
    id: "A7.7[revert]",
    attempt: async () => decideFirewall({ ...base, contractAuth: { ethCall: async () => ({ ok: false, code: "REVERTED" }), getCode: async () => "0x60806040" } }),
    oracle: deniedWith(/REVERTED/),
  });
  await attackCheck({
    id: "A7.7[wrong-magic]",
    attempt: async () => decideFirewall({ ...base, contractAuth: { ethCall: async () => ({ ok: true, data: "0x" + "ff".repeat(4) + "00".repeat(28) }), getCode: async () => "0x60806040" } }),
    oracle: deniedWith(/NOT_MAGIC/),
  });
  await attackCheck({
    id: "A7.7[empty-code]",
    attempt: async () => decideFirewall({ ...base, contractAuth: { ethCall: async () => ({ ok: true, data: "0x" + "ff".repeat(4) + "00".repeat(28) }), getCode: async () => "0x" } }),
    oracle: deniedWith(/NO_CODE_AT_STATE/),
  });
});

r("8 EOA path without injected evm ⇒ NOT_RUN ⇒ DENY (never fabricated)", async () => {
  const base = await allowedInputs({});
  await attackCheck({
    id: "A7.8",
    attempt: async () => decideFirewall({ ...base, evm: undefined }),
    oracle: deniedWith(/EVM_ADAPTER_UNAVAILABLE/),
  });
});