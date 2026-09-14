/**
 * A6 — POST-EXECUTION SMUGGLING CHANNELS (design §6; maps FW-10/FW-10b).
 *
 * FAMILY RULES:
 *  (1) post-execution tokens may NEVER ride into a PRE decision record (IN1);
 *  (2) supplying them at the boundary / closing the sim model is rejected;
 *  (3) extra keys on intent/declaration/policy must NOT upgrade a verdict.
 *
 * This file uses `assertNoPostExecutionArtifacts` EXPLICITLY (never implicit)
 * whenever a record is produced — see A6.7/IN1.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { decideFirewall } from "../../../packages/firewall/index.js";
import { hashPolicy } from "../../../packages/canonical/index.js";
import {
  attackCheck,
  assertNoPostExecutionArtifacts,
  allowedInputs,
  FORBIDDEN_TOKENS,
  FORBIDDEN_EQUIVALENTS,
} from "./helpers.js";

const r = (name, fn) => test(`A6.${name}`, fn);

/** Oracle: the boundary must reject with TypeError — an ALLOW is always DEFEATED. */
const boundaryThrowOracle = (key) =>
  ({ _thrown, decision }) => {
    if (_thrown && _thrown instanceof TypeError) return { verdict: "HELD" };
    if (decision === "ALLOW") return { verdict: "DEFEATED", reason: `${key} smuggled through to ALLOW` };
    return { verdict: "DEFEATED", reason: `${key} must be rejected at the boundary (TypeError), decision=${decision}` };
  };

/** Oracle: full record must be DENY with the term broken, and IN1/IN8 clean. */
const denyRecordsOracle = (expect) =>
  ({ decision, record, predicate, _thrown }) => {
    if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
    assertNoPostExecutionArtifacts(record ?? {});
    if (decision === "ALLOW") return { verdict: "DEFEATED", reason: "smuggled object ALLOWed" };
    if (decision !== "DENY") return { verdict: "DEFEATED", reason: `expected DENY, got ${decision}` };
    if (expect === "binding" && predicate?.DECLARATION_BOUND !== false) return { verdict: "DEFEATED", reason: "DECLARATION_BOUND must be false" };
    if (expect === "policy" && !/POLICY_HASH_MISMATCH/.test(record.policy?.label || "")) return { verdict: "DEFEATED", reason: `expected POLICY_HASH_MISMATCH, got ${record.policy?.label}` };
    return { verdict: "HELD" };
  };

r("1 top-level decision inputs carrying post-execution evidence throw (temporal seam)", async () => {
  const base = await allowedInputs({});
  for (const key of FORBIDDEN_TOKENS) {
    await attackCheck({
      id: `A6.1[${key}]`,
      attempt: async () => decideFirewall({ ...base, [key]: "0x" + "00".repeat(32) }),
      oracle: boundaryThrowOracle(key),
    });
  }
});

r("2 simulation object carrying post-execution keys throws (closed model, FW-10b)", async () => {
  const base = await allowedInputs({});
  for (const key of [...FORBIDDEN_TOKENS, ...FORBIDDEN_EQUIVALENTS]) {
    await attackCheck({
      id: `A6.2[${key}]`,
      attempt: async () => decideFirewall({ ...base, simulation: { ...base.simulation, [key]: "smuggled" } }),
      oracle: boundaryThrowOracle(key),
    });
  }
});

r("3 intent extra keys cannot assert anything or upgrade a verdict", async () => {
  const base = await allowedInputs({});
  const smuggled = { ...base.intent, executionRef: "0x" + "11".repeat(32) };
  await attackCheck({
    id: "A6.3",
    attempt: async () => decideFirewall({ ...base, intent: smuggled, declaration: { ...base.declaration, intent: smuggled } }),
    oracle: denyRecordsOracle("binding"),
  });
});

r("4 declaration extra keys change the re-derived manifestId → NOT_BOUND ⇒ DENY", async () => {
  const base = await allowedInputs({});
  await attackCheck({
    id: "A6.4",
    attempt: async () => {
      const d = JSON.parse(JSON.stringify(base.declaration));
      d.executionRef = "0x" + "22".repeat(32);
      return decideFirewall({ ...base, declaration: d });
    },
    oracle: denyRecordsOracle("binding"),
  });
});

r("5 policy extra keys cannot be smuggled past the committed hash", async () => {
  const base = await allowedInputs({});
  const claim = await hashPolicy(base.policy);
  await attackCheck({
    id: "A6.5",
    attempt: async () => {
      const policy = JSON.parse(JSON.stringify(base.policy));
      policy.executionBlock = "999999";
      return decideFirewall({ ...base, policy, expectedPolicyHash: claim });
    },
    oracle: denyRecordsOracle("policy"),
  });
});

r("6 reviewPath / writer / from extra keys are inert — records stay honest (IN1)", async () => {
  const base = await allowedInputs({});
  const out = await decideFirewall({
    ...base,
    reviewPath: { configured: true, writers: [base.writer], extra: "junk" },
    writer: base.writer,
    from: "0x" + "33".repeat(20),
  });
  assertNoPostExecutionArtifacts(out.record); // IN1 explicit on the produced record
  assert.ok(!JSON.stringify(out.record).includes("executionBlock"));
  await attackCheck({
    id: "A6.6",
    attempt: async () => out,
    oracle: ({ decision, record, predicate, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (decision !== "ALLOW") return { verdict: "DEFEATED", reason: `configured-review baseline must ALLOW, got ${decision}` };
      if (predicate?.REVIEW_OBLIGATION !== false) return { verdict: "DEFEATED", reason: "ALLOW must imply no review obligation (IN8)" };
      return { verdict: "HELD" };
    },
  });
});

r("7 IN1 deep-scan: no produced PRE record contains any forbidden token", async () => {
  const scenarios = [
    () => allowedInputs({}), // ALLOW
    () => allowedInputs({ rules: [{ ruleId: "r", type: "VALUE_LIMIT", severity: "HIGH", params: { max: "1" } }] }), // DENY
    () => allowedInputs({ simulation: undefined }), // DENY (no path)
  ];
  for (const make of scenarios) {
    const base = await make();
    const out1 = await decideFirewall(base);
    const out2 = await decideFirewall({ ...base, reviewPath: { configured: false } });
    for (const out of [out1, out2]) {
      assertNoPostExecutionArtifacts(out.record); // IN1 explicit (design: never implicit)
    }
  }
});