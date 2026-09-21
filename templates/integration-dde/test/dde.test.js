/**
 * {{NAME}} — DDE contract tests (node:test).
 *
 *   node --test
 *
 * These pin the DDE/1 boundary for this project's fixture:
 *   - the fixture verifies (VERIFIED, 9 PASS + E5 NOT_RUN) with pins intact
 *   - tampering with a byte of delivery content fails E3 (fail-closed)
 *   - payment settlement alone never satisfies the release gate
 *   - a party ACCEPTED record resting on criteria releases the gate
 * Run against the bundled engine (engine-dde.mjs), which CI in the coreguard
 * repository keeps aligned with packages/delivery on this fixture.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  loadFixtureFromDir,
  verifyDeliveryFixture,
  verifyPins,
  releaseWhen,
  BOUNDARY_BANNER,
} from "../engine-dde.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "dde-fixture");

test("fixture pins re-hash to their recorded SHA-256 values", async () => {
  const pins = await verifyPins(dir);
  assert.equal(pins.result, "PASS");
  assert.equal(pins.checked.length, 10);
});

test("fixture verifies: VERIFIED with 9 PASS + E5 NOT_RUN (consent never fabricated)", async () => {
  const report = await verifyDeliveryFixture(loadFixtureFromDir(dir));
  assert.equal(report.status, "VERIFIED");
  assert.equal(report.decision, "EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE");
  assert.equal(report.summary.fail, 0);
  assert.equal(report.summary.notRun, 1);
  const e5 = report.checks.find((c) => c.id === "E5");
  assert.equal(e5.result, "NOT_RUN");
  // every report carries the boundary — quote one, you quote both
  assert.equal(report.boundary, BOUNDARY_BANNER.statement);
});

test("flipping one content byte fails E3 and rejects the fixture", async () => {
  const fixture = loadFixtureFromDir(dir);
  const art = fixture.delivery.artifacts[0];
  const tampered = { ...fixture };
  tampered.delivery = {
    ...fixture.delivery,
    artifacts: [{ ...art, content: art.content.replace("Replace", "ReplacE") }],
  };
  const report = await verifyDeliveryFixture(tampered);
  assert.equal(report.status, "REJECTED");
  const e3 = report.checks.find((c) => c.id === "E3");
  assert.equal(e3.result, "FAIL");
  assert.ok(e3.mismatches.length > 0);
});

test("payment settlement alone never releases the gate", async () => {
  const report = await verifyDeliveryFixture(loadFixtureFromDir(dir));
  const never = () => false;
  const gate = releaseWhen({ ...report, checks: [] }, never);
  assert.equal(gate.release, false);
  assert.ok(gate.reasons.some((r) => r.includes("acceptance condition did not hold")));
});

test("a party ACCEPTED record resting on criteria releases the gate", async () => {
  const report = await verifyDeliveryFixture(loadFixtureFromDir(dir));
  const acc = JSON.parse(readFileSync(join(dir, "acceptance-record.json"), "utf8"));
  acc.verdict = "ACCEPTED";
  const gate = releaseWhen(report, () =>
    acc.verdict === "ACCEPTED" &&
    acc.basis.includes("CRITERIA_EVALUATION") &&
    acc.signedBy.length > 0
  );
  assert.equal(gate.release, true);
  assert.deepEqual(gate.reasons, []);
});
