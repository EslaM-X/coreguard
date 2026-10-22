/**
 * claims-audit-committed-bind.test.js
 * Negative control: tamper the COMMITTED docs/claims-registry.json via git show
 * and prove claims:audit fails closed with COMMITTED_DERIVED_DRIFT.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, "..");
const REPO = join(__dirname, "..", "..");

function gitShow(path) {
  const rel = path.replace(/\\/g, "/");
  const r = spawnSync("git", ["show", `HEAD:${rel}`], { cwd: REPO, shell: false, windowsHide: true });
  if (r.status === 0 && Buffer.isBuffer(r.stdout) && r.stdout.length > 0) return r.stdout.toString("utf8");
  if (r.status === 0 && typeof r.stdout === "string" && r.stdout.length > 0) return r.stdout;
  return null;
}

test("claims:audit binds the COMMITTED artifact (negative control) — tamper derived -> FAIL with drift", () => {
  const committedText = gitShow("docs/claims-registry.json");
  assert.ok(committedText && committedText.length > 0, "must read HEAD:docs/claims-registry.json");

  const committed = JSON.parse(committedText);
  assert.ok(committed && Array.isArray(committed.claims));
  assert.ok(committed.audit);
  assert.equal(committed.audit.ok, true);

  const tampered = JSON.parse(JSON.stringify(committed));
  const target = tampered.claims.find((c) => c && c.id === "CL-ENGINEERING-SUITE");
  assert.ok(target, "CL-ENGINEERING-SUITE must exist");

  // Tamper derived value in-place
  if (target.derived && typeof target.derived === "object") {
    target.derived.testsTotal = 999999;
  } else {
    target.derived = { testsTotal: 999999 };
  }

  const disk = join(REPO, "docs", "claims-registry.json");
  const backup = readFileSync(disk, "utf8");
  try {
    writeFileSync(disk, JSON.stringify(tampered, null, 2) + "\n", "utf8");
    const r = spawnSync("npm", ["run", "-s", "claims:audit"], { cwd: REPO, encoding: "utf8", shell: true });
    const out = String(r.stdout || "") + String(r.stderr || "");
    assert.notEqual(r.status, 0, `claims:audit must fail on tamper. output: ${out.slice(0, 400)}`);
    assert.match(out, /COMMITTED_DERIVED_DRIFT|drift/i, `must report COMMITTED_DERIVED_DRIFT. output: ${out.slice(0, 400)}`);
  } finally {
    writeFileSync(disk, backup, "utf8");
  }
});
