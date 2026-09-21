#!/usr/bin/env node
/**
 * release-please.mjs — the fail-closed release gate. Publishing happens
 * through this script only:
 *
 *   node scripts/release-please.mjs [--dry-run]
 *
 * Order of defense:
 *   1. NPM_TOKEN must be present in the environment — publish without a
 *      credential is refused before anything runs (no half-published trees).
 *   2. scripts/publish-check.mjs must exit 0 for all 13 packages — the
 *      tarball-content, escaped-import, dependency-truth and INSTALL PARITY
 *      gates run against packed tarballs installed into a scratch workspace.
 *   3. --dry-run prints the publish plan and exits without publishing.
 *
 * Exit 0 only when the gate passes; the release workflow runs this first and
 * publishes with `--provenance --access public` on tagged main commits.
 */

import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES = [
  "canonical", "crypto", "policy", "trace", "evidence", "replay", "evm",
  "provenance", "intent", "verifier", "firewall", "delivery", "sdk",
];

const dryRun = process.argv.includes("--dry-run");
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
const SPAWN_SHELL = process.platform === "win32" ? true : undefined;

// gate 1 — credential present
const token = process.env.NPM_TOKEN ?? "";
if (!token.trim()) {
  console.error("release-please: NPM_TOKEN is not set — refusing to publish without a credential");
  process.exit(1);
}
console.log("release-please: NPM_TOKEN present ✓");

// gate 2 — the publish-check gate (spawned so its exit code is authoritative)
console.log("release-please: running publish-check over all 13 packages…");
const check = spawnSync(process.execPath, [join(REPO, "scripts", "publish-check.mjs")], {
  cwd: REPO,
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
  stdio: ["ignore", "pipe", "pipe"],
});
const outTail = String(check.stdout ?? "").split("\n").slice(-3).join("\n");
const errTail = String(check.stderr ?? "").split("\n").slice(-6).join("\n");
if (check.status !== 0) {
  console.error(`release-please: publish-check FAILED (exit ${check.status}) — publishing BLOCKED`);
  if (outTail.trim()) console.error(outTail);
  if (errTail.trim()) console.error(errTail);
  process.exit(1);
}
console.log(outTail.trim());

// gate 3 — the plan
const versions = PACKAGES.map((d) => {
  const pkg = JSON.parse(readFileSync(join(REPO, "packages", d, "package.json"), "utf8"));
  return `${pkg.name}@${pkg.version}`;
});
console.log("release-please: publish plan (13 packages, dependency order):");
for (const v of versions) console.log(`  ${v}`);

if (dryRun) {
  console.log("release-please: dry-run complete — nothing was published");
  process.exit(0);
}

// gate 4 — the publishes, dependency order, fail-fast
mkdirSync(join(REPO, "tmp"), { recursive: true });
const log = join(REPO, "tmp", "release-log.txt");
let failed = null;
for (const dir of PACKAGES) {
  if (failed) break;
  const res = spawnSync(NPM, ["publish", "--provenance", "--access", "public"], {
    cwd: join(REPO, "packages", dir),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    shell: SPAWN_SHELL,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (res.status !== 0) {
    failed = { dir, code: res.status, tail: String(res.stderr ?? "").split("\n").slice(-6).join("\n") };
    break;
  }
  const pkg = JSON.parse(readFileSync(join(REPO, "packages", dir, "package.json"), "utf8"));
  console.log(`released ${pkg.name}@${pkg.version} ✓`);
}
if (failed) {
  writeFileSync(log, `release stopped at ${failed.dir} (exit ${failed.code})\n${failed.tail}\n`, "utf8");
  console.error(`release-please: publish of @coreguard/${failed.dir} failed (exit ${failed.code}) — remaining packages NOT published; log: tmp/release-log.txt`);
  console.error(failed.tail);
  process.exit(1);
}
console.log(`release-please: all 13 packages published ✓ (log: ${log})`);
