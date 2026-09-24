import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  adjudicate,
  verifySyntheticAward,
  syntheticSign,
  SIMULATOR,
} from "../../examples/reference-tribunal/sim-tribunal.mjs";
import {
  executeSettlement,
  ESCROW,
} from "../../examples/reference-tribunal/mock-escrow.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CLI = join(REPO, "examples", "reference-tribunal", "sim-tribunal.mjs");
const ESCROW_CLI = join(REPO, "examples", "reference-tribunal", "mock-escrow.mjs");
const REF_A = join(REPO, "examples", "delivery-fixture", "pairs", "dispute-package", "reference-A");
const REF_B = join(REPO, "examples", "delivery-fixture", "pairs", "dispute-package", "reference-B");

function run(script, cwd, extraArgs = []) {
  return spawnSync(process.execPath, [script, ...extraArgs], { cwd, encoding: "utf8" });
}

function loadCase(dir) {
  const pkg = JSON.parse(readFileSync(join(dir, "dispute-package.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(dir, "dispute-hashes.json"), "utf8"));
  return { pkg, manifest };
}

function tmpDir(prefix) {
  const d = mkdtempSync(join(tmpdir(), prefix));
  return d;
}

test("tribunal: scenario A on reference-A produces a verifiable synthetic award + settlement", () => {
  const { pkg, manifest } = loadCase(REF_A);
  const r = adjudicate("A", pkg, manifest);
  assert.equal(r.ok, true, JSON.stringify(r.failures));
  assert.equal(r.stage, "tribunal-ready");
  assert.equal(verifySyntheticAward(r.award), true);
  assert.equal(r.award.simulator, SIMULATOR);
  assert.equal(r.award.signatureType, "SYNTHETIC_DEMO_HMAC");
  assert.equal(r.settlement.kind, "SETTLEMENT_INSTRUCTION");
  assert.equal(r.settlement.awardSignature, r.award.signature);
});

test("tribunal: scenarios B/C/D/E are fail-closed with distinct stages", () => {
  const { pkg, manifest } = loadCase(REF_B);
  const expectations = [
    ["B", "tribunal", /consent-GATE/],
    ["C", "settlement-blocked", /UNKNOWN is never converted to NOT_SETTLED/],
    ["D", "award-signature", /does not verify/],
    ["E", "verify", /tampered/],
  ];
  for (const [scenario, stage, re] of expectations) {
    const r = adjudicate(scenario, pkg, manifest);
    assert.equal(r.ok, false, `${scenario} must fail closed`);
    assert.equal(r.stage, stage, `${scenario} stage`);
    assert.equal(r.award, null);
    assert.equal(r.settlement, null);
    assert.ok(r.failures.some((f) => re.test(f)), `${scenario} failure text: ${r.failures.join(" | ")}`);
  }
});

test("tribunal: awards are deterministic — two adjudications produce byte-identical signature", () => {
  const { pkg, manifest } = loadCase(REF_A);
  const a = adjudicate("A", pkg, manifest);
  const b = adjudicate("A", pkg, manifest);
  assert.equal(a.award.signature, b.award.signature);
  assert.equal(a.settlement.awardSignature, b.settlement.awardSignature);
});

test("tribunal: synthetic signature binds award content — tampering breaks verification", () => {
  const { pkg, manifest } = loadCase(REF_A);
  const { award } = adjudicate("A", pkg, manifest);
  const boosted = { ...award, outcome: "bold claim: People's Court accepted this" };
  assert.equal(verifySyntheticAward(boosted), false);
  const forged = { ...award, signature: syntheticSign("something else") };
  assert.equal(verifySyntheticAward(forged), false);
});

test("escrow: executes only a valid, authority-bound settlement instruction", () => {
  const { pkg, manifest } = loadCase(REF_A);
  const { award, settlement } = adjudicate("A", pkg, manifest);
  const r = executeSettlement({ award, settlement });
  assert.equal(r.ok, true, JSON.stringify(r.refusals));
  assert.equal(r.receipt.escrow, ESCROW);
  assert.equal(r.receipt.actions.length, 1);
  assert.match(r.receipt.kind, /synthetic/);
});

test("escrow: refuses tampered award, missing signature, non-authority-bound action", () => {
  const { pkg, manifest } = loadCase(REF_A);
  const { award, settlement } = adjudicate("A", pkg, manifest);

  const tampered = { ...award, outcome: "tampered" };
  assert.equal(executeSettlement({ award: tampered, settlement }).ok, false);

  const noSig = { ...award, signature: undefined };
  assert.equal(executeSettlement({ award: noSig, settlement }).ok, false);

  const looseSettlement = {
    ...settlement,
    actions: [{ action: "RELEASE_ALL_FUNDS", scope: "authority corpus", authorityBound: false }],
  };
  assert.equal(executeSettlement({ award, settlement: looseSettlement }).ok, false);

  const emptyActions = { ...settlement, actions: [] };
  assert.equal(executeSettlement({ award, settlement: emptyActions }).ok, false);
});

test("tribunal CLI: scenario A writes synth award + settlement; B fails closed; usage exits 2", () => {
  const d = tmpDir("cgt-");
  try {
    const runA = run(CLI, REPO, ["--case", REF_A, "--scenario", "A", "--out", d]);
    assert.equal(runA.status, 0, runA.stdout + runA.stderr);
    assert.ok(existsSync(join(d, "tribunal-reference-A-synth-award.json")));
    assert.ok(existsSync(join(d, "tribunal-reference-A-synth-settlement.json")));

    const runB = run(CLI, REPO, ["--case", REF_B, "--scenario", "B", "--out", d]);
    assert.equal(runB.status, 1, "scenario B must fail closed");
    assert.match(runB.stdout + runB.stderr, /FAIL-CLOSED/);

    const usage = run(CLI, REPO, ["--case", REF_A]);
    assert.equal(usage.status, 2);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("tribunal CLI: tampered package fails at the verifier stage (scenario E semantics)", async () => {
  const d = tmpDir("cgt-");
  const { writeFileSync } = await import("node:fs");
  try {
    const caseDir = join(d, "case");
    mkdirSync(caseDir, { recursive: true });
    const { pkg, manifest } = loadCase(REF_A);
    pkg.evidence.consent.modeledAssent = "PARTIAL";
    writeFileSync(join(caseDir, "dispute-package.json"), JSON.stringify(pkg, null, 2) + "\n");
    writeFileSync(join(caseDir, "dispute-hashes.json"), JSON.stringify(manifest, null, 2) + "\n");
    const r = run(CLI, REPO, ["--case", caseDir, "--scenario", "A", "--out", d]);
    assert.equal(r.status, 1, "a tampered package must never reach the tribunal");
    assert.match(r.stdout + r.stderr, /FAIL-CLOSED at verify/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("escrow CLI: refuses a tampered award file", async () => {
  const d = tmpDir("cgte-");
  const { writeFileSync } = await import("node:fs");
  try {
    const { pkg, manifest } = loadCase(REF_A);
    const { award, settlement } = adjudicate("A", pkg, manifest);
    writeFileSync(join(d, "award.json"), JSON.stringify({ award }, null, 2) + "\n");
    writeFileSync(join(d, "settlement.json"), JSON.stringify({ settlement }, null, 2) + "\n");
    writeFileSync(join(d, "bad.json"), JSON.stringify({ award: { ...award, outcome: "tampered" } }, null, 2) + "\n");

    const good = run(ESCROW_CLI, REPO, ["--award", join(d, "award.json"), "--settlement", join(d, "settlement.json")]);
    assert.equal(good.status, 0, good.stdout + good.stderr);
    const bad = run(ESCROW_CLI, REPO, ["--award", join(d, "bad.json"), "--settlement", join(d, "settlement.json")]);
    assert.equal(bad.status, 1, "tampered award must be refused");
    assert.match(bad.stdout + bad.stderr, /REFUSED/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});