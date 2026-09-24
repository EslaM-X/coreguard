#!/usr/bin/env node
/**
 * make-dispute-package.mjs — one-command ADAL/1 dispute package generator
 * (single-file, pinned, verified, delivered to a target dir).
 *
 * Flow (offline, deterministic):
 *   1. stage = temp dir
 *   2. make-dispute-package.mjs --case A|B --out <stage>  (deterministic)
 *   3. verify-dispute-package.mjs in <stage>               (fail-closed)
 *   4. copy only if the staged tree PASSES
 *   5. verify-dispute-package.mjs in <out>                 (delivered re-check)
 *
 * Usage:
 *   node scripts/make-dispute-package.mjs --case A|B --out <dir>
 *   npm run dispute-package -- --case A --out <dir>
 * Exit codes (same convention as make-evidence-package.mjs):
 *   0  DP_OK — dispute package generated, pinned and verified, delivered
 *   1  generation or verification failed (no package delivered)
 *   2  usage error (missing --case/--out, invalid case, or dir holds foreign
 *      files)
 */

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const GEN = join(REPO, "examples", "delivery-fixture", "pairs", "dispute-package", "make-dispute-package.mjs");
const VERIFY = join(REPO, "examples", "delivery-fixture", "pairs", "dispute-package", "verify-dispute-package.mjs");
const OUT_FILES = ["dispute-package.json", "dispute-hashes.json"];

const args = process.argv.slice(2);
const caseIdx = args.indexOf("--case");
const CASE = args[caseIdx + 1];
const outIdx = args.indexOf("--out");
const OUT = args[outIdx + 1];

if (caseIdx === -1 || (CASE !== "A" && CASE !== "B") || outIdx === -1 || !OUT) {
  console.error("usage: node scripts/make-dispute-package.mjs --case A|B --out <dir>");
  process.exit(2);
}

if (existsSync(OUT)) {
  const present = readdirSync(OUT);
  const foreign = present.filter((e) => !OUT_FILES.includes(e));
  if (present.length > 0 && foreign.length > 0) {
    console.error(`refusing: ${OUT} exists with files that are not dispute-package files (${foreign.join(", ")})`);
    process.exit(2);
  }
}

function run(cmd, argsArr, cwd) {
  const r = spawnSync(process.execPath, [cmd, ...argsArr], { cwd, encoding: "utf8" });
  if (r.error) throw r.error;
  return r;
}

const stage = mkdtempSync(join(tmpdir(), "coreguard-dpk-"));
try {
  const gen = run(GEN, ["--case", CASE, "--out", stage], REPO);
  if (gen.status !== 0 || !/dispute package written/.test(gen.stdout)) {
    console.error(`generation failed:\n${gen.stdout}\n${gen.stderr}`);
    process.exit(1);
  }

  const pre = run(VERIFY, [], stage);
  if (pre.status !== 0 || !/DISPUTE_PACKAGE OK/.test(pre.stdout)) {
    console.error(`staged dispute package FAILED verification — no package delivered:\n${pre.stdout}\n${pre.stderr}`);
    process.exit(1);
  }

  mkdirSync(OUT, { recursive: true });
  for (const f of OUT_FILES) cpSync(join(stage, f), join(OUT, f));

  const post = run(VERIFY, [], OUT);
  if (post.status !== 0 || !/DISPUTE_PACKAGE OK/.test(post.stdout)) {
    console.error(`delivered tree FAILED re-verification:\n${post.stdout}\n${post.stderr}`);
    process.exit(1);
  }

  console.log("CoreGuard ADAL/1 dispute package — generated, pinned and verified");
  console.log("─".repeat(72));
  console.log(`protocol: ADAL/1 · case ${CASE} · out: ${OUT}`);
  console.log(`  · dispute-package.json  (single-file protocol record)`);
  console.log(`  · dispute-hashes.json   (SHA-256 pins, self-excluded)`);
  console.log(`verify  : DISPUTE_PACKAGE OK (● pins · protocol · EVP/1 evidence labels · award UNKNOWN · escrow reference-only · adapter NOT_BUILT)`);
  console.log("─".repeat(72));
  console.log(`decision: DP_OK`);
  console.log(`boundary: package is synthetic; awardSlot UNKNOWN until an external adjudicator signs it; escrow reference-only; no live adapter integration.`);
  process.exit(0);
} finally {
  rmSync(stage, { recursive: true, force: true });
}