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
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
  const before = readFileSync(join(FIXTURE_DIR, "agreement.json"));
  spawnSync(process.execPath, [join(FIXTURE_DIR, "make-fixture.mjs")], { cwd: REPO });
  const after = readFileSync(join(FIXTURE_DIR, "agreement.json"));
  assert.ok(before.equals(after), "regeneration must be byte-identical");
});

test("CLI: clean verification exits 0 and prints the boundary", () => {
  const r = spawnSync(process.execPath, [join(FIXTURE_DIR, "verify-fixture.mjs")], { cwd: REPO, encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /VERIFIED \(10 PASS/);
  assert.match(r.stdout, /does not decide delivery conformity/);
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
