/**
 * A11 — DECISION-PRIMITIVE integrity (design §6, Q-FW6a/I2).
 *
 * FAMILY ORAclEs: records are content-hashed, deep-frozen and domain-separated
 * (FW-DECISION / FW-RESOLUTION / FW-CONFORMANCE); any change to record content
 * must change the ref; any change after freeze is impossible. A mutable record
 * is never accepted as a parent for resolution.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { decideFirewall } from "../../../packages/firewall/index.js";
import {
  decisionRecordRef,
  freezeDecisionRecord,
  canonicalRecord,
  DECISION_DOMAIN,
  RESOLUTION_DOMAIN,
} from "../../../packages/firewall/decision-record.js";
import { attackCheck, allowedInputs, assertNoPostExecutionArtifacts } from "./helpers.js";

const r = (name, fn) => test(`A11.${name}`, fn);

r("1 produced records are deep-frozen, ref-stamped and artifact-free", async () => {
  const base = await allowedInputs({});
  const out = await decideFirewall(base);
  assert.equal(Object.isFrozen(out.record), true);
  assert.equal(Object.isFrozen(out.record.binding), true);
  assert.equal(Object.isFrozen(out.record.policy), true);
  assert.ok(out.record.decisionRef?.startsWith("0x"));
  assertNoPostExecutionArtifacts(out.record);
});

r("2 post-freeze mutation is impossible (assignments throw)", async () => {
  const base = await allowedInputs({});
  const out = await decideFirewall(base);
  assert.throws(() => {
    out.record.decision = "ALLOW";
  }, TypeError);
  assert.throws(() => {
    out.record.binding.manifestId = "0x00";
  }, TypeError);
});

r("3 decisionRef is fully content-derived (recompute equals stored ref; no nonce)", async () => {
  const base = await allowedInputs({});
  const out = await decideFirewall(base);
  const ref = await decisionRecordRef(out.record);
  assert.equal(ref, out.record.decisionRef);
  const canonical = canonicalRecord(out.record);
  const refrozen = await freezeDecisionRecord(JSON.parse(canonical));
  assert.equal(refrozen.decisionRef, out.record.decisionRef);
});

r("4 any content change changes the ref (tamper is detectable)", async () => {
  const base = await allowedInputs({});
  const out = await decideFirewall(base);
  const canonical = canonicalRecord(out.record);
  const tampered = JSON.parse(canonical);
  tampered.decision = "DENY";
  delete tampered.decisionRef;
  const altRef = await decisionRecordRef(tampered);
  assert.notEqual(altRef, out.record.decisionRef);
});

r("5 domain separation: FW-DECISION / FW-RESOLUTION / FW-CONFORMANCE never collide", async () => {
  const base = await allowedInputs({});
  const out = await decideFirewall(base);
  const { freezeResolutionRecord, freezeConformanceRecord } = await import("../../../packages/firewall/decision-record.js");
  const reso = await freezeResolutionRecord({ ref: out.record.decisionRef, from: "REQUIRE_REVIEW", to: "ALLOW", at: "1", writer: base.writer, reason: "x" });
  const conf = await freezeConformanceRecord({ ref: out.record.decisionRef, decision: "ALLOW", conformance: "CONFORMANT", mismatches: [], observed: {}, at: "1", annotator: base.writer });
  assert.notEqual(DECISION_DOMAIN, RESOLUTION_DOMAIN);
  assert.notEqual(reso.resolutionRef, out.record.decisionRef);
  assert.notEqual(conf.conformanceRef, out.record.decisionRef);
  assert.notEqual(reso.resolutionRef, conf.conformanceRef);
});

r("6 a mutable record is not a parent for resolution (must be frozen)", async () => {
  const base = await allowedInputs({});
  const out = await decideFirewall({ ...base, reviewPath: { configured: true, writers: [base.writer] }, simulation: { target: base.intent.target, selector: base.intent.selector, recipient: base.intent.recipient } });
  const mutable = JSON.parse(canonicalRecord(out.record));
  const { resolveReview } = await import("../../../packages/firewall/index.js");
  await attackCheck({
    id: "A11.6",
    attempt: async () => resolveReview({ parentRecord: mutable, writer: base.writer, reviewPath: { configured: true, writers: [base.writer] }, resolvedSimulation: base.simulation, inputs: base }),
    oracle: ({ admitted, error, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (admitted === true) return { verdict: "DEFEATED", reason: "mutable record accepted as resolution parent" };
      if (admitted === false && /must be a frozen decision record/.test(error || "")) return { verdict: "HELD" };
      return { verdict: "DEFEATED", reason: `expected frozen-parent rejection, got ${JSON.stringify({ admitted, error })}` };
    },
  });
});