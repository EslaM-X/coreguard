import test from "node:test";
import assert from "node:assert/strict";

import { evaluateVerdict, normalizeStates, OPTIONAL_CHECKS, PROFILE } from "../../scripts/anchor-verdict.mjs";

const PASS = "PASS";
const FAIL = "FAIL";
const NOT_RUN = "NOT_RUN";

function fullStates(levelOverrides = {}) {
  const base = {};
  for (const check of PROFILE.L2.required) base[check] = PASS;
  for (const check of OPTIONAL_CHECKS) base[check] = NOT_RUN;
  return { ...base, ...levelOverrides };
}

test("every level claim requires its FULL evidence profile", () => {
  for (const level of ["L0", "L1", "L2"]) {
    const r = evaluateVerdict(level, fullStates());
    assert.equal(r.verdict, "VERIFIED", `L0/L1/L2 with full profile must verify (got ${r.verdict})`);
    assert.equal(r.code, "ANCHOR_INTEGRITY");
  }
});

test("missing ANY required evidence -> UNVERIFIED, NEVER VERIFIED", () => {
  const profiles = { L0: PROFILE.L0, L1: PROFILE.L1, L2: PROFILE.L2 };
  for (const level of ["L0", "L1", "L2"]) {
    for (const requiredCheck of profiles[level].required) {
      const r = evaluateVerdict(level, fullStates({ [requiredCheck]: NOT_RUN }));
      assert.equal(r.verdict, "UNVERIFIED", `dropping ${requiredCheck} at ${level} must be UNVERIFIED`);
      assert.notEqual(r.verdict, "VERIFIED", `missing ${requiredCheck} at ${level} must never verify`);
      assert.ok(r.requiredMissing.includes(requiredCheck));
    }
  }
});

test("missing a REQUIRED check at a higher level also blocks that level", () => {
  // L2 requires B_anchorTx; removing it must NOT verify even with everything else present.
  const r2 = evaluateVerdict("L2", fullStates());
  assert.equal(r2.verdict, "VERIFIED");
  const r2m = evaluateVerdict("L2", fullStates({ B_anchorTx: NOT_RUN }));
  assert.equal(r2m.verdict, "UNVERIFIED");
});

test("a check never provided (absent from states) counts as NOT_RUN -> UNVERIFIED", () => {
  const states = fullStates();
  delete states.B_anchorTx;
  const r = evaluateVerdict("L2", states);
  assert.equal(r.verdict, "UNVERIFIED");
  assert.ok(r.requiredMissing.includes("B_anchorTx"));
});

test("optional NOT_RUN does NOT block VERIFIED (optional evidence is advisory)", () => {
  for (const opt of OPTIONAL_CHECKS) {
    const r = evaluateVerdict("L2", fullStates({ [opt]: NOT_RUN }));
    assert.equal(r.verdict, "VERIFIED");
  }
});

test("ANY run check that FAILs -> INVALID, regardless of required vs optional", () => {
  const cases = [
    ["L0", fullStates({ A_deploy: FAIL })],
    ["L2", fullStates({ B_anchorTx: FAIL })],
    ["L2", fullStates({ bytecode: FAIL })],         // optional check failure is still a contradiction
    ["L2", fullStates({ crossRpc: FAIL })],
    ["L1", fullStates({ B_commitIntentTx: FAIL })],
  ];
  for (const [level, states] of cases) {
    const r = evaluateVerdict(level, states);
    assert.equal(r.verdict, "INVALID", `FAIL in ${level} must yield INVALID`);
    assert.equal(r.code, "CONTRADICTION");
    assert.ok(r.failing.length > 0);
  }
});

test("FAIL dominates missing evidence: never upgrade a contradiction to VERIFIED", () => {
  const r = evaluateVerdict("L2", fullStates({ A_deploy: FAIL, C_recompute: NOT_RUN }));
  assert.equal(r.verdict, "INVALID");
});

test("L3/L4 are not claimable in v0.1 (INCONCLUSIVE, no runtime pathway)", () => {
  for (const level of ["L3", "L4"]) {
    const r = evaluateVerdict(level, fullStates());
    assert.equal(r.claimable, false);
    assert.equal(r.verdict, "INCONCLUSIVE");
    assert.equal(r.code, "LEVEL_UNAVAILABLE");
  }
});

test("unknown level is UNVERIFIED, not silently VERIFIED", () => {
  const r = evaluateVerdict("L9", fullStates());
  assert.equal(r.verdict, "UNVERIFIED");
  assert.equal(r.code, "UNSUPPORTED_LEVEL");
});

test("normalizeStates coerces unknown values to NOT_RUN", () => {
  const s = normalizeStates({ A_deploy: "PASS", B_anchor: "maybe", garbage: "PASS" });
  assert.equal(s.A_deploy, PASS);
  assert.equal(s.B_anchor, NOT_RUN);
  assert.equal(s.garbage, undefined);
});

test("non-check keys are rejected", () => {
  const s = normalizeStates({ not_a_real_check: "PASS", A_deploy: "PASS" });
  assert.equal(s.not_a_real_check, undefined);
  assert.equal(s.A_deploy, PASS);
});