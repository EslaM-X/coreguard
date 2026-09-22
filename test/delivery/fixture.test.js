/**
 * DDE/1 — Delivery & Dispute Evidence: executable contract.
 *
 * One row per observable behavior of the layer, exercised through its real
 * entry points: the engine API (packages/delivery), the generator
 * (make-fixture.mjs), and the CLI verifier (verify-fixture.mjs).
 *
 * The table IS the contract:
 *   happy path            → VERIFIED, all checks PASS
 *   each boundary defect  → exactly its check FAILs (fail-closed)
 *   no EVM adapter        → E5 NOT_RUN (never fabricated)
 *   tamper one byte       → E3 FAIL, CLI exit 1
 *   engine adjudication   → structurally impossible
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  verifyDeliveryFixture,
  checkExecutionAcceptanceSeparation,
  checkCriteriaClosure,
  checkB1PaymentInferenceForbidden,
  checkB2ExecutionDoesNotDecideConformity,
  checkB3NoEngineAdjudication,
  checkLifecycleConsistency,
  mapToPeoplesCourt,
  replayDeliveryIntegrity,
  BOUNDARY_BANNER,
  REMEDIES,
} from "../../packages/delivery/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE_DIR = join(REPO, "examples", "delivery-fixture");
const evm = await import("../../packages/evm/index.js");

// ------------------------------------------------------------ load fixture

function loadFixture() {
  const manifest = JSON.parse(readFileSync(join(FIXTURE_DIR, "hashes.json"), "utf8"));
  const ALIAS = { deliveryManifest: "delivery", executionAttestation: "execution" };
  const files = {
    "agreement.json": "agreement",
    "acceptance-criteria.json": "acceptanceCriteria",
    "parties.json": "parties",
    "authorization.json": "authorization",
    "execution-attestation.json": "execution",
    "delivery-manifest.json": "delivery",
    "acceptance-record.json": "acceptanceRecord",
    "dispute-record.json": "disputeRecord",
    "consent-and-disclosure.json": "consentAndDisclosure",
    "retention-policy.json": "retentionPolicy",
  };
  const fixture = { origin: manifest.fixture.origin, lifecycleState: manifest.fixture.lifecycleState };
  for (const [name, key] of Object.entries(files)) {
    fixture[ALIAS[key] || key] = JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8"));
  }
  return fixture;
}

const base = loadFixture();

/** Deep-clone with a mutation hook — every defect test starts from the honest fixture. */
function defect(mutate) {
  const f = JSON.parse(JSON.stringify(base));
  mutate(f);
  return f;
}

async function checkIds(fixture, evmAdapter) {
  const rep = await verifyDeliveryFixture(fixture, evmAdapter);
  return { rep, byId: Object.fromEntries(rep.checks.map((c) => [c.id, c])) };
}

// ---------------------------------------------------------------- happy path

test("happy path: honest fixture is VERIFIED with all 10 checks PASS", async () => {
  const { rep } = await checkIds(base, evm);
  assert.equal(rep.status, "VERIFIED");
  assert.equal(rep.decision, "EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE");
  assert.equal(rep.summary.total, 10);
  assert.equal(rep.summary.fail, 0);
  assert.equal(rep.summary.notRun, 0);
  assert.ok(rep.checks.every((c) => c.result === "PASS"));
});

test("boundary banner: every report carries the binding statement", async () => {
  const { rep } = await checkIds(base, evm);
  assert.equal(rep.boundary, BOUNDARY_BANNER.statement);
  assert.match(rep.boundary, /does not decide delivery conformity/);
});

test("fixture origin is loudly SYNTHETIC with realDisputeExists=false", () => {
  const manifest = JSON.parse(readFileSync(join(FIXTURE_DIR, "hashes.json"), "utf8"));
  const consent = JSON.parse(readFileSync(join(FIXTURE_DIR, "consent-and-disclosure.json"), "utf8"));
  assert.equal(manifest.fixture.origin, "SYNTHETIC");
  assert.equal(consent.disclosure.realDisputeExists, false);
  assert.equal(consent.disclosure.realTransactionAnchor, true);
});

