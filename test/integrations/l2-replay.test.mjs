import test from "node:test";
import assert from "node:assert/strict";

import {
  replay,
  isReplayConsistent,
  replayDiff,
  replayReport,
  REPLAY_SCHEMA,
} from "../../scripts/ladder/verification-levels.mjs";

const RULES = [
  { id: "VALUE_001" },
  { id: "POLICY_002" },
  { id: "CHAIN_003" },
];

test("L2: MATCH on full PASS evidence", () => {
  const intent = { subject: "x", policy: ["p"] };
  const receipt = { evidence: RULES.map((r) => ({ rule: r.id, result: "PASS" })) };
  const r = replay(intent, receipt, RULES);
  assert.equal(r.verdict, "MATCH");
  assert.equal(r.verdictCode, "REPLAY_CONSISTENT");
  assert.equal(r.schemaVersion, REPLAY_SCHEMA);
  assert.ok(r.replayHash.startsWith("0x"));
  assert.equal(r.audit.length, 11); // validate + intent-hash + contradiction + 3 presence + 3 result + coverage + verdict 
  assert.ok(isReplayConsistent(r));
});

test("L2: replay is deterministic (same input -> same hash)", () => {
  const intent = { subject: "x", policy: ["p"] };
  const receipt = { evidence: RULES.map((r) => ({ rule: r.id, result: "PASS" })) };
  const a = replay(intent, receipt, RULES);
  const b = replay(intent, receipt, RULES);
  assert.equal(a.replayHash, b.replayHash);
  assert.equal(a.verdict, b.verdict);
});

test("L2: MISMATCH on contradicted rule", () => {
  const intent = { subject: "x", policy: ["p"] };
  const receipt = {
    evidence: RULES.map((r) => ({ rule: r.id, result: "PASS" })),
    failedChecks: [{ rule: "VALUE_001" }],
  };
  const r = replay(intent, receipt, RULES);
  assert.equal(r.verdict, "MISMATCH");
  assert.equal(r.verdictCode, "RULE_FAILED");
  assert.ok(r.diff.length > 0);
  assert.ok(replayDiff(r).length > 0);
  assert.equal(isReplayConsistent(r), false);
});

test("L2: UNKNOWN on missing evidence", () => {
  const intent = { subject: "x", policy: ["p"] };
  const receipt = { evidence: [{ rule: "VALUE_001", result: "PASS" }] };
  const r = replay(intent, receipt, RULES);
  assert.equal(r.verdict, "UNKNOWN");
  assert.equal(r.verdictCode, "EVIDENCE_MISSING");
});

test("L2: MISMATCH on non-PASS evidence", () => {
  const intent = { subject: "x", policy: ["p"] };
  const receipt = { evidence: RULES.map((r) => ({ rule: r.id, result: r.id === "POLICY_002" ? "FAIL" : "PASS" })) };
  const r = replay(intent, receipt, RULES);
  assert.equal(r.verdict, "MISMATCH");
  assert.equal(r.verdictCode, "RULE_FAILED");
});

test("L2: UNKNOWN on missing intent", () => {
  const r = replay(null, { evidence: [] }, RULES);
  assert.equal(r.verdict, "UNKNOWN");
  assert.equal(r.verdictCode, "REQUIRED_EVIDENCE_MISSING");
});

test("L2: UNKNOWN on empty rules", () => {
  const r = replay({ subject: "x", policy: ["p"] }, { evidence: [] }, []);
  assert.equal(r.verdict, "UNKNOWN");
});

test("L2: UNKNOWN on invalid rule shape", () => {
  const r = replay({ subject: "x", policy: ["p"] }, { evidence: [] }, [{ id: "" }]);
  assert.equal(r.verdict, "UNKNOWN");
  assert.equal(r.verdictCode, "RULE_SHAPE_INVALID");
});

test("L2: stray failure -> MISMATCH", () => {
  const intent = { subject: "x", policy: ["p"] };
  const receipt = {
    evidence: RULES.map((r) => ({ rule: r.id, result: "PASS" })),
    failedChecks: [{ rule: "GHOST_RULE" }],
  };
  const r = replay(intent, receipt, RULES);
  assert.equal(r.verdict, "MISMATCH");
  assert.equal(r.verdictCode, "STRAY_FAILURE");
});

test("L2: partial success never upgrades to MATCH", () => {
  const intent = { subject: "x", policy: ["p"] };
  const receipt = { evidence: [{ rule: "VALUE_001", result: "PASS" }] };
  const r = replay(intent, receipt, RULES);
  assert.notEqual(r.verdict, "MATCH");
});

test("L2: replayReport produces structured summary", () => {
  const intent = { subject: "x", policy: ["p"] };
  const receipt = { evidence: RULES.map((r) => ({ rule: r.id, result: "PASS" })) };
  const r = replay(intent, receipt, RULES);
  const report = replayReport(r);
  assert.equal(report.verdict, "MATCH");
  assert.equal(report.stepCount, r.audit.length);
  assert.equal(report.failedSteps.length, 0);
  assert.equal(report.diffCount, 0);
  assert.equal(report.replayable, true);
});

test("L2: replayDiff returns empty on MATCH", () => {
  const intent = { subject: "x", policy: ["p"] };
  const receipt = { evidence: RULES.map((r) => ({ rule: r.id, result: "PASS" })) };
  const r = replay(intent, receipt, RULES);
  assert.deepEqual(replayDiff(r), []);
});

test("L2: audit trail records every step", () => {
  const intent = { subject: "x", policy: ["p"] };
  const receipt = { evidence: RULES.map((r) => ({ rule: r.id, result: "PASS" })) };
  const r = replay(intent, receipt, RULES);
  assert.ok(Array.isArray(r.audit));
  assert.ok(r.audit.every((a) => a.step && a.status));
  const steps = r.audit.map((a) => a.step);
  assert.ok(steps.includes("validate"));
  assert.ok(steps.includes("intent-hash"));
  assert.ok(steps.includes("contradiction-check"));
  assert.ok(steps.includes("coverage"));
  assert.ok(steps.includes("verdict"));
});