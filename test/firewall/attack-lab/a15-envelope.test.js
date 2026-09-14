/**
 * A15 — SIGNATURE ENVELOPE MALFORMATION (design §6).
 *
 * FAMILY ORACLE: the envelope (version/kind/signerBinding/signature rsv) is
 * validated and re-derived — a malformed envelope never binds, never recovers,
 * ⇒ DENY. The manifestId is NEVER trusted from the declaration.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { decideFirewall } from "../../../packages/firewall/index.js";
import { attackCheck, allowedInputs } from "./helpers.js";
import { makeAddress } from "../helpers.js";

const r = (name, fn) => test(`A15.${name}`, fn);

const denyOracle = ({ decision, record, _thrown }) => {
  if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
  if (decision === "ALLOW") return { verdict: "DEFEATED", reason: "malformed envelope ALLOWed" };
  if (decision !== "DENY") return { verdict: "DEFEATED", reason: `expected DENY, got ${decision}` };
  return { verdict: "HELD" };
};

r("1 missing signature envelope ⇒ DENY (binding refuses)", async () => {
  const base = await allowedInputs({});
  await attackCheck({
    id: "A15.1",
    attempt: async () => {
      const d = JSON.parse(JSON.stringify(base.declaration));
      delete d.signature;
      return decideFirewall({ ...base, declaration: d });
    },
    oracle: denyOracle,
  });
});

r("2 malformed r/s/v envelopes ⇒ DENY (never recovers)", async () => {
  const base = await allowedInputs({});
  const cases = [
    { r: "0x1234" },
    { r: "abc" },
    { s: "0x" },
    { v: 42 },
    { r: "0x" + "00".repeat(32), s: "0x" + "00".repeat(32), v: 28 },
  ];
  for (const patch of cases) {
    await attackCheck({
      id: `A15.2[${JSON.stringify(patch).slice(0, 40)}]`,
      attempt: async () => {
        const d = { ...JSON.parse(JSON.stringify(base.declaration)), signature: { ...base.declaration.signature, ...patch } };
        return decideFirewall({ ...base, declaration: d });
      },
      oracle: denyOracle,
    });
  }
});

r("3 signerBinding.address missing/invalid ⇒ DENY", async () => {
  const base = await allowedInputs({});
  for (const address of [undefined, "nope", "0x1234", makeAddress(0x55)]) {
    await attackCheck({
      id: `A15.3[address=${String(address).slice(0, 12)}]`,
      attempt: async () => {
        const d = JSON.parse(JSON.stringify(base.declaration));
        d.signerBinding = { ...d.signerBinding, address };
        return decideFirewall({ ...base, declaration: d });
      },
      oracle: denyOracle,
    });
  }
});

r("4 invalid envelope version/kind ⇒ DECLARATION_INVALID ⇒ DENY", async () => {
  const base = await allowedInputs({});
  for (const patch of [{ version: "CGEP/9" }, { kind: "SOMETHING_ELSE" }]) {
    await attackCheck({
      id: `A15.4[${Object.keys(patch)[0]}=${patch[Object.keys(patch)[0]]}]`,
      attempt: async () => {
        const d = { ...JSON.parse(JSON.stringify(base.declaration)), ...patch };
        return decideFirewall({ ...base, declaration: d });
      },
      oracle: ({ decision, record, _thrown }) => {
        if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
        if (decision !== "DENY") return { verdict: "DEFEATED", reason: `expected DENY, got ${decision}` };
        if (!/DECLARATION_INVALID/.test(record.reason || "")) return { verdict: "DEFEATED", reason: `expected DECLARATION_INVALID, got ${record.reason}` };
        return { verdict: "HELD" };
      },
    });
  }
});

r("5 declared manifestId vs recomputed mismatch ⇒ DENY (never trusts the claim)", async () => {
  const base = await allowedInputs({});
  const recomputed = await (await import("../../../packages/firewall/binding.js")).computeDeclarationId(base.declaration);
  await attackCheck({
    id: "A15.5",
    attempt: async () => {
      const d = JSON.parse(JSON.stringify(base.declaration));
      d.manifestId = "0x" + "ee".repeat(32);
      d.signature = undefined;
      return decideFirewall({ ...base, declaration: d });
    },
    oracle: ({ decision, record, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (decision !== "DENY") return { verdict: "DEFEATED", reason: `expected DENY, got ${decision}` };
      if (!/DECLARATION_NOT_BOUND/.test(record.reason || "")) return { verdict: "DEFEATED", reason: `expected DECLARATION_NOT_BOUND, got ${record.reason}` };
      return { verdict: "HELD" };
    },
  });
});

r("6 stale signature under a re-derived manifest ⇒ DENY (manifestId != recomputed)", async () => {
  const base = await allowedInputs({});
  const other = await allowedInputs({ intent: { nonce: "777" } });
  await attackCheck({
    id: "A15.6",
    attempt: async () => {
      const stale = JSON.parse(JSON.stringify(base.declaration));
      stale.manifestId = other.declaration.manifestId;
      return decideFirewall({ ...base, declaration: stale, intent: other.intent });
    },
    oracle: denyOracle,
  });
});