test("execution anchor is REAL and matches the public Pilot-1 artifact", () => {
  const exec = JSON.parse(readFileSync(join(FIXTURE_DIR, "execution-attestation.json"), "utf8"));
  assert.equal(exec.origin, "REAL");
  assert.equal(exec.txHash, "0xe67c61fda81200bf026faee31c23a7b7e7f56ed24f06ffe24f071fa06891a9b8");
  assert.equal(exec.receipt.status, "0x1 (success)");
  assert.equal(exec.receipt.blockNumber, "38712625");
  assert.equal(exec.chainId, "1116");
  // the honesty rule: payment settled is an execution fact, never conformity
  assert.equal(exec.paymentSettled, true);
});

// ------------------------------------------------------------ E5 — crypto

test("E5: consent signatures genuinely replay to their declared grantors", async () => {
  const { byId } = await checkIds(base, evm);
  assert.equal(byId.E5.result, "PASS");
});

test("E5: a substituted grantor breaks the consent replay (FAIL)", async () => {
  const f = defect((x) => { x.consentAndDisclosure.redactionGrants[0].grantor = x.consentAndDisclosure.redactionGrants[1].grantor; });
  const { byId } = await checkIds(f, evm);
  assert.equal(byId.E5.result, "FAIL");
  assert.match(byId.E5.reasons.join(" "), /recovered .* != grantor/);
});

test("E5: without an EVM adapter the check is NOT_RUN — never fabricated", async () => {
  const { byId } = await checkIds(base, undefined);
  assert.equal(byId.E5.result, "NOT_RUN");
  assert.match(byId.E5.note, /never fabricated/);
  // the rest of the gate still runs and still passes
  assert.equal(byId.F1.result, "PASS");
  assert.equal(byId.E3.result, "PASS");
});

// ------------------------------------------------- F1 — separation defects

test("F1: acceptance grounds quoting payment settlement is rejected", () => {
  const f = defect((x) => { x.acceptanceRecord.note = "payment settled in full — accepted"; });
  const r = checkExecutionAcceptanceSeparation(f);
  assert.equal(r.result, "FAIL");
  assert.ok(r.reasons.some((x) => x.includes("payment settled")));
});

test("F1: derivedFrom execution marker is rejected", () => {
  const f = defect((x) => { x.acceptanceRecord.derivedFrom = "execution"; });
  const r = checkExecutionAcceptanceSeparation(f);
  assert.equal(r.result, "FAIL");
  assert.ok(r.reasons.some((x) => x.includes("derivedFrom")));
});

test("F1: acceptance without a signer is rejected (party act, not inference)", async () => {
  const f = defect((x) => { x.acceptanceRecord.signedBy = []; });
  const { byId } = await checkIds(f, evm);
  assert.equal(byId.F1.result, "FAIL");
});

// ------------------------------------------------- F2 — criteria closure

test("F2: a silently skipped criterion fails closure", () => {
  const f = defect((x) => { x.acceptanceRecord.evaluations = x.acceptanceRecord.evaluations.filter((e) => e.criterionId !== "C-QUALITY"); });
  const r = checkCriteriaClosure(f);
  assert.equal(r.result, "FAIL");
  assert.deepEqual(r.unevaluated, ["C-QUALITY"]);
});

test("F2: an evaluation citing a nonexistent criterion fails closure", () => {
  const f = defect((x) => { x.acceptanceRecord.evaluations.push({ criterionId: "C-GHOST", result: "PASS", observed: "invented" }); });
  const r = checkCriteriaClosure(f);
  assert.equal(r.result, "FAIL");
  assert.ok(r.uncited.includes("C-GHOST"));
});

// ------------------------------------------------- E3 — delivery integrity

test("E3: one flipped byte in one artifact is caught", async () => {
  const f = defect((x) => {
    const art = x.delivery.artifacts.find((a) => a.id === "handoff-notes.txt");
    art.content = art.content.slice(0, -1) + String.fromCharCode(art.content.charCodeAt(art.content.length - 1) ^ 0x01);
  });
  const r = await replayDeliveryIntegrity(f.delivery);
  assert.equal(r.result, "FAIL");
  assert.match(r.mismatches[0], /handoff-notes\.txt/);
});

