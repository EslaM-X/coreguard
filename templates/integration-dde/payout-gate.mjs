#!/usr/bin/env node
/**
 * payout-gate.mjs — the payment release loop this scaffold exists to teach.
 *
 * The law: payment release requires BOTH
 *   1. engine VERIFIED  — the evidence record is admissible (DDE/1), and
 *   2. party ACCEPTED   — a signed acceptance record resting on criterion
 *                         evaluations that the platform's predicate honors.
 *
 * A settled transaction satisfies neither half alone. When the gate holds,
 * it names its reasons; when it releases, the report it acted on still
 * carries the boundary — quote one, you quote both.
 *
 *   node payout-gate.mjs            # run both scenarios against the fixture
 *   node payout-gate.mjs --json     # machine-readable verdicts
 *
 * This script gates payment; it never moves funds and never signs.
 */

import { loadFixtureFromDir, verifyDeliveryFixture, releaseWhen } from "./engine-dde.mjs";

const json = process.argv.includes("--json");
const dir = new URL("./dde-fixture/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const report = await verifyDeliveryFixture(loadFixtureFromDir(dir));

/**
 * The platform's acceptance condition — replace with your real policy.
 * The scaffold's rule: the signed acceptance record must be ACCEPTED with a
 * CRITERIA_EVALUATION basis and a party signature. Note what the predicate
 * must NOT do: read `execution` for conformity (B2) or treat payment
 * settlement as acceptance (B1) — the engine already fails those shapes
 * upstream. The predicate reads the acceptance record directly:
 */
const { readFileSync } = await import("node:fs");
const acc = JSON.parse(readFileSync(`${dir}acceptance-record.json`, "utf8"));
const predicate = () =>
  acc.verdict === "ACCEPTED" &&
  Array.isArray(acc.basis) &&
  acc.basis.includes("CRITERIA_EVALUATION") &&
  Array.isArray(acc.signedBy) &&
  acc.signedBy.length > 0;

const gate = releaseWhen(report, predicate);

// Scenario: what a payment-settled claim would change — nothing.
const settledOnly = releaseWhen({ ...report, checks: [] }, () => false);

const out = {
  tool: "payout-gate",
  fixtureDir: "dde-fixture/",
  scenarios: [
    { name: "fixture as shipped (party REJECTED on criteria)", release: gate.release, reasons: gate.reasons },
    { name: "execution claimed verified, no party acceptance", release: settledOnly.release, reasons: settledOnly.reasons },
  ],
  boundary: report.boundary,
};

if (json) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`\nCoreGuard DDE payout gate — ${report.decision}\n`);
  for (const s of out.scenarios) {
    console.log(`  ${s.name}`);
    console.log(`    → ${s.release ? "RELEASE" : "HOLD"}`);
    for (const r of s.reasons) console.log(`      · ${r}`);
  }
  console.log(`\n  ${report.boundary}\n`);
}

process.exit(gate.release ? 0 : 2); // exit 2 = held, not an error
