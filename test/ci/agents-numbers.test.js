// ============================================================================
// EXECUTABLE CONTRACT — AGENTS.md's measured numbers
// ----------------------------------------------------------------------------
// AGENTS.md is the file a future session trusts first, and its
// Files-That-Change-Together block states live numbers as bare literals:
// engine version, scenario count, test count, validator check count, freeze pin
// count, self-test count. Every one of them has exactly one committed source of
// truth, and until now NOTHING checked them - which is not a theoretical risk,
// it is a measured one. This file's own subject rotted twice before it was
// written:
//
//   919 ↔ 16 ↔ 919 ↔ 649   (ancient; a previous cycle had to fix it by hand)
//   47 = 28+19               (two pins stale while the record held 30+19 = 49)
//
// A hand-fixed number is still an unguarded number: the next honest re-pin
// re-rotts it, and the reviewer cannot tell. So each value is DERIVED from its
// source here and required inside the ONE line whose label names it - the [C32]
// rule (bind to the row that labels it, not a document-wide substring, or
// "1180" occurring incidentally elsewhere keeps the check green).
//
// A historical figure inside a lesson entry (637/637, 696/696, 912/912) is
// deliberately NOT bound: those describe what a past cycle measured, and
// binding them would force a rewrite of history. Only live claims are bound.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const AGENTS = join(REPO, "AGENTS.md");
const PLATFORM = join(REPO, "coreguard-assurance-v4.2.2-remediation");
const RECORD = join(PLATFORM, "release", "freeze", "freeze-record-4.2.6.json");