test("E3: malformed pin shape fails closed", async () => {
  const f = defect((x) => { x.delivery.artifacts[0].sha256 = "0xdeadbeef"; });
  const r = await replayDeliveryIntegrity(f.delivery);
  assert.equal(r.result, "FAIL");
  assert.ok(r.mismatches[0].includes("malformed"));
});

// ------------------------------------------------- E4 — authorization chain

test("E4: delivery referencing another agreement fails binding", async () => {
  const f = defect((x) => { x.delivery.agreementRef = "some-other-agreement"; });
  const { byId } = await checkIds(f, evm);
  assert.equal(byId.E4.result, "FAIL");
  assert.match(byId.E4.reasons.join(" "), /agreementRef/);
});

test("E4: authorization by an agent outside the agreement fails binding", async () => {
  const f = defect((x) => { x.authorization.subject = "0x1234567890123456789012345678901234567890"; });
  const { byId } = await checkIds(f, evm);
  assert.equal(byId.E4.result, "FAIL");
  assert.match(byId.E4.reasons.join(" "), /agentAddress/);
});

// ------------------------------------------------- B1/B2/B3 — the boundary

test("B1: basis=[PAYMENT_SETTLED] alone can never be the acceptance basis", () => {
  const f = defect((x) => { x.acceptanceRecord.basis = ["PAYMENT_SETTLED"]; });
  const r = checkB1PaymentInferenceForbidden(f);
  assert.equal(r.result, "FAIL");
  assert.match(r.reasons[0], /payment cannot be the acceptance basis/);
});

test("B1: ACCEPTED without a CRITERIA_EVALUATION basis is rejected", () => {
  const f = defect((x) => { x.acceptanceRecord.basis = ["VISUAL_REVIEW"]; x.acceptanceRecord.verdict = "ACCEPTED"; });
  const r = checkB1PaymentInferenceForbidden(f);
  assert.equal(r.result, "FAIL");
  assert.match(r.reasons[0], /without CRITERIA_EVALUATION/);
});

test("B2: ACCEPTED with zero evaluations is structurally rejected", () => {
  const f = defect((x) => { x.acceptanceRecord.verdict = "ACCEPTED"; x.acceptanceRecord.evaluations = []; });
  const r = checkB2ExecutionDoesNotDecideConformity(f);
  assert.equal(r.result, "FAIL");
  assert.match(r.reasons[0], /something other than criteria/);
});

test("B3: a missing party position or remedy fails the record", () => {
  const f = defect((x) => { delete x.disputeRecord.partyB.requestedRemedy; });
  const r = checkB3NoEngineAdjudication(f);
  assert.equal(r.result, "FAIL");
  assert.match(r.reasons[0], /requestedRemedy/);
});

test("B3: remedies are a closed vocabulary — no free-form judgment", () => {
  const f = defect((x) => { x.disputeRecord.partyB.requestedRemedy = "BAN THE PROVIDER"; });
  const r = checkB3NoEngineAdjudication(f);
  assert.equal(r.result, "FAIL");
  assert.match(r.reasons[0], /closed remedy vocabulary/);
  assert.deepEqual([...REMEDIES].sort(), ["CREDIT", "FULL_REFUND", "NONE", "PARTIAL_REFUND", "REWORK"]);
});

test("the engine names no winner: dispute verdict fields are never produced", async () => {
  const { rep } = await checkIds(base, evm);
  const flat = JSON.stringify(rep);
  assert.ok(!flat.includes("winner"));
  assert.ok(!/"verdict"\s*:\s*"(PARTY_A|PARTY_B|PROVIDER_WINS|CLIENT_WINS)"/.test(flat));
});

// ------------------------------------------------- F3 — lifecycle

test("F3: a declared state that contradicts the records fails", () => {
  const f = defect((x) => { x.lifecycleState = "DRAFT"; });
  const r = checkLifecycleConsistency(f);
  assert.equal(r.result, "FAIL");
  assert.equal(r.expected, "DISPUTE_OPEN");
});

test("F3: the honest fixture's declared state matches its records", () => {
  const r = checkLifecycleConsistency(base);
  assert.equal(r.result, "PASS");
  assert.equal(r.declared, "DISPUTE_OPEN");
});

