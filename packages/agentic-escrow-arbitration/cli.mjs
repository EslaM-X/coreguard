#!/usr/bin/env node
/**
 * cli.mjs — `npm run aea1:prepare -- --case <dispute-package-dir> [--out <dir>]`
 *
 * Deterministic, offline AEA/1 boundary record: verifies the ADAL/1 dispute
 * package (fail closed), builds the escrow reference interface + tribunal
 * surface template, writes aea1-boundary.json + escrow-interface.json +
 * aea1-report.json + aea1-hashes.json, then re-verifies its own output.
 *
 * Exit codes:
 *   0  AEA1_BOUNDARY_READY — package verified, artifacts written and re-verified
 *   1  fail-closed (verification or artifact verification failed; nothing kept)
 *   2  usage error (missing --case, out dir holds foreign files, case dir incomplete)
 */

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { prepareAea1, verifyAea1, OUT_FILES, AEA1 } from "./sdk.mjs";

const args = process.argv.slice(2);
const caseIdx = args.indexOf("--case");
const outIdx = args.indexOf("--out");
const CASE = caseIdx === -1 ? null : args[caseIdx + 1];
const OUT_ARG = outIdx === -1 ? null : args[outIdx + 1];

if (caseIdx === -1 || !CASE) {
  console.error("usage: node packages/agentic-escrow-arbitration/cli.mjs --case <dispute-package-dir> [--out <dir>]");
  process.exit(2);
}

const caseDir = resolve(CASE);
if (!existsSync(join(caseDir, "dispute-package.json")) || !existsSync(join(caseDir, "dispute-hashes.json"))) {
  console.error(`refusing: ${caseDir} is not a delivered dispute-package dir (dispute-package.json + dispute-hashes.json required)`);
  process.exit(2);
}

const outDir = OUT_ARG ? resolve(OUT_ARG) : join(dirname(caseDir), `${basename(caseDir)}-aea1-output`);
if (outDir === caseDir) {
  console.error("refusing: --out must not equal the case dir (the AEA/1 record never mutates the dispute package)");
  process.exit(2);
}

if (existsSync(outDir)) {
  const present = readdirSync(outDir);
  const foreign = present.filter((e) => !OUT_FILES.includes(e));
  if (present.length > 0 && foreign.length > 0) {
    console.error(`refusing: ${outDir} exists with files that are not AEA/1 output files (${foreign.join(", ")})`);
    process.exit(2);
  }
}
mkdirSync(outDir, { recursive: true });

const result = prepareAea1({ caseDir, outDir });
if (!result.ok) {
  console.error(`AEA1_BOUNDARY_FAILED at ${result.stage}: ${result.detail}`);
  process.exit(1);
}

const verify = verifyAea1(outDir);
if (!verify.ok) {
  console.error(`AEA1 self-verify FAILED at ${verify.failures.length} invariant(s):`);
  for (const f of verify.failures) console.error(`  ✖ ${f}`);
  process.exit(1);
}

console.log(`CoreGuard × ${AEA1} — Agentic Escrow & Arbitration Standard (structural, offline, deterministic)`);
console.log("─".repeat(72));
console.log(`case      : ${caseDir}`);
console.log(`out       : ${outDir}`);
console.log(`revision  : ${result.boundary.packageRevision}`);
console.log(`escrow    : REFERENCE_INTERFACE — deployed ${result.boundary.escrow.deployed}, chain ${result.boundary.escrow.chain} (no contract, no signing, no broadcast)`);
console.log(`award     : ${result.boundary.award.status} / adjudicator ${result.boundary.award.adjudicator} (never filled by the evidence layer)`);
console.log(`settlement: ${result.boundary.settlement.authorizationStatus} — funds ${result.boundary.settlement.funds} (no execution credential held)`);
console.log(`adapter   : ${result.boundary.adapter.integrationStatus} · network ${result.boundary.adapter.networkCall}`);
console.log("─".repeat(72));
console.log(`decision: AEA1_BOUNDARY_READY — ${verify.checks.length} invariants re-verified (${verify.failures.length} failures)`);
console.log("boundary: connects a verified ADAL/1 dispute package to an escrow-contract interface and a tribunal submission surface. It does not adjudicate, settle, broadcast, or claim any integration.");
process.exit(0);