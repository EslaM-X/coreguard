// ============================================================================
// EXECUTABLE CONTRACT — validate-freeze.mjs (commit-anchored freeze verifier)
// ----------------------------------------------------------------------------
// One row per observable behavior of the CLI, asserted through its real entry
// point (process exit code + console output). The table IS the contract:
// input class → required exit → required output fragment.
//
//   #  | input class                        | exit | output must contain
//   ---+------------------------------------+------+------------------------------
//   1  | current record (anchored)          |  0   | PASS (46/46 MATCH, anchored @
//   2  | --commit prefix == anchor          |  0   | PASS (46/46 MATCH
//   3  | --commit different tree            |  1   | refusing to verify a different tree
//   4  | historical record (no gitCommit)   |  1   | COMMIT-UNANCHORED
//   5  | no arguments                       |  2   | usage:
//   6  | --commit without value             |  2   | usage:
//   7  | unparseable record                 |  1   | not parseable JSON
//   8  | tampered pin (re-pin lies)         |  1   | MISMATCH
//   9  | --disk (triage only)               |  0   | disk mode — not evidence
//
// Boundary cases beyond the table: prefix-match exactness (case-insensitive),
// re-pin whitelist verified against its own declared commit, and anchored
// equivalence with a fresh git-plumbing read of the same commit (clean-clone
// semantics without a network clone).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const VERIFIER = "coreguard-assurance-v4.2.2-remediation/verification/validate-freeze.mjs";
const CURRENT = "coreguard-assurance-v4.2.2-remediation/release/freeze/freeze-record-4.2.6.json";
const HISTORICAL = "coreguard-assurance-v4.2.2-remediation/release/freeze/freeze-record-4.2.5.json";

function run(...args) {
  const r = spawnSync(process.execPath, [VERIFIER, ...args], { cwd: repoRoot, encoding: "utf8" });
  return { exit: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

function anchorCommit() {
  const rec = JSON.parse(readFileSync(join(repoRoot, CURRENT), "utf8"));
  return rec.gitCommit;
}

// pinned-entry count is read from the record itself so the contract tracks
// the freeze as it grows (27+19=46 at the 4.2.6 baseline, 28+19=47 once the
// dashboard joined) — a hardcoded literal here would break on every honest
// re-pin that adds coverage.
function pinnedCount() {
  const rec = JSON.parse(readFileSync(join(repoRoot, CURRENT), "utf8"));
  return rec.sha256.releaseFiles.length + rec.sha256.quarantineFiles.length;
}

const cases = [
  ["current anchored record", [CURRENT], 0, `PASS (${pinnedCount()}/${pinnedCount()} MATCH, anchored @`],
  ["--commit prefix equal to anchor", [CURRENT, "--commit", anchorCommit().slice(0, 7)], 0, `PASS (${pinnedCount()}/${pinnedCount()} MATCH`],
  ["--commit different tree", [CURRENT, "--commit", "a499cf4"], 1, "refusing to verify a different tree"],
  ["historical record, no anchor", [HISTORICAL], 1, "COMMIT-UNANCHORED"],
  ["no arguments", [], 2, "usage:"],
  ["--commit without value", [CURRENT, "--commit"], 2, "usage:"],
];

for (const [name, args, wantExit, wantFragment] of cases) {
  test(`contract: ${name} → exit ${wantExit}`, () => {
    const { exit, out } = run(...args);
    assert.equal(exit, wantExit, `output was: ${out}`);
    assert.ok(out.includes(wantFragment), `missing "${wantFragment}" in: ${out}`);
  });
}

test("contract: unparseable record → exit 1 with parse error", () => {
  const dir = mkdtempSync(join(tmpdir(), "cg-vf-"));
  const bad = join(dir, "bad.json");
  writeFileSync(bad, "not json");
  const { exit, out } = run(bad);
  assert.equal(exit, 1);
  assert.ok(out.includes("not parseable JSON"));
});

test("contract: tampered pin is a MISMATCH, not a silent pass", () => {
  const rec = JSON.parse(readFileSync(join(repoRoot, CURRENT), "utf8"));
  rec.sha256.releaseFiles.find((e) => e.file === "README.md").sha256 = "0x" + "ab".repeat(32);
  const dir = mkdtempSync(join(tmpdir(), "cg-vf-"));
  const tampered = join(dir, "tampered.json");
  writeFileSync(tampered, JSON.stringify(rec));
  const { exit, out } = run(tampered);
  assert.equal(exit, 1);
  assert.ok(out.includes("MISMATCH README.md"));
});

test("contract: --disk runs but is branded not-evidence", () => {
  const { exit, out } = run(CURRENT, "--disk");
  assert.equal(exit, 0);
  assert.ok(out.includes("disk mode — not evidence"));
  assert.ok(out.includes("not evidence")); // header caveat present too
});

test("boundary: anchor prefix match is case-insensitive", () => {
  const upper = anchorCommit().slice(0, 7).toUpperCase();
  const { exit } = run(CURRENT, "--commit", upper);
  assert.equal(exit, 0);
});

test("boundary: every postCommitRePins entry is honest vs its declared commit", () => {
  const rec = JSON.parse(readFileSync(join(repoRoot, CURRENT), "utf8"));
  assert.ok(rec.postCommitRePins.length > 0, "contract requires the whitelist mechanism to be exercised");
  for (const rp of rec.postCommitRePins) {
    // mirror the verifier's treePath(): platform-relative for bare/release paths,
    // repo-root relative for ../-prefixed entries (stripped, like repoRelPath)
    const rel = rp.file.startsWith("../")
      ? rp.file.replace(/^(\.\.\/)+/, "")
      : `coreguard-assurance-v4.2.2-remediation/${rp.file}`;
    const blob = execFileSync("git", ["-C", repoRoot, "show", `${rp.commit}:${rel}`]);
    const pin = rec.sha256.releaseFiles.find((e) => e.file === rp.file).sha256;
    assert.equal("0x" + crypto.createHash("sha256").update(blob).digest("hex"), pin,
      `re-pin for ${rp.file} does not match commit ${rp.commit}`);
  }
});

test("boundary: --disk actually reads the disk - re-pinned file drift is caught, not masked by its re-pin commit", () => {
  const abs = join(repoRoot, "coreguard-assurance-v4.2.2-remediation", "README.md");
  const original = readFileSync(abs, "utf8");
  try {
    writeFileSync(abs, original + "[drift-marker]");
    const drift = run(CURRENT, "--disk");
    assert.equal(drift.exit, 1, "disk mode must fail closed on working-tree drift");
    assert.ok(drift.out.includes("MISMATCH README.md"));
    assert.equal(run(CURRENT).exit, 0, "anchored mode is immune to working-disk edits");
  } finally {
    writeFileSync(abs, original, "utf8");
  }
});

test("boundary: anchored result equals direct git-blob rehash of the same commit (clean-clone semantics)", () => {
  const rec = JSON.parse(readFileSync(join(repoRoot, CURRENT), "utf8"));
  const sample = rec.sha256.releaseFiles[0];
  const blob = execFileSync("git", ["-C", repoRoot, "show", `${rec.gitCommit}:coreguard-assurance-v4.2.2-remediation/${sample.file}`]);
  assert.equal(sample.sha256, "0x" + crypto.createHash("sha256").update(blob).digest("hex"));
});
