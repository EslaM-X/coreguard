/**
 * Guard: package-lock.json must register every workspace package, or `npm ci`
 * fails in CI. History: red runs at b59bd1b (@coreguard/delivery) and 7bbd731
 * (@coreguard/pricing) — both this exact drift.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workspaceNames, diffWorkspaces, checkLockSync } from "../../scripts/check-lock-sync.mjs";

test("every declared workspace is registered in package-lock.json", () => {
  const res = checkLockSync();
  assert.equal(res.ok, true, "missing: " + JSON.stringify(res.missing));
  assert.ok(res.count >= 13, `expected >=13 workspaces, got ${res.count}`);
});

test("workspaceNames surfaces the real package names", () => {
  const names = workspaceNames().map((w) => w.name);
  for (const expected of ["@coreguard/pricing", "@coreguard/delivery", "@coreguard/provenance"]) {
    assert.ok(names.includes(expected), `expected ${expected} in workspaces`);
  }
});

test("diffWorkspaces fails closed on a missing lock entry (regression)", () => {
  const missing = diffWorkspaces([{ name: "@coreguard/nope", dir: "packages/nope" }], { packages: {} });
  assert.equal(missing.length, 1);
  assert.equal(missing[0].name, "@coreguard/nope");
  assert.equal(missing[0].linked, false);
});

test("diffWorkspaces accepts a fully-linked workspace", () => {
  const lock = { packages: { "node_modules/@coreguard/x": { link: true }, "packages/x": { name: "@coreguard/x" } } };
  assert.deepEqual(diffWorkspaces([{ name: "@coreguard/x", dir: "packages/x" }], lock), []);
});

test("checkLockSync fails closed with a clear reason when package-lock.json is absent (class H)", () => {
  const root = mkdtempSync(join(tmpdir(), "cg-locksync-"));
  try {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "probe", private: true, workspaces: ["packages/*"] }));
    mkdirSync(join(root, "packages", "bot"), { recursive: true });
    writeFileSync(join(root, "packages", "bot", "package.json"), JSON.stringify({ name: "@probe/bot", version: "0.0.1" }));
    const res = checkLockSync(root);
    assert.equal(res.ok, false);
    assert.ok(res.reason && res.reason.includes("no package-lock.json"), "expected a clear missing-lockfile reason, got: " + res.reason);
    assert.equal(res.missing.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});