test("F3: a closed dispute record (closedAtUtc) establishes RECORD_CLOSED", () => {
  const f = defect((x) => {
    x.lifecycleState = "RECORD_CLOSED";
    x.disputeRecord.closedAtUtc = x.disputeRecord.recordClosesAtUtc;
  });
  const r = checkLifecycleConsistency(f);
  assert.equal(r.result, "PASS");
  assert.equal(r.declared, "RECORD_CLOSED");
  assert.equal(r.expected, "RECORD_CLOSED");
});

test("F3: declaring RECORD_CLOSED without closedAtUtc fails — closure is established, not declared", () => {
  const f = defect((x) => {
    x.lifecycleState = "RECORD_CLOSED";
    delete x.disputeRecord.closedAtUtc;
  });
  const r = checkLifecycleConsistency(f);
  assert.equal(r.result, "FAIL");
  assert.equal(r.declared, "RECORD_CLOSED");
  assert.equal(r.expected, "DISPUTE_OPEN");
});

// ------------------------------------- F0 — required records

test("F0: any missing mandatory record fails the gate", async () => {
  const f = defect((x) => { delete x.retentionPolicy; });
  const { byId } = await checkIds(f, evm);
  assert.equal(byId.F0.result, "FAIL");
  assert.deepEqual(byId.F0.missing, ["retentionPolicy"]);
});

// ------------------------------------- People's Court projection

test("PC mapping: the honest fixture maps all 9 evidence classes", () => {
  const pc = mapToPeoplesCourt(base);
  assert.equal(pc.mappable, true);
  assert.equal(pc.items.length, 9);
  assert.match(pc.readiness, /READY_FOR_CLAIM_MAPPING/);
  // the boundary must survive the projection
  assert.ok(!JSON.stringify(pc).includes("ACCEPTED_AS_CONFORMING"));
});

test("PC mapping: an incomplete fixture names its gaps instead of mapping", () => {
  const f = defect((x) => { delete x.retentionPolicy; });
  const pc = mapToPeoplesCourt(f);
  assert.equal(pc.mappable, false);
  assert.ok(pc.gaps.some((g) => g.includes("RETENTION")));
});

// ------------------------------------- generator determinism + CLI

