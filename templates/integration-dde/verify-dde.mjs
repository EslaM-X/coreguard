#!/usr/bin/env node
/**
 * verify-dde.mjs — one-command re-verification of this project's DDE/1
 * evidence fixture. Recomputes every artifact hash and every boundary check,
 * prints the full report, exits 0 only on VERIFIED.
 *
 *   node verify-dde.mjs
 *   node verify-dde.mjs --json
 *
 * This script verifies evidence; it never authorizes, signs, or broadcasts.
 */

import { loadFixtureFromDir, verifyDeliveryFixture, verifyPins, BOUNDARY_BANNER } from "./engine-dde.mjs";

const json = process.argv.includes("--json");
const dir = new URL("./dde-fixture/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const pins = await verifyPins(dir);
const report = await verifyDeliveryFixture(loadFixtureFromDir(dir));

const out = {
  tool: "verify-dde",
  fixtureDir: "dde-fixture/",
  pins: { result: pins.result, checked: pins.checked.length, mismatches: pins.mismatches },
  ...report,
};

if (json) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`\nCoreGuard DDE Verification — ${BOUNDARY_BANNER.code}`);
  console.log(`  ${BOUNDARY_BANNER.statement}\n`);
  console.log(`  pins:        ${pins.result} (${pins.checked.length} files re-hashed)`);
  for (const m of pins.mismatches) console.log(`    ! ${m}`);
  console.log(`  status:      ${report.status}`);
  console.log(`  decision:    ${report.decision}`);
  console.log(`  fixture:     origin=${report.fixtureOrigin}`);
  for (const c of report.checks) {
    const mark = c.result === "PASS" ? "OK  " : c.result === "NOT_RUN" ? "SKIP" : "FAIL";
    const extra = c.reasons?.length ? ` — ${c.reasons[0]}` : c.mismatches?.length ? ` — ${c.mismatches[0]}` : "";
    console.log(`    [${mark}] ${c.id} ${c.name}${extra}`);
  }
  console.log(`\n  summary: ${JSON.stringify(report.summary)}`);
  console.log("");
}

process.exit(out.status === "VERIFIED" && pins.result === "PASS" ? 0 : 1);
