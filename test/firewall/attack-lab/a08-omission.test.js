/**
 * A8 — INPUT-OMISSION MATRIX (design §6 / oracle IN3).
 *
 * FAMILY ORACLE: every omission of an input the engine requires to PROVE a
 * PRE predicate falls closed (DENY / NOT_RUN) — with a frozen, content-addressed
 * record. Omissions the closed model does not consume (EOA path never reads
 * authorityAtState; review writer matters only under a configured path) are
 * NON-EXPLOITABLE — they never widen an authorization.
 *
 * §11 REMEDIATION (owner-approved): missing/invalid `intent` now fails closed
 * with a frozen DENY record (INTENT_MISSING / NOT_RUN) instead of throwing a
 * TypeError. Pinned here as A8.1.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { decideFirewall } from "../../../packages/firewall/index.js";
import { computeDeclarationId } from "../../../packages/firewall/binding.js";
import { attackCheck, allowedInputs, assertNoPostExecutionArtifacts, contractDeclaration, providersFor, CHAIN } from "./helpers.js";
import { makeSimulation } from "../helpers.js";
import * as EVM from "../../../packages/evm/index.js";

const r = (name, fn) => test(`A8.${name}`, fn);

/** Oracle: omission must yield DENY, frozen record, no post-exec artifact. */
const omitDenyOracle = (labelRe) =>
  ({ decision, record, predicate, _thrown }) => {
    if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
    assertNoPostExecutionArtifacts(record ?? {});
    if (decision === "ALLOW") return { verdict: "DEFEATED", reason: "omission ALLOWed" };
    if (decision !== "DENY") return { verdict: "DEFEATED", reason: `expected DENY, got ${decision}` };
    assert.ok(Object.isFrozen(record), "IN2: record must be frozen");
    assert.ok(record.decisionRef?.startsWith("0x"), "record must carry a content-derived ref");
    const haystack = `${record.reason ?? ""} ${record.policy?.label ?? ""} ${predicate ? "" : ""}`;
    if (labelRe && !labelRe.test(haystack)) {
      return { verdict: "DEFEATED", reason: `expected label ~ ${labelRe}, got reason=${record.reason}` };
    }
    return { verdict: "HELD" };
  };

r("1 missing intent ⇒ DENY (NOT_RUN, fail-closed) with frozen record and deterministic ref (NO crash)", async () => {
  const base = await allowedInputs({});
  const first = await decideFirewall({ ...base, intent: undefined });
  const second = await decideFirewall({ ...base, intent: undefined });
  assert.equal(first.decision, "DENY");
  assert.equal(Object.isFrozen(first.record), true);
  assert.ok(first.record.decisionRef?.startsWith("0x"));
  assert.equal(second.record.decisionRef, first.record.decisionRef, "deterministic even on omitted-intent path");
  await attackCheck({
    id: "A8.1",
    attempt: async () => first,
    oracle: omitDenyOracle(/INTENT_MISSING|NOT_RUN/),
  });
});

r("2 every other model input omission falls closed (DENY) — oracle IN3", async () => {
  const cases = [
    ["declaration", /DECLARATION_MISSING/],
    ["policy", /POLICY_UNVERIFIABLE/],
    ["activePolicyIds", /ACTIVATION_UNKNOWN/],
    ["evm", /EVM_ADAPTER_UNAVAILABLE/],
  ];
  for (const [key, label] of cases) {
    const base = await allowedInputs({});
    await attackCheck({
      id: `A8.2[${key}]`,
      attempt: async () => decideFirewall({ ...base, [key]: undefined }),
      oracle: omitDenyOracle(label),
    });
  }
});

r("3 authorityAtState omission is NON-EXPLOITABLE on the EOA path (never consumed)", async () => {
  const base = await allowedInputs({});
  const missing = await decideFirewall({ ...base, authorityAtState: undefined });
  const garbage = await decideFirewall({ ...base, authorityAtState: "abc-def-garbage" });
  const present = await decideFirewall({ ...base, authorityAtState: "1024" });
  // EOA probe never reads authorityAtState: missing / garbage / present all
  // yield the SAME decision + SAME authority label (RECOVERED_SIGNER). The
  // decisionRef differs only because the record ECHOES the input, never because
  // the field influenced the verdict.
  assert.equal(missing.decision, "ALLOW");
  assert.equal(garbage.decision, "ALLOW");
  assert.equal(present.decision, "ALLOW");
  assert.equal(missing.record.authorityInputs.label, "RECOVERED_SIGNER");
  assert.equal(garbage.record.authorityInputs.label, "RECOVERED_SIGNER");
  await attackCheck({
    id: "A8.3",
    attempt: async () => garbage,
    oracle: ({ decision, record, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (decision !== "ALLOW") return { verdict: "DEFEATED", reason: `EOA baseline must ALLOW, got ${decision}` };
      if (record.authorityInputs.label !== "RECOVERED_SIGNER") return { verdict: "DEFEATED", reason: `EOA probe must not consume the field, got ${record.authorityInputs.label}` };
      return { verdict: "NON-EXPLOITABLE" };
    },
  });
});

r("4 contract-authority path DOES require authorityAtState (NO_AUTHORITY_STATE ⇒ DENY)", async () => {
  const { intent, declaration } = await contractDeclaration();
  const base = {
    intent,
    declaration,
    policy: (await allowedInputs({})).policy,
    activePolicyIds: ["pol-default"],
    simulation: makeSimulation({}, intent),
    blockTimestamp: "1",
    evm: EVM,
    contractAuth: providersFor(Number(CHAIN), await computeDeclarationId(declaration)),
    authorityAtState: undefined,
  };
  await attackCheck({
    id: "A8.4",
    attempt: async () => decideFirewall(base),
    oracle: omitDenyOracle(/NO_AUTHORITY_STATE/),
  });
});

r("5 blockTimestamp default is controller-owned, not caller-widenable", async () => {
  const base = await allowedInputs({});
  await attackCheck({
    id: "A8.5",
    attempt: async () => decideFirewall({ ...base, blockTimestamp: "200000", simulation: { ...base.simulation, blockTimestamp: "200000" } }),
    oracle: ({ decision, record, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (decision === "ALLOW") return { verdict: "DEFEATED", reason: "caller widened the window to ALLOW" };
      if (decision === "DENY") return { verdict: "HELD" };
      return { verdict: "DEFEATED", reason: `expected DENY, got ${decision}` };
    },
  });
});