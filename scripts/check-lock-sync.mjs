#!/usr/bin/env node
/**
 * Lock-sync guard — `npm ci` fails when a workspace package is declared in the
 * root `package.json` but not registered in `package-lock.json`. CI surfaces it
 * as the cryptic EUSAGE "Missing: @coreguard/x from lock file" and every job
 * using `npm ci` dies (Demos, Engine, DDE).
 *
 * History (why this exists): red runs 35478251772 (commit b59bd1b,
 * @coreguard/delivery) and 35490813895 + 35490813823 (commit 7bbd731,
 * @coreguard/pricing) were this exact drift.
 *
 * CI runs this BEFORE `npm ci` so the failure names the package and the fix
 * instead of a cryptic npm-usage dump. It is dependency-free, so it runs even
 * when node_modules is absent.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Expand the root `workspaces` globs into [{ name, dir }] pairs. */
export function workspaceNames(root = ROOT) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const patterns = Array.isArray(pkg.workspaces) ? pkg.workspaces : [];
  const names = [];
  for (const pattern of patterns) {
    if (pattern.endsWith("/*")) {
      const base = join(root, pattern.slice(0, -2));
      if (!existsSync(base)) continue;
      for (const entry of readdirSync(base, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const pj = join(base, entry.name, "package.json");
        if (!existsSync(pj)) continue;
        const meta = JSON.parse(readFileSync(pj, "utf8"));
        if (meta.name) names.push({ name: meta.name, dir: `${pattern.slice(0, -2)}/${entry.name}` });
      }
    } else {
      const pj = join(root, pattern, "package.json");
      if (!existsSync(pj)) continue;
      const meta = JSON.parse(readFileSync(pj, "utf8"));
      if (meta.name) names.push({ name: meta.name, dir: pattern });
    }
  }
  return names;
}

/** Pure diff: which workspaces lack a lockfile entry? (testable without disk). */
export function diffWorkspaces(pkgs, lock) {
  const entries = (lock && lock.packages) || {};
  const missing = [];
  for (const { name, dir } of pkgs) {
    const linked = !!entries[`node_modules/${name}`];
    const placed = !!entries[dir];
    if (!linked || !placed) missing.push({ name, dir, linked, placed });
  }
  return missing;
}

export function checkLockSync(root = ROOT) {
  const pkgs = workspaceNames(root);
  const lockPath = join(root, "package-lock.json");
  if (!existsSync(lockPath)) {
    // Class H guard: a missing lockfile would otherwise fail inside
    // actions/setup-node's `cache: npm` with the opaque "Dependencies lock file
    // is not found" error (red run 34440426922, commit 41ed0b4). Name it here.
    return {
      ok: false,
      count: pkgs.length,
      reason: "no package-lock.json in repo root — commit one before CI can npm ci",
      missing: pkgs.length
        ? pkgs.map(({ name, dir }) => ({ name, dir, linked: false, placed: false }))
        : [{ name: "(lockfile)", dir: "package-lock.json", linked: false, placed: false }],
    };
  }
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const missing = diffWorkspaces(pkgs, lock);
  return { ok: missing.length === 0, count: pkgs.length, missing };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]).toLowerCase() : "";
if (invokedPath && resolve(fileURLToPath(import.meta.url)).toLowerCase() === invokedPath) {
  const res = checkLockSync();
  if (res.ok) {
    console.log(`lock-sync OK: ${res.count} workspaces registered in package-lock.json`);
    process.exit(0);
  }
  console.error(`lock-sync FAILED: ${res.missing.length}/${res.count} workspace(s) missing from package-lock.json:`);
  for (const m of res.missing) console.error(`  - ${m.name}  (${m.dir})`);
  if (res.reason) console.error(`Reason: ${res.reason}`);
  console.error("Fix: run `npm install` at the repo root, then commit package-lock.json.");
  process.exit(1);
}