const read = (p) => JSON.parse(readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
// negative-tests.json has carried its scenario array under `results` (and under
// `scenarios` on an earlier shape). Picking the wrong key yields length 0, which
// is precisely how a guard comes to state a false 0 - the [C30] zero-denominator
// trap. A wrong key must fail loudly, never degrade to 0.
function scenarioCount(neg) {
  const arr = Array.isArray(neg) ? neg : neg.results || neg.scenarios || neg.tests;
  assert.ok(Array.isArray(arr), "negative-tests.json holds no array of scenarios");
  assert.ok(arr.length > 0, "negative-tests.json scenario array is empty - refusing to derive 0");
  return arr.length;
}

const agentsLines = () =>
  readFileSync(AGENTS, "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/);

// ---------------------------------------------------------------------------
// The derivations. Each returns the string AGENTS.md must state.
// ---------------------------------------------------------------------------
const snapshot = () => read(join(REPO, "docs", "state-snapshot.json"));
const record = () => read(RECORD);

const DERIVED = [
  {
    name: "reviewer-packet chain (engine ↔ scenarios ↔ tests ↔ validator checks)",
    // "PASS (649 checks, 0 errors)" - the count is the record's own claim about
    // the validator, so the literal is parsed out of it rather than retyped
    derive: () => {
      const rec = record();
      const checks = rec.cycleEvidence?.nodeValidator?.match(/(\d+)\s+checks/);
      assert.ok(checks, "record no longer states a '<n> checks' nodeValidator claim");
      const neg = read(join(PLATFORM, "release", "negative-tests.json"));
      return `${rec.engineVersion} \u2194 ${scenarioCount(neg)} \u2194 ${snapshot().testsTotal} \u2194 ${checks[1]}`;
    },
    anchor: "- `H1-H8.md` expected numbers",
  },
  {
    name: "freeze pin count and its release/quarantine split",
    derive: () => {
      const s = record().sha256;
      return `${s.releaseFiles.length + s.quarantineFiles.length} = ${s.releaseFiles.length}+${s.quarantineFiles.length}`;
    },
    anchor: "- `freeze-record-4.2.6.json` \u2194 any file it pins",
  },
  {
    name: "SelfTest check count (the 'ok ' lines in the frozen tap)",
    derive: () => {
      const tap = join(PLATFORM, "release", "selftest.tap");
      assert.ok(existsSync(tap), "selftest.tap is missing - the self-test count has no source");
      const n = (readFileSync(tap, "utf8").match(/^ok /gm) || []).length;
      assert.ok(n > 0, "selftest.tap has no 'ok ' lines - refusing to derive 0");
      return String(n);
    },
    anchor: "- `verification/cg-assurance-verify.ps1` self-test count",
  },
  {
    name: "payout i18n dictionary key count (the only enforced pairing contract)",
    derive: () => {
      const page = readFileSync(join(REPO, "docs", "GOVERNANCE-DASHBOARD.html"), "utf8");
      const MARK = "var PAYOUT_GATE_I18N = {";
      const ds = page.indexOf(MARK);
      assert.ok(ds >= 0, "GOVERNANCE-DASHBOARD.html no longer carries PAYOUT_GATE_I18N");
      const de = page.indexOf("};", ds);
      const dict = eval("({" + page.slice(ds + MARK.length, de) + "})");
      const n = Object.keys(dict).length;
      assert.ok(n > 0, "payout dictionary is empty - refusing to derive 0");
      return String(n);
    },
    anchor: "- Bilingual dashboard pair",
  },
];
for (const { name, derive, anchor } of DERIVED) {
  test(`AGENTS.md states the measured value for: ${name}`, () => {
    const expected = derive();
    assert.ok(expected && !/\bundefined\b|\bNaN\b/.test(expected), `could not derive a value (got ${expected})`);

    const lines = agentsLines();
    const hits = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.trimStart().startsWith(anchor));
    // exactly one such line: a stale duplicate beside a fresh one is the [C32]
    // hiding place, and a zero means the anchor itself drifted
    assert.equal(hits.length, 1, `expected exactly 1 line starting "${anchor}", found ${hits.length}`);

    const { l, i } = hits[0];
    assert.ok(
      l.includes(expected),
      `AGENTS.md line ${i + 1} does not state the measured value ${JSON.stringify(expected)}`
    );
  });
}

test("the anchor lines exist and the derivations have real sources", () => {
  // Guards the harness itself: if a source is deleted or an anchor renamed, the
  // per-value tests must fail LOUDLY rather than skip into a green summary.
  assert.ok(existsSync(AGENTS), "AGENTS.md missing");
  assert.ok(existsSync(RECORD), "freeze record missing");
  assert.ok(existsSync(join(REPO, "docs", "state-snapshot.json")), "state snapshot missing");
  for (const { name, derive } of DERIVED) {
    const v = derive();
    assert.ok(typeof v === "string" && v.length > 0, `empty derivation: ${name}`);
  }
});

test("the freeze record's OWN cycleEvidence agrees with the derived reality", () => {
  // The record is the reviewer-facing claim; the tap file and the negative-suite
  // JSON are the artifacts. If the record's prose says 21/21 while the tap holds
  // 20 'ok ' lines, the record is asserting something the bytes do not support
  // - and AGENTS.md would faithfully restate it.
  const rec = record();
  const tap = readFileSync(join(PLATFORM, "release", "selftest.tap"), "utf8");
  const selfTest = (tap.match(/^ok /gm) || []).length;
  const neg = read(join(PLATFORM, "release", "negative-tests.json"));
  const scenarios = scenarioCount(neg);

  const stClaim = rec.cycleEvidence?.selftest?.match(/^(\d+)\//);
  const nsClaim = rec.cycleEvidence?.negativeSuite?.match(/^(\d+)\//);
  assert.ok(stClaim, "cycleEvidence.selftest no longer states an '<n>/<n>' claim");
  assert.ok(nsClaim, "cycleEvidence.negativeSuite no longer states an '<n>/<n>' claim");

  assert.equal(
    Number(stClaim[1]),
    selfTest,
    `record claims selftest ${stClaim[1]}/${stClaim[1]} but selftest.tap holds ${selfTest} 'ok ' lines`
  );
  assert.equal(
    Number(nsClaim[1]),
    scenarios,
    `record claims negativeSuite ${nsClaim[1]}/${nsClaim[1]} but negative-tests.json holds ${scenarios} scenarios`
  );
});

test("the live chain line is not silently reduced to fewer measured values", () => {
  // The corruption this prevents: someone trims the chain to "2.1.2" and the
  // file still parses, still reads, and no longer states the test count at all.
  const { anchor } = DERIVED[0];
  const line = agentsLines().find((x) => x.trimStart().startsWith(anchor));
  assert.ok(line, `the chain line starting "${anchor}" is gone`);

  // The line uses the arrow in its own title too ("numbers ↔ engine version ↔
  // ..."), so counting arrows across the whole line measures the prose. Scope to
  // the value segment: the parenthesised "(currently ...)" run, up to the em-dash
  // that ends it.
  const seg = line.slice(line.indexOf("(currently"), line.indexOf(" —", line.indexOf("(currently")));
  assert.ok(seg.length > 10, `could not locate the (currently ...) value segment: ${JSON.stringify(seg)}`);
  const values = seg.replace("(currently", "").split("\u2194").map((s) => s.trim());
  assert.equal(
    values.length,
    4,
    `the chain states ${values.length} values [${values.join(" | ")}], expected 4 (engine, scenarios, tests, validator)`
  );
});