test("generator: two runs produce byte-identical fixture files", () => {
  // Regenerate into a scratch directory — never into the live fixture dir.
  // Parallel test files (doc-curl harness, page guard) read those records;
  // writing them in place raced them on CI (torn read → JSON.parse("")).
  const scratch = mkdtempSync(join(tmpdir(), "dde-det-"));
  try {
    const before = readFileSync(join(FIXTURE_DIR, "agreement.json"));
    const r = spawnSync(process.execPath, [join(FIXTURE_DIR, "make-fixture.mjs"), "--out", scratch], { cwd: REPO });
    assert.equal(r.status, 0, `regeneration must succeed:\n${r.stderr}`);
    const after = readFileSync(join(scratch, "agreement.json"));
    assert.ok(before.equals(after), "regeneration must be byte-identical");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("CLI: clean verification exits 0 and prints the boundary", () => {
  const r = spawnSync(process.execPath, [join(FIXTURE_DIR, "verify-fixture.mjs")], { cwd: REPO, encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /VERIFIED \(10 PASS/);
  assert.match(r.stdout, /does not decide delivery conformity/);
});

// ------------------------------------- adversarial runner

test("adversarial runner: every F/E/B check catches its own mutation", () => {
  const r = spawnSync(process.execPath, [join(FIXTURE_DIR, "adversarial-runner.mjs")], { cwd: REPO, encoding: "utf8" });
  assert.equal(r.status, 0, `runner must exit 0 — gate holes:\n${r.stdout}`);
  assert.match(r.stdout, /ALL MUTATIONS CAUGHT/);
  assert.match(r.stdout, /survived: 0/);
});

test("adversarial runner: compound batteries — stacked mutations never blind each other", () => {
  const r = spawnSync(process.execPath, [join(FIXTURE_DIR, "adversarial-runner.mjs")], { cwd: REPO, encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /compound : 5 batteries · caught: 5 · survived: 0/);
  // the kitchen-sink battery stacks five mutations across three layers
  assert.match(r.stdout, /\[F0 \+ F1 \+ E3 \+ E4 \+ B2\]/);
});

test("adversarial runner fuzz mode: seed-deterministic stacks, all caught", () => {
  const RUNNER = join(FIXTURE_DIR, "adversarial-runner.mjs");
  const run = (args) => spawnSync(process.execPath, [RUNNER, ...args], { cwd: REPO, encoding: "utf8" });
  // 30 random stacks on a fixed seed: every member's own check must still fire.
  const r = run(["--fuzz", "30", "--seed", "424242"]);
  assert.equal(r.status, 0, `fuzz found a hole:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /fuzz     : seed 424242 · 30 stacks · survived: 0/);
  assert.match(r.stdout, /ALL MUTATIONS CAUGHT \(single \+ compound \+ fuzz\)/);
  // Determinism: same seed replays identical stacks; a different seed does not.
  const stacksOf = (out) => out.split("\n").filter((l) => l.includes(" round ")).join("\n");
  assert.equal(stacksOf(r.stdout), stacksOf(run(["--fuzz", "30", "--seed", "424242"]).stdout));
  assert.notEqual(stacksOf(r.stdout), stacksOf(run(["--fuzz", "30", "--seed", "777"]).stdout));
  // Machine report carries per-round centering with seed + survived count.
  const j = JSON.parse(run(["--fuzz", "10", "--json"]).stdout);
  assert.equal(j.summary.fuzzSeed, 424242);
  assert.equal(j.summary.fuzzRounds, 10);
  assert.equal(j.summary.fuzzSurvived, 0);
  assert.equal(j.fuzzResults.length, 10);
  for (const round of j.fuzzResults) {
    assert.ok(round.stack.length >= 1 && round.stack.length <= 10);
    assert.deepEqual(round.missedByOwnCheck, []);
  }
});

test("adversarial runner fuzz mode: usage errors are exit 2", () => {
  const RUNNER = join(FIXTURE_DIR, "adversarial-runner.mjs");
  const bad = spawnSync(process.execPath, [RUNNER, "--seed", "9"], { cwd: REPO, encoding: "utf8" });
  assert.equal(bad.status, 2); // --seed without --fuzz
  const bad2 = spawnSync(process.execPath, [RUNNER, "--fuzz", "0"], { cwd: REPO, encoding: "utf8" });
  assert.equal(bad2.status, 2); // non-positive rounds
});

test("adversarial runner multi-seed fuzz: one report, every seed labeled with its run number", () => {
  const RUNNER = join(FIXTURE_DIR, "adversarial-runner.mjs");
  const run = (args) => spawnSync(process.execPath, [RUNNER, ...args], { cwd: REPO, encoding: "utf8" });
  const r = run(["--fuzz", "8", "--seeds", "424242,777,9001"]);
  assert.equal(r.status, 0, `multi-seed fuzz found a hole:\n${r.stdout}\n${r.stderr}`);
  // Per-run headers carry the run number i/N next to the seed.
  assert.match(r.stdout, /run 1\/3 — seed 424242: 8 stacks · survived 0/);
  assert.match(r.stdout, /run 2\/3 — seed 777: 8 stacks · survived 0/);
  assert.match(r.stdout, /run 3\/3 — seed 9001: 8 stacks · survived 0/);
  assert.match(r.stdout, /fuzz x3   : 8 stacks\/seed over seeds \[424242, 777, 9001\] · survived total: 0/);
  assert.match(r.stdout, /ALL MUTATIONS CAUGHT \(single \+ compound \+ fuzz x3 seeds\)/);
  // Determinism: same seeds replay identical run content (whole report).
  const runsOf = (out) => out.split("\n").filter((l) => /run \d+\/\d+ — seed| round /.test(l)).join("\n");
  assert.equal(runsOf(r.stdout), runsOf(run(["--fuzz", "8", "--seeds", "424242,777,9001"]).stdout));
  // A different seed list changes at least one run's content.
  assert.notEqual(runsOf(r.stdout), runsOf(run(["--fuzz", "8", "--seeds", "424242,777,9002"]).stdout));
  // Each seed's rounds are independent: the shared generator drives both paths,
  // so the multi-seed run for seed 424242 must equal the single-seed run's rounds.
  const single = run(["--fuzz", "8", "--seed", "424242"]);
  const roundsOfSeed = (out) => out.split("\n").filter((l) => l.includes(" round ")).join("\n");
  const multiBlock = r.stdout.split("run 1/3 — seed 424242")[1].split("run 2/3")[0];
  // The multi-seed block indents rounds one level deeper (nested under the
  // run header) — normalize indentation before comparing round content.
  const norm = (s) => s.split("\n").map((l) => l.replace(/^\s+/, "")).join("\n");
  assert.equal(norm(roundsOfSeed(multiBlock)), norm(roundsOfSeed(single.stdout)));
  // Machine report: per-run summary + full per-run results.
  const j = JSON.parse(run(["--fuzz", "5", "--seeds", "424242,777", "--json"]).stdout);
  assert.deepEqual(j.summary.multiSeed, [424242, 777]);
  assert.deepEqual(
    j.summary.multiSeedRuns,
    [{ runNumber: 1, seed: 424242, rounds: 5, survived: 0 }, { runNumber: 2, seed: 777, rounds: 5, survived: 0 }],
  );
  assert.equal(j.summary.multiSeedTotalSurvived, 0);
  assert.deepEqual(j.multiSeedResults.map((m) => [m.runNumber, m.seed, m.results.length]), [[1, 424242, 5], [2, 777, 5]]);
  for (const runRes of j.multiSeedResults) {
    for (const round of runRes.results) assert.deepEqual(round.missedByOwnCheck, []);
  }
});

test("adversarial runner multi-seed fuzz: usage errors are exit 2 with named reasons", () => {
  const RUNNER = join(FIXTURE_DIR, "adversarial-runner.mjs");
  // --seed and --seeds are mutually exclusive (single run vs multi-seed report).
  const both = spawnSync(process.execPath, [RUNNER, "--fuzz", "5", "--seed", "424242", "--seeds", "424242"], { cwd: REPO, encoding: "utf8" });
  assert.equal(both.status, 2);
  assert.match(both.stderr, /mutually exclusive/);
  // Non-integer seeds are refused by name.
  const badSeed = spawnSync(process.execPath, [RUNNER, "--seeds", "424242,abc"], { cwd: REPO, encoding: "utf8" });
  assert.equal(badSeed.status, 2);
  assert.match(badSeed.stderr, /comma-separated list of integers/);
  // Empty list is refused.
  const empty = spawnSync(process.execPath, [RUNNER, "--seeds", ""], { cwd: REPO, encoding: "utf8" });
  assert.equal(empty.status, 2);
  assert.match(empty.stderr, /comma-separated list of integers/);
});

test("CLI: --tamper flips a byte in memory and exits 1 fail-closed", () => {
  const r = spawnSync(process.execPath, [join(FIXTURE_DIR, "verify-fixture.mjs"), "--tamper", "logo.svg"], { cwd: REPO, encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /one byte flipped in memory/);
  assert.match(r.stdout, /E3\s+DELIVERY_INTEGRITY_REPLAY\s+FAIL/);
});

test("CLI: the tamper demo never writes to disk (fixture unchanged)", async () => {
  spawnSync(process.execPath, [join(FIXTURE_DIR, "verify-fixture.mjs"), "--tamper", "logo.svg"], { cwd: REPO });
  const manifest = JSON.parse(readFileSync(join(FIXTURE_DIR, "hashes.json"), "utf8"));
  const { artifactSha256 } = await import("../../packages/delivery/index.js");
  const d = JSON.parse(readFileSync(join(FIXTURE_DIR, "delivery-manifest.json"), "utf8"));
  for (const art of d.artifacts) {
    assert.equal(await artifactSha256(art.content), art.sha256, `artifact ${art.id} bytes must be untouched`);
  }
  const actual = "0x" + (await import("node:crypto")).createHash("sha256").update(readFileSync(join(FIXTURE_DIR, "delivery-manifest.json"))).digest("hex");
  assert.equal(actual, manifest.files["delivery-manifest.json"]);
});
