import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// [C28] The canonical current-state snapshot (docs/state-snapshot.json) is the
// single machine-measured source for every number a doc or release cites
// (full-suite pass count, boundary audit files/violations, peoples-court
// harness readiness, docs-node contract counts, git commit, commits ahead of
// v0.6.0). This contract re-measures the fast, deterministic fields and fails
// the suite on any drift; the full-suite pass count is additionally enforced
// by scripts/run-tests.mjs after every green run.

// Node 18 has no import.meta.dirname — use the repo-wide fileURLToPath idiom
// so all three engine legs (18/20/22) load this file identically.
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SNAPSHOT = join(REPO, "docs", "state-snapshot.json");
const STATE = join(REPO, "scripts", "current-state.mjs");

test("state snapshot is committed, valid JSON, and anchored on current history", () => {
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  assert.match(snapshot.gitCommit ?? "", /^[0-9a-f]{40}$/);
  // The snapshot was generated at a specific commit; it must remain reachable
  // from HEAD (rebase-proof: content checks below survive history rewrites).
  const reachable = spawnSync("git", ["merge-base", "--is-ancestor", snapshot.gitCommit, "HEAD"], { cwd: REPO, encoding: "utf8" });
  assert.equal(reachable.status, 0, "snapshot gitCommit must be reachable from HEAD");
  assert.equal(typeof snapshot.testsTotal, "number");
  assert.ok(snapshot.testsTotal >= 1000, `snapshot testsTotal ${snapshot.testsTotal} is implausibly low`);
  assert.equal(snapshot.boundaryAudit.violations, 0);
  assert.equal(snapshot.peoplesCourtHarness, "PEOPLES_COURT_HARNESS_READY");
});

test("current-state --check re-measures the fast fields and must match the committed snapshot", () => {
  const r = spawnSync(process.execPath, [STATE, "--check"], { cwd: REPO, encoding: "utf8" });
  assert.equal(r.status, 0, `--check drifted against committed snapshot:\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /CHECK OK/);
});