/**
 * A4 — POLICY commitment + trust-anchor (design §6, Q-FW3/3a/3b).
 *
 * FAMILY ORAcles:
 *  - A4.1–3: policy is commitment-verified (hash recomputed, never trusted) —
 *            any content change w.r.t. the declared hash ⇒ DENY.
 *  - A4.4:   trust anchors reachability — a policy not reachable from the
 *            anchors is not trusted ⇒ DENY.
 *  - A4.5:   positive control — a correctly-committed, active, trusted policy
 *            with truthful rules ALLOWs (the oracle is meaningful).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { decideFirewall } from "../../../packages/firewall/index.js";
import { hashPolicy } from "../../../packages/canonical/index.js";
import { attackCheck, allowedInputs } from "./helpers.js";
import { makeAddress, makePolicy } from "../helpers.js";

const r = (name, fn) => test(`A4.${name}`, fn);

const failClosedOracle = (mustAssertPolicy) =>
  ({ decision, record, predicate, _thrown }) => {
    if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
    if (decision === "ALLOW") return { verdict: "DEFEATED", reason: "tampered/unknown policy ALLOWed" };
    if (decision !== "DENY") return { verdict: "DEFEATED", reason: `expected DENY, got ${decision}` };
    if (mustAssertPolicy) {
      assert.ok(record.policy.label, "record must carry the policy verdict label");
    }
    return { verdict: "HELD" };
  };

r("1 tampering a committed policy (content change) ⇒ POLICY_HASH_MISMATCH ⇒ DENY", async () => {
  const base = await allowedInputs({});
  const claim = await hashPolicy(base.policy);
  const tampered = { ...base.policy, rules: [...base.policy.rules, { ruleId: "x", type: "VALUE_LIMIT", severity: "HIGH", params: { max: "0" } }] };
  await attackCheck({
    id: "A4.1",
    attempt: async () => decideFirewall({ ...base, policy: tampered, expectedPolicyHash: claim }),
    oracle: ({ decision, record, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (decision !== "DENY") return { verdict: "DEFEATED", reason: `expected DENY, got ${decision}` };
      if (!/POLICY_HASH_MISMATCH/.test(record.policy.label || "")) return { verdict: "DEFEATED", reason: `expected POLICY_HASH_MISMATCH, got ${record.policy.label}` };
      return { verdict: "HELD" };
    },
  });
});

r("2 silent rollback rejected: committed policy re-pointed to an older policyId ⇒ DENY", async () => {
  const base = await allowedInputs({});
  const claim = await hashPolicy(base.policy);
  const rollback = makePolicy([{ ruleId: "l", type: "VALUE_LIMIT", severity: "HIGH", params: { max: "0" } }]);
  await attackCheck({
    id: "A4.2",
    attempt: async () => decideFirewall({ ...base, policy: rollback, expectedPolicyHash: claim }),
    oracle: failClosedOracle(true),
  });
});

r("3 unknown/foreign policy with a self-declared hash is not trusted (no free hash claim)", async () => {
  const base = await allowedInputs({});
  const foreign = makePolicy([{ ruleId: "f", type: "VALUE_LIMIT", severity: "HIGH", params: { max: "999" } }]);
  await attackCheck({
    id: "A4.3",
    attempt: async () => decideFirewall({ ...base, policy: foreign, expectedPolicyHash: await hashPolicy(foreign) }),
    oracle: ({ decision, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      // A caller-declared hash matching the foreign object is a CLAIM, not a
      // trust anchor for execution: the engine's observable behavior is that
      // non-verified/bypass attempts must not ALLOW on the caller's word.
      if (decision === "ALLOW") return { verdict: "DEFEATED", reason: "foreign policy with self-declared hash must not gate ALLOW (claim ≠ anchor)" };
      if (decision === "DENY") return { verdict: "HELD" };
      return { verdict: "DEFEATED", reason: `expected fail-closed, got ${decision}` };
    },
  });
});

r("4 policy outside the trust anchors ⇒ POLICY_NOT_TRUSTED ⇒ DENY", async () => {
  const base = await allowedInputs({});
  const trusted = makePolicy([{ ruleId: "v", type: "VALUE_LIMIT", severity: "HIGH", params: { max: "999999" } }]);
  const untrusted = { ...trusted, policyId: "pol-fake" };
  await attackCheck({
    id: "A4.4",
    attempt: async () =>
      decideFirewall({
        ...base,
        policy: untrusted,
        expectedPolicyHash: await hashPolicy(untrusted),
        activePolicyIds: ["pol-fake"],
        policyTrust: { anchors: [makeAddress(0x77)] },
      }),
    oracle: ({ decision, record, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (decision !== "DENY") return { verdict: "DEFEATED", reason: `expected DENY, got ${decision}` };
      assert.ok(/POLICY_NOT_TRUSTED/.test(record.policy.label || ""), `expected POLICY_NOT_TRUSTED, got ${record.policy.label}`);
      return { verdict: "HELD" };
    },
  });
});

r("5 positive control — committed, active, trusted policy with truthful rules ALLOWs", async () => {
  const base = await allowedInputs({});
  await attackCheck({
    id: "A4.5",
    attempt: async () => decideFirewall(base),
    oracle: ({ decision, predicate, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (decision !== "ALLOW") return { verdict: "DEFEATED", reason: `baseline must ALLOW, got ${decision}` };
      if (predicate?.POLICY_SATISFIED !== true) return { verdict: "DEFEATED", reason: "ALLOW without POLICY_SATISFIED" };
      return { verdict: "HELD" };
    },
  });
});