#!/usr/bin/env node
/**
 * make-evidence-package.mjs — one-command generator for a CoreGuard evidence
 * package (A/B assent pair), pinned, verified, and delivered to a target dir.
 *
 * Default flow (offline, deterministic — fixed timestamps, no network):
 *   1. stage = temp dir
 *   2. make-assent-pair.mjs --out <stage>      (deterministic A/B assent pair)
 *   3. verify-assent-pair.mjs in <stage>       (fail-closed: must be 11/11)
 *   4. copy only if the staged tree PASSES      (never writes a failed tree)
 *   5. verify-assent-pair.mjs in <out>          (delivered-tree re-check)
 *
 * The 4 delivered files are byte-identical to the committed package
 * (deterministic generator), so any fresh output can be diffed against the
 * stable reference: examples/delivery-fixture/pairs/assent-pair/.
 *
 * Usage:
 *   node scripts/make-evidence-package.mjs --out <dir>
 * Exit codes (same convention as verify-assent-pair.mjs):
 *   0  EVP_OK — package generated, pinned and verified (ASSENT_PAIR OK 11/11)
 *   1  verification or generation failed (no package delivered)
 *   2  usage error
 */

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const GEN = join(REPO, "examples", "delivery-fixture", "pairs", "assent-pair", "make-assent-pair.mjs");
const VERIFY = join(REPO, "examples", "delivery-fixture", "pairs", "assent-pair", "verify-assent-pair.mjs");
const OUT_FILES = ["assent-a.json", "assent-b.json", "expected-field-map.json", "pair-hashes.json"];

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
if (outIdx === -1 || !args[outIdx + 1]) {
  console.error("usage: node scripts/make-evidence-package.mjs --out <dir>");
  process.exit(2);
}
const OUT = args[outIdx + 1];

if (existsSync(OUT)) {
  const present = readdirSync(OUT);
  const foreign = present.filter((e) => !OUT_FILES.includes(e));
  if (present.length > 0 && foreign.length > 0) {
    console.error(`refusing: ${OUT} exists with files that are not evidence-package files (${foreign.join(", ")})`);
    process.exit(2);
  }
}

function run(cmd, argsArr, cwd) {
  const r = spawnSync(process.execPath, [cmd, ...argsArr], { cwd, encoding: "utf8" });
  if (r.error) throw r.error;
  return r;
}

const stage = mkdtempSync(join(tmpdir(), "coreguard-evp-"));
try {
  const gen = run(GEN, ["--out", stage], REPO);
  if (gen.status !== 0) {
    console.error(`generation failed:\n${gen.stdout}\n${gen.stderr}`);
    process.exit(1);
  }

  const pre = run(VERIFY, [], stage);
  if (pre.status !== 0 || !/ASSENT_PAIR OK/.test(pre.stdout)) {
    console.error(`staged pair FAILED verification — no package delivered:\n${pre.stdout}\n${pre.stderr}`);
    process.exit(1);
  }

  mkdirSync(OUT, { recursive: true });
  for (const f of OUT_FILES) cpSync(join(stage, f), join(OUT, f));

  const post = run(VERIFY, [], OUT);
  if (post.status !== 0 || !/ASSENT_PAIR OK/.test(post.stdout)) {
    console.error(`delivered tree FAILED re-verification:\n${post.stdout}\n${post.stderr}`);
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(join(OUT, "pair-hashes.json"), "utf8"));
  const pv = manifest.manifest?.packageVersion ?? "unknown";

  console.log("CoreGuard evidence package — generated, pinned and verified");
  console.log("─".repeat(72));
  console.log(`package : ${pv} (A=ASSENT_PRESENT · B=ASSENT_MISSING)`);
  console.log(`out     : ${OUT}`);
  for (const f of OUT_FILES) console.log(`  · ${f}`);
  console.log(`verify  : 11/11 → ASSENT_PAIR OK (execution+delivery identical · consent separation preserved · unknowns explicit)`);
  console.log(`pin     : SHA-256 pins in pair-hashes.json (self-excluded)`);
  console.log(`ref     : examples/delivery-fixture/pairs/assent-pair/`);
  console.log(`repro   : node scripts/make-evidence-package.mjs --out <dir>`);
  console.log("─".repeat(72));
  console.log(`decision: EVP_OK`);
  console.log(`boundary: this package is a synthetic modeling exercise; it does not establish real-world party authority, payment of the modeled compensation, or a merits outcome.`);
  process.exit(0);
} finally {
  rmSync(stage, { recursive: true, force: true });
}