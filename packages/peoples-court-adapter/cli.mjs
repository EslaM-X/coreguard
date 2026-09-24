#!/usr/bin/env node
/**
 * cli.mjs — `npm run peoples-court:prepare -- --case <dispute-package-dir> [--out <out>]`
 *
 * Offline, deterministic dry-run: verifies the ADAL/1 dispute package (fail
 * closed), derives the eight status labels, schema-validates the Partner-API
 * mapping, and emits expected-request.json + expected-response.json +
 * adapter-report.json into the out directory.
 *
 * Exit codes:
 *   0  PEOPLES_COURT_ADAPTER_READY — package verified, mapped, fixtures written
 *   1  fail-closed (verification, label derivation, or schema validation failed;
 *      nothing is emitted)
 *   2  usage error (missing/empty --case, out dir holds foreign files, case dir
 *      incomplete)
 */

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { prepareDryRun, OUT_FILES } from "./adapter.mjs";

const args = process.argv.slice(2);
const caseIdx = args.indexOf("--case");
const outIdx = args.indexOf("--out");
const CASE = caseIdx === -1 ? null : args[caseIdx + 1];
const OUT_ARG = outIdx === -1 ? null : args[outIdx + 1];

if (caseIdx === -1 || !CASE) {
  console.error("usage: node packages/peoples-court-adapter/cli.mjs --case <dispute-package-dir> [--out <out>]");
  process.exit(2);
}

const caseDir = resolve(CASE);
if (!existsSync(join(caseDir, "dispute-package.json")) || !existsSync(join(caseDir, "dispute-hashes.json"))) {
  console.error(`refusing: ${caseDir} is not a delivered dispute-package dir (dispute-package.json + dispute-hashes.json required)`);
  process.exit(2);
}

const outDir = OUT_ARG ? resolve(OUT_ARG) : join(dirname(caseDir), `${basename(caseDir)}-adapter-output`);

if (outDir === caseDir) {
  console.error("refusing: --out must not equal the case dir (the adapter never mutates the dispute package)");
  process.exit(2);
}

if (existsSync(outDir)) {
  const present = readdirSync(outDir);
  const foreign = present.filter((e) => !OUT_FILES.includes(e));
  if (present.length > 0 && foreign.length > 0) {
    console.error(`refusing: ${outDir} exists with files that are not adapter-output files (${foreign.join(", ")})`);
    process.exit(2);
  }
}

mkdirSync(outDir, { recursive: true });

const result = prepareDryRun({ caseDir, outDir });

if (!result.ok) {
  console.error(`PEOPLES_COURT_ADAPTER_FAILED at ${result.stage}: ${result.detail}`);
  process.exit(1);
}

const l = result.labels;
console.log("CoreGuard × People's Court — structural dry-run adapter");
console.log("─".repeat(72));
console.log(`case      : ${caseDir}`);
console.log(`out       : ${outDir}`);
console.log(`authority : ${l.authority}  (candidate derived from modeled consent parties; live grant needs authorized credential + platform confirmation)`);
console.log(`consent   : ${l.consent}  (EVP/1 labels verified; never converted to bilateral real-world consent)`);
console.log(`execution : ${l.execution}`);
console.log(`evidence  : ${l.evidence}  (pin + evidenceStatus/actualStatus split preserved)`);
console.log(`record    : ${l.record}  (protocol identity)`);
console.log(`award     : ${l.award}  (award slot UNKNOWN; awards come from an external adjudicator, never CoreGuard)`);
console.log(`settlement: ${l.settlement}  (escrow reference-only; award unknown; execution credential-scoped and separate)`);
console.log(`network   : ${l["network-call"]}  (no live call, no credential, no submission)`);
console.log("─".repeat(72));
console.log(`decision: PEOPLES_COURT_ADAPTER_READY`);
console.log(`boundary: structurally mapped against the publicly documented People's Court Partner API v2 + x402 dispute surface; live submission remains credential-gated and was not performed.`);
process.exit(0);