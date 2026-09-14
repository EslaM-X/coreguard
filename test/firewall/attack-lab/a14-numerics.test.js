/**
 * A14 — NUMERIC PRECISION / FINITE-MATH (design §6).
 *
 * FAMILY ORACLE: value comparisons are exact BigInt math. A numerically-bad
 * input never upgrades to ALLOW — it fails closed (DENY / NOT_RUN) or compares
 * exactly. Hex-form amounts FAIL CLOSED (BigInt refutes non-decimal) — never
 * silently equal; JS Number rounding never satisfies an exact big comparison.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { decideFirewall } from "../../../packages/firewall/index.js";
import { decisionRecordRef } from "../../../packages/firewall/decision-record.js";
import { attackCheck, allowedInputs } from "./helpers.js";
import { makePolicy } from "../helpers.js";

const r = (name, fn) => test(`A14.${name}`, fn);

/** Oracle: exact numeric equality must ALLOW; anything approximate must not. */
const exactAllowsOracle = ({ decision, record, _thrown }) => {
  if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
  if (decision !== "ALLOW") return { verdict: "DEFEATED", reason: `exact big comparison failed: ${decision}` };
  return { verdict: "HELD" };
};

const neverAllowsOracle = ({ decision, _thrown }) => {
  if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
  if (decision === "ALLOW") return { verdict: "DEFEATED", reason: "imprecise/hex numeric ALLOWed" };
  if (decision === "DENY") return { verdict: "HELD" };
  return { verdict: "DEFEATED", reason: `expected fail-closed DENY, got ${decision}` };
};

const MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

r("1 full uint256-scale amount is compared exactly (no float or overflow upgrade)", async () => {
  const base = await allowedInputs({ intent: { amount: MAX_UINT256 } });
  await attackCheck({
    id: "A14.1",
    attempt: async () => decideFirewall(base),
    oracle: ({ decision, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (decision !== "ALLOW") return { verdict: "DEFEATED", reason: "uint256-scale equality must ALLOW (max amount bound too) — got " + decision };
      return { verdict: "HELD" };
    },
  });
});

r("2 JS Number sim amount equals decimal-string intent exactly (BigInt, not float)", async () => {
  const base = await allowedInputs({ intent: { amount: "5" } });
  await attackCheck({
    id: "A14.2",
    attempt: async () => decideFirewall({ ...base, simulation: { ...base.simulation, amount: 5 } }),
    oracle: exactAllowsOracle,
  });
});

r("3 2^53+1 cannot be satisfied by float-rounded sim — unsafe JS Numbers are rejected", async () => {
  const amount = "9007199254740993"; // 2^53 + 1
  const base = await allowedInputs({ intent: { amount } });

  await attackCheck({
    id: "A14.3[rounded]",
    attempt: async () => decideFirewall({ ...base, simulation: { ...base.simulation, amount: 9007199254740993 } }), // JS Number rounds to 2^53
    oracle: ({ decision, _thrown }) => {
      if (!_thrown) return { verdict: "DEFEATED", reason: "unsafe Number must be REJECTED at the boundary, got " + decision };
      if (/Unsafe JS Number/.test(_thrown.message)) return { verdict: "HELD" };
      return { verdict: "DEFEATED", reason: `expected Unsafe-JS-Number rejection, got: ${_thrown.message}` };
    },
  });

  await attackCheck({
    id: "A14.3[exact-string]",
    attempt: async () => decideFirewall({ ...base, simulation: { ...base.simulation, amount } }),
    oracle: exactAllowsOracle,
  });
});

r("4 hex-form amounts ride exact BigInt math, never silent confusion or signature-spelling", async () => {
  // (a) Numerically-equal hex-decimal pair is CONSISTENT (BigInt math is exact).
  const base = await allowedInputs({ intent: { amount: "0x100" } });
  await attackCheck({
    id: "A14.4[math-equal]",
    attempt: async () => decideFirewall({ ...base, simulation: { ...base.simulation, amount: 256 } }),
    oracle: exactAllowsOracle,
  });

  // (b) A signature bound to the "0x100" spelling cannot ride a "256" intent:
  //     hexadecimal is NOT folded into decimal by the binding (distinct canonical).
  await attackCheck({
    id: "A14.4[spelling-sub]",
    attempt: async () => decideFirewall({ ...base, intent: { ...base.intent, amount: "256" } }),
    oracle: ({ decision, predicate, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (decision !== "DENY") return { verdict: "DEFEATED", reason: `spelling substitution must DENY, got ${decision}` };
      if (predicate?.DECLARATION_BOUND !== false) return { verdict: "DEFEATED", reason: "must fail on DECLARATION_BOUND" };
      return { verdict: "HELD" };
    },
  });

  // (c) Hex-form VALUE_LIMIT param enforces the exact boundary.
  const hexParam = makePolicy([{ ruleId: "v", type: "VALUE_LIMIT", severity: "HIGH", params: { max: "0x100" } }]);
  await attackCheck({
    id: "A14.4[at-hex-boundary]",
    attempt: async () => decideFirewall(await allowedInputs({ policy: hexParam, intent: { amount: "256" } })),
    oracle: exactAllowsOracle,
  });
  await attackCheck({
    id: "A14.4[over-hex-boundary]",
    attempt: async () => decideFirewall(await allowedInputs({ policy: hexParam, intent: { amount: "257" } })),
    oracle: ({ decision, record, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (decision !== "DENY") return { verdict: "DEFEATED", reason: `1 over the hex limit must DENY, got ${decision}` };
      if (!/POLICY_VIOLATED/.test(record.policy?.label || "")) return { verdict: "DEFEATED", reason: `expected POLICY_VIOLATED, got ${record.policy?.label}` };
      return { verdict: "HELD" };
    },
  });

  // (d) Numerically-DIFFERENT hex vs decimal forms are caught (257(n) ≠ 256).
  await attackCheck({
    id: "A14.4[math-differ]",
    attempt: async () => decideFirewall({ ...base, intent: { ...base.intent, amount: "0x101" }, simulation: { ...base.simulation, amount: "256" } }),
    oracle: neverAllowsOracle,
  });
});

r("5 decimal VALUE_LIMIT is enforced exactly at the boundary", async () => {
  const under = makePolicy([{ ruleId: "v", type: "VALUE_LIMIT", severity: "HIGH", params: { max: "1000" } }]);
  await attackCheck({
    id: "A14.5[at-limit]",
    attempt: async () => decideFirewall(await allowedInputs({ policy: under, intent: { amount: "1000" } })),
    oracle: exactAllowsOracle,
  });
  await attackCheck({
    id: "A14.5[over-limit]",
    attempt: async () => decideFirewall(await allowedInputs({ policy: under, intent: { amount: "1001" } })),
    oracle: ({ decision, record, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (decision !== "DENY") return { verdict: "DEFEATED", reason: `1 over the limit must DENY, got ${decision}` };
      if (!/POLICY_VIOLATED/.test(record.policy?.label || "")) return { verdict: "DEFEATED", reason: "over-limit must cite POLICY_VIOLATED" };
      return { verdict: "HELD" };
    },
  });
});

r("6 decimal vs hex canonical forms are DISTINCT records (no cross-form ref collision)", async () => {
  const dec = await decideFirewall(await allowedInputs({ intent: { amount: "256" } }));
  const hex = await decideFirewall(await allowedInputs({ intent: { amount: "0x100" } }));
  assert.notEqual(hex.record.decisionRef, dec.record.decisionRef);
  assert.notEqual(await decisionRecordRef(hex.record), await decisionRecordRef(dec.record));
});