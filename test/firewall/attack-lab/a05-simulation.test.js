/**
 * A5 — SIMULATION-field mutation matrix (design §6).
 *
 * FAMILY ORACLE: closed model — a tampered simulation field (vs the declared
 * scope) must land on DENY with the sim term broken (sim:inconsistent); the
 * closed model throws on any key outside the whitelist. Unmodelable cases go
 * to REQUIRE_REVIEW ONLY on a review-eligible path — never ALLOW.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { decideFirewall } from "../../../packages/firewall/index.js";
import { attackCheck, allowedInputs } from "./helpers.js";
import { makePolicy, makeSimulation, makeAddress, DEFAULT_REVIEW_PATH } from "../helpers.js";

const r = (name, fn) => test(`A5.${name}`, fn);

const denyOracle = ({ decision, record, _thrown }) => {
  if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
  if (decision === "ALLOW") return { verdict: "DEFEATED", reason: "tampered simulation ALLOWed" };
  if (decision !== "DENY") return { verdict: "DEFEATED", reason: `expected DENY, got ${decision}` };
  if (!/sim:/.test(record.reason || "")) return { verdict: "DEFEATED", reason: "must cite the simulation term" };
  return { verdict: "HELD" };
};

r("1 tamper each closed-model field vs the declared scope ⇒ DENY (sim:inconsistent)", async () => {
  const base = await allowedInputs({});
  const tamper = [
    (s) => ({ ...s, target: makeAddress(0xfa) }),
    (s) => ({ ...s, selector: "0xdeadbeef" }),
    (s) => ({ ...s, recipient: makeAddress(0xfb) }),
    (s) => ({ ...s, amount: "999" }),
  ];
  for (const f of tamper) {
    await attackCheck({
      id: `A5.1[${Object.keys(f(base.simulation))[0]}tampered]`,
      attempt: async () => decideFirewall({ ...base, simulation: f(base.simulation) }),
      oracle: denyOracle,
    });
  }
});

r("1b deadline timestamp tampering ⇒ DENY (does not widen the window)", async () => {
  for (const blockTimestamp of ["200000", "-1"]) {
    const base = await allowedInputs({});
    await attackCheck({
      id: `A5.1b[ts=${blockTimestamp}]`,
      attempt: async () => decideFirewall({ ...base, simulation: { ...base.simulation, blockTimestamp } }),
      oracle: denyOracle,
    });
  }
});

r("2 SWAP without received ⇒ unmodelable ⇒ REQUIRE_REVIEW (path) / DENY (no path); never ALLOW", async () => {
  const base = await allowedInputs({ intent: { action: "SWAP" }, simulation: undefined });

  await attackCheck({
    id: "A5.2[path]",
    attempt: async () => decideFirewall({ ...base, reviewPath: DEFAULT_REVIEW_PATH([makeAddress(0x77)]) }),
    oracle: ({ decision, record, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (decision !== "REQUIRE_REVIEW") return { verdict: "DEFEATED", reason: `expected REQUIRE_REVIEW (review-eligible), got ${decision}` };
      if (record.unmodelable !== true) return { verdict: "DEFEATED", reason: "must be marked unmodelable" };
      return { verdict: "HELD" };
    },
  });

  await attackCheck({
    id: "A5.2[no-path]",
    attempt: async () => decideFirewall({ ...base, reviewPath: { configured: false } }),
    oracle: ({ decision, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (decision === "ALLOW") return { verdict: "DEFEATED", reason: "unmodelable SWAP without review ALLOWed" };
      if (decision === "DENY") return { verdict: "HELD" };
      return { verdict: "DEFEATED", reason: `expected DENY, got ${decision}` };
    },
  });
});

r("2b SWAP with non-numeric received ⇒ fails closed ⇒ DENY", async () => {
  const base = await allowedInputs({ intent: { action: "SWAP" }, simulation: undefined });
  const sim = makeSimulation({ received: "not-a-number" }, base.intent);
  await attackCheck({
    id: "A5.2b",
    attempt: async () => decideFirewall({ ...base, simulation: sim }),
    oracle: denyOracle,
  });
});

r("3 MAX_GAS: gasUsed above the committed ceiling ⇒ DENY", async () => {
  const base = await allowedInputs({
    policy: makePolicy([{ ruleId: "g", type: "MAX_GAS", severity: "HIGH", params: { maxGas: "50000" } }]),
  });
  await attackCheck({
    id: "A5.3",
    attempt: async () => decideFirewall({ ...base, simulation: { ...base.simulation, gasUsed: "60000" } }),
    oracle: denyOracle,
  });
});

r("4 missing required model field ⇒ unmodelable (review-eligible) ⇒ only REVIEW/DENY", async () => {
  for (const withPath of [true, false]) {
    const base = await allowedInputs({});
    const partial = { target: base.intent.target, selector: base.intent.selector, recipient: base.intent.recipient };
    await attackCheck({
      id: `A5.4[path=${withPath}]`,
      attempt: async () =>
        decideFirewall({ ...base, simulation: partial, reviewPath: withPath ? DEFAULT_REVIEW_PATH([makeAddress(0x77)]) : { configured: false } }),
      oracle: ({ decision, record, _thrown }) => {
        if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
        const want = withPath ? "REQUIRE_REVIEW" : "DENY";
        if (decision === "ALLOW") return { verdict: "DEFEATED", reason: "unmodelable missing-field simulation ALLOWed" };
        if (decision !== want) return { verdict: "DEFEATED", reason: `expected ${want}, got ${decision}` };
        if (record.unmodelable !== true) return { verdict: "DEFEATED", reason: "must be marked unmodelable" };
        return { verdict: "HELD" };
      },
    });
  }
});

r("5 any extra/non-model key on simulation = invalid input (closed model throws)", async () => {
  const base = await allowedInputs({});
  for (const key of ["txReceipt", "trace", "storageChanges", "blockNumber"]) {
    await attackCheck({
      id: `A5.5[${key}]`,
      attempt: async () => decideFirewall({ ...base, simulation: { ...base.simulation, [key]: "smuggled" } }),
      oracle: ({ _thrown, decision }) => {
        if (_thrown && _thrown instanceof TypeError) return { verdict: "HELD" };
        if (decision === "ALLOW") return { verdict: "DEFEATED", reason: `extra key ${key} survived to ALLOW` };
        return { verdict: "DEFEATED", reason: `extra key ${key} must be rejected with TypeError, got decision=${decision}` };
      },
    });
  }
});