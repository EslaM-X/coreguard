/**
 * DDE SDK surface + agent-platform integration — executable contract.
 *
 *   verifyFixture (object | fixtureDir) → boundary-stamped report (engine semantics unchanged)
 *   releaseWhen(report, predicate)      → release only on VERIFIED + explicit predicate
 *   demo arc                            → 4 HOLDs (pending / REJECTED / tamper / honest boundary)
 *                                         + 1 RELEASE (modeled party acceptance) — nothing between
 *   wire arc (HTTP endpoint)            → 6 HOLDs (pending / REJECTED / tamper / honest
 *                                         boundary / dispute-open / declared-closure)
 *                                         + 3 RELEASEs (counterfactual / mutual both-party
 *                                         acceptance / record-closed) — closure is established
 *                                         by closedAtUtc, never declared into the wire
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyFixture, releaseWhen, loadFixtureFromDir } from "../../packages/delivery/sdk.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE_DIR = join(REPO, "examples", "delivery-fixture");
const DEMO = join(REPO, "examples", "agent-platform-integration", "run-integration-demo.mjs");
const WIRE_DEMO = join(REPO, "examples", "agent-platform-integration", "run-http-payout-gate.mjs");
const PERF_RUNNER = join(REPO, "scripts", "benchmark-dde.mjs");

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

test("wire demo: payout gated over the DDE HTTP endpoint — 6 holds, 3 releases", () => {
  const r = spawnSync(process.execPath, [WIRE_DEMO], { encoding: "utf8" });
  assert.equal(r.status, 0, `wire demo contract failed:\n${r.stdout}\n${r.stderr}`);
  assert.equal(r.stderr, "", "no libuv teardown noise may corrupt the verdict");
  assert.equal((r.stdout.match(/🔒/g) || []).length, 6);
  assert.equal((r.stdout.match(/✓/g) || []).length, 3);
  // The scenario rejection is named: failing criterion by id, observed vs required.
  assert.match(r.stdout, /C-QUALITY/);
  assert.match(r.stdout, /2 color tokens/);
  // Tamper is caught over the wire: 422 + the E3 mismatch with the artifact name.
  assert.match(r.stdout, /422 \(REJECTED\)/);
  assert.match(r.stdout, /E3 FAIL — handoff-notes\.txt: recorded/);
  // The boundary rides the wire report verbatim.
  assert.match(r.stdout, /CONFORMITY_UNDECIDED_BY_ENGINE/);
  assert.match(r.stdout, /NEITHER decides conformity/);
  // The open-dispute arc: acceptance is not immunity; closure is established, not declared.
  assert.match(r.stdout, /dispute re-opens the record anyway/);
  assert.match(r.stdout, /closure is established by closedAtUtc, not declared/);
  assert.match(r.stdout, /DDE named no winner/);
});

test("wire demo --json: machine contract — statuses and gate arc", () => {
  const r = spawnSync(process.execPath, [WIRE_DEMO, "--json"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  const j = JSON.parse(r.stdout);
  assert.equal(j.acts.length, 9);
  assert.deepEqual(j.acts.map((a) => a.httpStatus), [200, 200, 422, 200, 200, 200, 200, 422, 200]);
  assert.deepEqual(j.acts.map((a) => a.wireStatus),
    ["VERIFIED", "VERIFIED", "REJECTED", "VERIFIED", "VERIFIED", "VERIFIED", "VERIFIED", "REJECTED", "VERIFIED"]);
  assert.equal(j.acts.filter((a) => a.escrowState === "HELD").length, 6);
  assert.ok(j.acts[4].escrowState.startsWith("RELEASED")); // counterfactual acceptance
  assert.ok(j.acts[5].escrowState.startsWith("RELEASED")); // mutual both-party acceptance
  assert.equal(j.acts[6].escrowState, "HELD");             // dispute open — frozen
  assert.equal(j.acts[7].escrowState, "HELD");             // closure declared w/o evidence — refused
  assert.ok(j.acts[8].escrowState.startsWith("RELEASED")); // record closed by the procedure
});

test("perf: verifyFixture stays inside the 50ms budget — measured, not promised", async () => {
  await verifyFixture({ fixtureDir: FIXTURE_DIR }); // warmup (JIT + fs cache)
  const samples = [];
  for (let i = 0; i < 25; i++) {
    const t0 = performance.now();
    const report = await verifyFixture({ fixtureDir: FIXTURE_DIR });
    const dt = performance.now() - t0;
    assert.equal(report.status, "VERIFIED");
    samples.push(dt);
  }
  const median = samples.sort((a, b) => a - b)[12];
  assert.ok(median < 50, `median verify time ${median.toFixed(2)}ms must stay under the 50ms budget`);
});

test("perf gate runner: PASS with machine report — the benchmark itself stays under watch", () => {
  const r = spawnSync(process.execPath, [PERF_RUNNER, "--json"], { encoding: "utf8" });
  assert.equal(r.status, 0, `perf gate failed:\n${r.stdout}\n${r.stderr}`);
  const j = JSON.parse(r.stdout);
  assert.equal(j.gate, "PASS");
  assert.equal(j.verifiedRuns, j.iterations);
  assert.ok(j.stats.median <= j.budget.medianMs, `median ${j.stats.median}ms over budget`);
  assert.ok(j.stats.p95 <= j.budget.p95Ms, `p95 ${j.stats.p95}ms over tail budget`);
  assert.match(j.fixture, /delivery-fixture/);
});
