#!/usr/bin/env node
/**
 * current-state.mjs — canonical, machine-measured state snapshot.
 *
 * Records the exact measured truth of the working tree so every number a
 * doc or campaign cites is traceable to a command, tied to the commit it was
 * measured on, and machine-checked in CI:
 *
 *   - full suite pass count          (the last green `npm test`)
 *   - boundary audit                 (files scanned, violations — re-measured here)
 *   - peoples-court harness          (PEOPLES_COURT_HARNESS_READY)
 *   - docs-node contract counts      (executed / skip-listed / docs covered)
 *   - git commit + commits ahead of  v0.6.0
 *
 * Usage:
 *   node scripts/current-state.mjs                 # print measured block (no write)
 *   node scripts/current-state.mjs --check         # compare vs committed snapshot, exit 1 on drift
 *   node scripts/current-state.mjs --write --tests N   # regenerate docs/state-snapshot.json
 *
 * Exit: 0 = match/clean, 1 = drift, 2 = usage/measurement error.
 * The snapshot lives at docs/state-snapshot.json and is asserted by
 * test/ci/current-state.test.js AND by scripts/run-tests.mjs (suite count).
 */

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const SNAPSHOT = join(REPO, "docs", "state-snapshot.json");
const AUDIT = join(REPO, "scripts", "boundary-audit.mjs");
const HARNESS = join(REPO, "packages", "peoples-court-adapter", "cli-harness.mjs");
const DOCSNODE = join(REPO, "test", "ci", "docs-node-contract.test.js");

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: REPO, encoding: "utf8", ...opts });

function measureAudit() {
  const tmp = mkdtempSync(join(tmpdir(), "cg-state-"));
  try {
    const out = join(tmp, "report.json");
    const r = run(process.execPath, [AUDIT, "--root", REPO, "--out", out]);
    if (r.status !== 0 || r.stdout.includes("FAIL")) {
      throw new Error(`boundary audit did not pass: ${r.stdout}${r.stderr}`);
    }
    const report = JSON.parse(readFileSync(out, "utf8"));
    return { filesScanned: report.scannedFiles, violations: report.findingsCount, check: "PASS" };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function measureHarness() {
  const tmp = mkdtempSync(join(tmpdir(), "cg-harness-"));
  try {
    const caseDir = join(REPO, "examples", "delivery-fixture", "pairs", "dispute-package", "reference-A");
    const r = run(process.execPath, [HARNESS, "--case", caseDir, "--out", tmp]);
    if (r.status !== 0 || !r.stdout.includes("PEOPLES_COURT_HARNESS_READY")) {
      throw new Error(`harness did not reach READY: ${r.stdout.slice(0, 400)}${r.stderr}`);
    }
    return "PEOPLES_COURT_HARNESS_READY";
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function measureDocsNode() {
  // The top-level test runner inherits NODE_TEST_CONTEXT into every child, and
  // `node --test` skips its files (exit 0, no summary) when that env var is set
  // — a nested measurement would silently certify an EMPTY run. Remove it for
  // the child so the exact same contract file actually executes.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = run(process.execPath, ["--test", "--test-concurrency=1", DOCSNODE], { env });
  const m = r.stdout.match(/(\d+) executed · (\d+) skip-listed · (\d+) docs covered/);
  if (r.status !== 0 || !m) {
    throw new Error(`docs-node contract did not pass: ${r.stdout.slice(0, 400)}${r.stderr}`);
  }
  return { executed: Number(m[1]), skipListed: Number(m[2]), docsCovered: Number(m[3]) };
}

const git = (args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();

function measure(knownTests) {
  const commit = git(["rev-parse", "HEAD"]);
  const aheadOfV060 = Number(git(["rev-list", "v0.6.0..HEAD", "--count"]));
  const snapshot = {
    measuredAtUtc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    gitCommit: commit,
    commitsAheadOfV060: aheadOfV060,
    testsTotal: knownTests,
    boundaryAudit: measureAudit(),
    peoplesCourtHarness: measureHarness(),
    docsNode: measureDocsNode(),
    reproduce: {
      tests: "npm test",
      audit: "npm run boundary:audit",
      harness: "npm run peoples-court:harness",
      docsNode: "node --test --test-concurrency=1 test/ci/docs-node-contract.test.js",
      snapshot: "node scripts/current-state.mjs --write --tests <full-suite pass count>",
    },
  };
  return snapshot;
}

/** Fields that are TREE-CONTENT measurements — the only ones --check enforces.
 *  gitCommit / measuredAtUtc / commitsAheadOfV060 are HEAD-dependent metadata
 *  (they change on every commit/rebase, so equality would be pure thrash);
 *  testsTotal is enforced LIVE by scripts/run-tests.mjs after every green run. */
function checkFields(s) {
  const copy = JSON.parse(JSON.stringify(s));
  return {
    boundaryAudit: copy.boundaryAudit,
    peoplesCourtHarness: copy.peoplesCourtHarness,
    docsNode: copy.docsNode,
  };
}

function main() {
  const args = process.argv.slice(2);
  const modeWrite = args.includes("--write");
  const modeCheck = args.includes("--check");
  if (modeWrite && modeCheck) {
    console.error("BOUNDARY-CURRENT-STATE: ERROR  --write and --check are mutually exclusive");
    process.exit(2);
  }
  let knownTests = null;
  const ti = args.indexOf("--tests");
  if (ti >= 0) knownTests = Number(args[ti + 1]);
  if (modeWrite && !Number.isInteger(knownTests)) {
    console.error("BOUNDARY-CURRENT-STATE: ERROR  --write requires --tests <full-suite pass count> (measured by the last green `npm test`)");
    process.exit(2);
  }

  // Write-mode measures the tree WITH the snapshot file already present, so the
  // recorded audit count matches a committed checkout whose --check re-runs on
  // a tree that includes docs/state-snapshot.json (else drift on the first run).
  if (modeWrite) writeFileSync(SNAPSHOT, "{}", "utf8");
  const measured = measure(knownTests);

  if (modeWrite) {
    writeFileSync(SNAPSHOT, JSON.stringify(measured, null, 2) + "\n", "utf8");
    console.log(`BOUNDARY-CURRENT-STATE: SNAPSHOT WRITTEN  ${SNAPSHOT}`);
    process.exit(0);
  }

  if (modeCheck) {
    let committed;
    try {
      committed = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
    } catch {
      console.error(`BOUNDARY-CURRENT-STATE: ERROR  no committed snapshot at ${SNAPSHOT} — run node scripts/current-state.mjs --write --tests <n>`);
      process.exit(1);
    }
    const live = checkFields(measured);
    const pinned = checkFields(committed);
    if (JSON.stringify(live) !== JSON.stringify(pinned)) {
      console.error("BOUNDARY-CURRENT-STATE: DRIFT  live measurement != committed snapshot");
      console.error(`  pinned: ${JSON.stringify(pinned, null, 0)}`);
      console.error(`  live  : ${JSON.stringify(live, null, 0)}`);
      process.exit(1);
    }
    console.log(`BOUNDARY-CURRENT-STATE: CHECK OK  (${measured.boundaryAudit.filesScanned} files · ${measured.testsTotal ?? "n/a"} tests · ${measured.gitCommit.slice(0, 8)})`);
    process.exit(0);
  }

  console.log(JSON.stringify(measured, null, 2));
  process.exit(0);
}

try {
  main();
} catch (err) {
  console.error("BOUNDARY-CURRENT-STATE: ERROR", err.message || err.stack);
  process.exit(2);
}