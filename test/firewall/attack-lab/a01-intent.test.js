/**
 * A1 — INTENT mutation matrix (design §6, v0.1.2).
 *
 * FAMILY ORACLE (this file): a post-signing mutation of the signed intent
 * that is not backed by a freshly valid declaration/signature MUST NOT produce
 * ALLOW — it breaks DECLARATION_BOUND ⇒ DENY. The row passes as HELD only when
 * the observed decision is DENY AND DECLARATION_BOUND is false. A new
 * consistent declaration/signature over the mutated intent is a NEW
 * AUTHORIZATION (tested canonically in A13/A16), not a "mutation".
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { decideFirewall } from "../../../packages/firewall/index.js";
import { attackCheck, allowedInputs, CONTRACT_ADDR } from "./helpers.js";
import { makeAddress } from "../helpers.js";

const r = (name, fn) => test(`A1.${name}`, fn);

/** Family oracle: any post-signing intent mutation ⇒ DENY with broken binding. */
const intentMutationOracle = ({ decision, predicate, _thrown }) => {
  if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
  if (decision === "DENY" && predicate?.DECLARATION_BOUND === false) return { verdict: "HELD" };
  if (decision === "ALLOW") return { verdict: "DEFEATED", reason: "mutated intent ALLOWed — post-signing mutation survived without a new authorization" };
  return { verdict: "DEFEATED", reason: `expected fail-closed DENY, got ${decision}` };
};

async function mutateIntent(intentPatch) {
  const base = await allowedInputs({ intent: intentPatch, simulation: undefined });
  // Original signed declaration stays bound to the ORIGINAL intent — the
  // mutated intent below is what the adversary feeds the engine.
  const original = await allowedInputs({});
  const mutated = { ...original.intent, ...intentPatch };
  const modelFields = ["target", "selector", "recipient", "amount"];
  const simPatch = Object.fromEntries(modelFields.filter((k) => k in mutated).map((k) => [k, mutated[k]]));
  return {
    ...base,
    intent: mutated,
    declaration: original.declaration,
    policy: original.policy,
    activePolicyIds: original.activePolicyIds,
    simulation: { ...original.simulation, ...simPatch },
    authorityAtState: original.authorityAtState,
    evm: original.evm,
  };
}

r("1 recipient after signing", async () => {
  await attackCheck({
    id: "A1.1",
    attempt: async () => decideFirewall(await mutateIntent({ recipient: makeAddress(0xee) })),
    oracle: intentMutationOracle,
  });
});

r("2 amount after signing (hex-decimal form)", async () => {
  await attackCheck({
    id: "A1.2",
    attempt: async () => decideFirewall(await mutateIntent({ amount: "0x999" })),
    oracle: intentMutationOracle,
  });
});

r("3 selector / calldata after signing", async () => {
  await attackCheck({
    id: "A1.3",
    attempt: async () => decideFirewall(await mutateIntent({ selector: "0xdeadbeef" })),
    oracle: intentMutationOracle,
  });
});

r("4 target after signing", async () => {
  await attackCheck({
    id: "A1.4",
    attempt: async () => decideFirewall(await mutateIntent({ target: makeAddress(0xab) })),
    oracle: intentMutationOracle,
  });
});

r("5 chainId after signing (cross-chain mutation)", async () => {
  await attackCheck({
    id: "A1.5",
    attempt: async () => decideFirewall(await mutateIntent({ chainId: "1114" })),
    oracle: intentMutationOracle,
  });
});

r("6 nonce after signing (replay under mutation)", async () => {
  await attackCheck({
    id: "A1.6",
    attempt: async () => decideFirewall(await mutateIntent({ nonce: "999" })),
    oracle: intentMutationOracle,
  });
});

r("7 validAfter/validUntil after signing — in-window mutation still breaks DECLARATION_BOUND", async () => {
  await attackCheck({
    id: "A1.7",
    attempt: async () => decideFirewall(await mutateIntent({ validAfter: "1", validUntil: "90000" })),
    oracle: ({ decision, predicate, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (decision === "ALLOW") return { verdict: "DEFEATED", reason: "in-window deadline mutation kept an ALLOW alive" };
      if (decision === "DENY" && predicate?.DECLARATION_BOUND === false) return { verdict: "HELD" };
      return { verdict: "DEFEATED", reason: `expected fail-closed DENY, got ${decision}` };
    },
  });
});

r("7b out-of-window deadline mutation fails the deadline predicate too", async () => {
  const base = await allowedInputs({});
  await attackCheck({
    id: "A1.7b",
    attempt: async () =>
      decideFirewall({ ...base, intent: { ...base.intent, validUntil: "0" }, declaration: base.declaration }),
    oracle: ({ decision, predicate, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (decision === "ALLOW") return { verdict: "DEFEATED", reason: "out-of-window mutation ALLOWed" };
      if (decision === "DENY") return { verdict: "HELD" };
      return { verdict: "DEFEATED", reason: `expected DENY, got ${decision}` };
    },
  });
});

r("8 signer after signing (authority substitution)", async () => {
  await attackCheck({
    id: "A1.8",
    attempt: async () => decideFirewall(await mutateIntent({ signer: CONTRACT_ADDR })),
    oracle: intentMutationOracle,
  });
});

r("9 constraints/action after signing (consequence not asserted)", async () => {
  await attackCheck({
    id: "A1.9",
    attempt: async () =>
      decideFirewall(await mutateIntent({ action: "SWAP", amount: undefined, recipient: makeAddress(0xcc) })),
    oracle: intentMutationOracle,
  });
});