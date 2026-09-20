/**
 * DDE SDK surface + agent-platform integration — executable contract.
 *
 *   verifyFixture (object | fixtureDir) → boundary-stamped report (engine semantics unchanged)
 *   releaseWhen(report, predicate)      → release only on VERIFIED + explicit predicate
 *   demo arc                            → 4 HOLDs (pending / REJECTED / tamper / honest boundary)
 *                                         + 1 RELEASE (modeled party acceptance) — nothing between
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyFixture, releaseWhen, loadFixtureFromDir } from "../../packages/delivery/sdk.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE_DIR = join(REPO, "examples", "delivery-fixture");
const DEMO = join(REPO, "examples", "agent-platform-integration", "run-integration-demo.mjs");

test("verifyFixture via fixtureDir: VERIFIED report stamped with the boundary", async () => {
  const report = await verifyFixture({ fixtureDir: FIXTURE_DIR });
  assert.equal(report.status, "VERIFIED");
  assert.equal(report.decision, "EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE");
  assert.equal(report.boundaryCode, "DDE-BOUNDARY");
  assert.match(report.boundary, /does not decide delivery conformity/);
  assert.equal(report.hashesManifest, "PRESENT");
});

test("verifyFixture via object: same semantics, manifest marked NOT_PROVIDED", async () => {
  const { fixture } = loadFixtureFromDir(FIXTURE_DIR);
  const report = await verifyFixture({ fixture });
  assert.equal(report.status, "VERIFIED");
  assert.equal(report.hashesManifest, "NOT_PROVIDED");
});

test("verifyFixture: tampered artifact → REJECTED (E3), boundary still stamped", async () => {
  const { fixture } = loadFixtureFromDir(FIXTURE_DIR);
  const art = fixture.delivery.artifacts.find((a) => a.id === "handoff-notes.txt");
  art.content = art.content.slice(0, -1) + String.fromCharCode(art.content.charCodeAt(art.content.length - 1) ^ 0x01);
  const report = await verifyFixture({ fixture });
  assert.equal(report.status, "REJECTED");
  const e3 = report.checks.find((c) => c.id === "E3");
  assert.equal(e3.result, "FAIL");
});

test("verifyFixture: no input → REJECTED with named error, never a throw", async () => {
  const report = await verifyFixture({});
  assert.equal(report.status, "REJECTED");
  assert.match(report.error, /no fixture provided/);
});

test("releaseWhen: refuses release without a VERIFIED report — structurally", async () => {
  const rejected = { status: "REJECTED", decision: "FIXTURE_REJECTED" };
  const gate = releaseWhen(rejected, () => true);
  assert.equal(gate.release, false);
  assert.match(gate.reasons[0], /no release without a VERIFIED report/);
});

test("releaseWhen: VERIFIED report still needs the platform's own predicate", async () => {
  const report = await verifyFixture({ fixtureDir: FIXTURE_DIR });
  const gate = releaseWhen(report, () => false);
  assert.equal(gate.release, false);
  assert.match(gate.reasons[0], /acceptance condition did not hold/);
  const gate2 = releaseWhen(report, () => true);
  assert.equal(gate2.release, true);
});

test("releaseWhen: a predicate throwing is a hold, not a crash", async () => {
  const report = await verifyFixture({ fixtureDir: FIXTURE_DIR });
  const gate = releaseWhen(report, () => { throw new Error("platform bug"); });
  assert.equal(gate.release, false);
  assert.match(gate.reasons[0], /predicate error/);
});

test("demo: 4 HOLDs then 1 RELEASE — the boundary arc end-to-end", () => {
  const r = spawnSync(process.execPath, [DEMO], { encoding: "utf8" });
  assert.equal(r.status, 0, `demo contract failed:\n${r.stdout}\n${r.stderr}`);
  const holds = (r.stdout.match(/🔒/g) || []).length;
  const releases = (r.stdout.match(/✓/g) || []).length;
  assert.equal(holds, 4);
  assert.equal(releases, 1);
  assert.match(r.stdout, /NEITHER decides conformity/);
});
