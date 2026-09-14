/**
 * A12 — FORBIDDEN-TOKEN smuggling through each PRE channel (design §6).
 *
 * FAMILY ORACLE: smuggling post-execution evidence through ANY channel must
 * NEVER escalate the decision. Two checks per channel: (a) the channel is
 * rejected / binds to DENY when the token rides inside it, and (b) a DENY
 * baseline with an embedded token stays DENY — forbidden data cannot flip a
 * negative verdict. IN1 is asserted EXPLICITLY per produced record.
 */

import { test } from "node:test";

import { decideFirewall } from "../../../packages/firewall/index.js";
import { hashPolicy } from "../../../packages/canonical/index.js";
import {
  attackCheck,
  assertNoPostExecutionArtifacts,
  allowedInputs,
  FORBIDDEN_TOKENS,
  FORBIDDEN_EQUIVALENTS,
} from "./helpers.js";
import { makePolicy } from "../helpers.js";

const r = (name, fn) => test(`A12.${name}`, fn);

const TOKENS = [...FORBIDDEN_TOKENS, ...FORBIDDEN_EQUIVALENTS];

/** Universal A12 oracle: never ALLOW; when a record exists it must be IN1-clean. */
const neverAllowsOracle = ({ decision, record, predicate, _thrown }) => {
  if (_thrown) {
    if (_thrown instanceof TypeError) return { verdict: "HELD" };
    return { verdict: "DEFEATED", reason: `unexpected non-TypeError throw: ${_thrown.message}` };
  }
  assertNoPostExecutionArtifacts(record ?? {});
  if (decision === "ALLOW") return { verdict: "DEFEATED", reason: "forbidden evidence ALLOWed a verdict" };
  if (decision === "DENY") return { verdict: "HELD" };
  return { verdict: "DEFEATED", reason: `expected fail-closed DENY, got ${decision}` };
};

r("1 intent channel: a smuggled token inside the intent object ⇒ DENY (binding breaks)", async () => {
  const base = await allowedInputs({});
  for (const key of TOKENS.slice(0, 6)) {
    await attackCheck({
      id: `A12.1[${key}]`,
      attempt: async () => decideFirewall({ ...base, intent: { ...base.intent, [key]: "0x" + "aa".repeat(4) } }),
      oracle: ({ decision, predicate, record, _thrown }) => {
        if (decision === "ALLOW") return { verdict: "DEFEATED", reason: `${key} in intent upgraded to ALLOW` };
        if (decision === "DENY" && predicate?.DECLARATION_BOUND === false) return { verdict: "HELD" };
        return { verdict: "DEFEATED", reason: `${key} must break the binding, got ${decision}` };
      },
    });
  }
});

r("2 declaration channel: a smuggled token inside the declaration ⇒ DENY (manifest re-derived)", async () => {
  const base = await allowedInputs({});
  for (const key of TOKENS.slice(0, 6)) {
    await attackCheck({
      id: `A12.2[${key}]`,
      attempt: async () => {
        const d = JSON.parse(JSON.stringify(base.declaration));
        d[key] = "0x" + "bb".repeat(4);
        d.signature = undefined;
        return decideFirewall({ ...base, declaration: d });
      },
      oracle: ({ decision, predicate, record, _thrown }) => {
        if (decision === "ALLOW") return { verdict: "DEFEATED", reason: `${key} in declaration upgraded to ALLOW` };
        if (decision === "DENY" && predicate?.DECLARATION_BOUND === false) return { verdict: "HELD" };
        return { verdict: "DEFEATED", reason: `${key} must break the binding, got ${decision}` };
      },
    });
  }
});

r("3 policy channel: a smuggled token past the claimed commitment ⇒ DENY (hash mismatch)", async () => {
  const base = await allowedInputs({});
  const claim = await hashPolicy(base.policy);
  for (const key of TOKENS.slice(0, 6)) {
    await attackCheck({
      id: `A12.3[${key}]`,
      attempt: async () => {
        const policy = { ...base.policy, [key]: "0x" + "cc".repeat(4) };
        return decideFirewall({ ...base, policy, expectedPolicyHash: claim });
      },
      oracle: ({ decision, record, _thrown }) => {
        if (decision === "ALLOW") return { verdict: "DEFEATED", reason: `${key} in policy upgraded to ALLOW` };
        if (decision === "DENY" && /POLICY_HASH_MISMATCH/.test(record.policy?.label || "")) return { verdict: "HELD" };
        return { verdict: "DEFEATED", reason: `${key} must break the commitment, got ${decision}` };
      },
    });
  }
});

r("4 simulation channel: a smuggled token in the closed model ⇒ boundary rejection", async () => {
  const base = await allowedInputs({});
  for (const key of TOKENS.slice(0, 6)) {
    await attackCheck({
      id: `A12.4[${key}]`,
      attempt: async () => decideFirewall({ ...base, simulation: { ...base.simulation, [key]: "smuggled" } }),
      oracle: neverAllowsOracle,
    });
  }
});

r("5 no-negative-flip: a DENY baseline with embedded tokens stays DENY", async () => {
  const denyPolicy = makePolicy([{ ruleId: "v", type: "VALUE_LIMIT", severity: "HIGH", params: { max: "1" } }]);
  for (const key of TOKENS.slice(0, 6)) {
    await attackCheck({
      id: `A12.5[${key}]`,
      attempt: async () => {
        const base = await allowedInputs({ policy: denyPolicy });
        const { decision: baseDeny } = await decideFirewall(base);
        if (baseDeny !== "DENY") throw new Error("harness sanity: DENY baseline expected");
        return decideFirewall({ ...base, intent: { ...base.intent, [key]: "0x" + "dd".repeat(4) } });
      },
      oracle: ({ decision, predicate, record, _thrown }) => {
        if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
        assertNoPostExecutionArtifacts(record ?? {});
        if (decision === "ALLOW") return { verdict: "DEFEATED", reason: `${key} flipped a DENY baseline to ALLOW` };
        if (decision === "DENY") return { verdict: "HELD" };
        return { verdict: "DEFEATED", reason: `expected DENY preserved, got ${decision}` };
      },
    });
  }
});