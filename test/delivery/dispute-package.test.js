import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CLINode = join(REPO, "scripts", "make-dispute-package.mjs");
const GEN = join(REPO, "examples", "delivery-fixture", "pairs", "dispute-package", "make-dispute-package.mjs");
const VERIFY = join(REPO, "examples", "delivery-fixture", "pairs", "dispute-package", "verify-dispute-package.mjs");
const ASSENT_A = join(REPO, "examples", "delivery-fixture", "pairs", "assent-pair", "assent-a.json");
const ASSENT_B = join(REPO, "examples", "delivery-fixture", "pairs", "assent-pair", "assent-b.json");
const OUT_FILES = ["dispute-package.json", "dispute-hashes.json"];

function run(script, cwd, extraArgs = []) {
  return spawnSync(process.execPath, [script, ...extraArgs], { cwd, encoding: "utf8" });
}

function tmpDir() {
  return mkdtempSync(join(tmpdir(), "cg-dpk-test-"));
}

function withTmp(fn) {
  const d = tmpDir();
  try {
    return fn(d);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}

test("ADAL/1: one-command CLI delivers DP_OK for case A and B (exit 0)", () => {
  for (const c of ["A", "B"]) {
    withTmp((dir) => {
      const out = join(dir, "out");
      const r = run(CLINode, REPO, ["--case", c, "--out", out]);
      assert.equal(r.status, 0, `case ${c} CLI: ${r.stdout}\n${r.stderr}`);
      assert.match(r.stdout, /DISPUTE_PACKAGE OK/);
      assert.match(r.stdout, /decision: DP_OK/);
      for (const f of OUT_FILES) assert.ok(existsSync(join(out, f)), `${f} missing`);
    });
  }
});

test("ADAL/1: determinism — two runs are byte-identical", () => {
  withTmp((dir) => {
    const out1 = join(dir, "o1");
    const out2 = join(dir, "o2");
    const r1 = run(GEN, REPO, ["--case", "A", "--out", out1]);
    const r2 = run(GEN, REPO, ["--case", "A", "--out", out2]);
    assert.equal(r1.status, 0, r1.stderr);
    assert.equal(r2.status, 0, r2.stderr);
    for (const f of OUT_FILES) assert.deepEqual(readFileSync(join(out1, f)), readFileSync(join(out2, f)), `${f} differs`);
  });
});

test("ADAL/1: evidence layer byte-parity — no field overwritten by the dispute generator", () => {
  withTmp((dir) => {
    const out = join(dir, "out");
    const r = run(GEN, REPO, ["--case", "B", "--out", out]);
    assert.equal(r.status, 0, r.stderr);
    const pkg = JSON.parse(readFileSync(join(out, "dispute-package.json"), "utf8"));
    const committed = JSON.parse(readFileSync(ASSENT_B, "utf8"));
    const serialized = JSON.stringify(pkg.evidence, null, 2) + "\n";
    const expected = JSON.stringify(committed, null, 2) + "\n";
    assert.equal(serialized, expected, "evidence layer must serialize byte-identically to the committed assent-B record");
    // spot-check a couple of label fields survived untouched
    assert.equal(pkg.evidence.consent.modeledAssent, "PARTIAL");
    assert.equal(pkg.evidence.consent.parties.principalB.assent, "UNKNOWN");
    assert.equal(pkg.evidence.execution.compensationSettlement.evidenceStatus, "NOT_EVIDENCED_AS_SETTLED");
  });
});

test("ADAL/1: award slot never prefilled; escrow reference-only; adapter NOT_BUILT (verifier guards)", () => {
  withTmp((dir) => {
    const out = join(dir, "out");
    run(GEN, REPO, ["--case", "A", "--out", out]);
    const v = run(VERIFY, out);
    assert.equal(v.status, 0, v.stdout + v.stderr);
    assert.match(v.stdout, /DISPUTE_PACKAGE OK/);
    const pkg = JSON.parse(readFileSync(join(out, "dispute-package.json"), "utf8"));
    assert.equal(pkg.awardSlot.status, "UNKNOWN");
    assert.equal(pkg.awardSlot.signedReasonedAward, null);
    assert.equal(pkg.awardSlot.adjudicator, "NONE");
    assert.equal(pkg.escrowRef.deployed, false);
    assert.equal(pkg.escrowRef.chain, "none");
    assert.equal(pkg.adapter.integrationStatus, "NOT_BUILT");
    assert.deepEqual(pkg.adapter.consumers, []);
  });
});

test("ADAL/1: fail-closed — tampering the award slot to a signed award fails verification", () => {
  withTmp((dir) => {
    const out = join(dir, "out");
    run(GEN, REPO, ["--case", "A", "--out", out]);
    const path = join(out, "dispute-package.json");
    const pkg = JSON.parse(readFileSync(path, "utf8"));
    pkg.awardSlot = { status: "ISSUED", signedReasonedAward: "definitely-real", adjudicator: "X" };
    writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
    const v = run(VERIFY, out);
    assert.notEqual(v.status, 0, "tampered award slot must fail closed");
    assert.match(v.stdout + v.stderr, /V5/);
  });
});

test("ADAL/1: fail-closed — escrow marked deployed fails; adapter claimed built fails", () => {
  for (const tamper of ["deployed", "adapter"]) {
    withTmp((dir) => {
      const out = join(dir, "out");
      run(GEN, REPO, ["--case", "B", "--out", out]);
      const path = join(out, "dispute-package.json");
      const pkg = JSON.parse(readFileSync(path, "utf8"));
      if (tamper === "deployed") {
        pkg.escrowRef = { ...pkg.escrowRef, deployed: true, chain: "core-mainnet" };
      } else {
        pkg.adapter = { ...pkg.adapter, integrationStatus: "LIVE", consumers: ["some-platform"] };
      }
      writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
      const v = run(VERIFY, out);
      assert.notEqual(v.status, 0, `${tamper} tamper must fail closed`);
      assert.match(v.stdout + v.stderr, tamper === "deployed" ? /V6/ : /V7/);
    });
  }
});

test("ADAL/1: fail-closed — pin tamper (anything other than an exact byte match is rejected)", () => {
  withTmp((dir) => {
    const out = join(dir, "out");
    run(GEN, REPO, ["--case", "A", "--out", out]);
    const path = join(out, "dispute-package.json");
    const raw = readFileSync(path, "utf8");
    writeFileSync(path, raw.replace("FULL", "UNKNOWN"));
    const v = run(VERIFY, out);
    assert.notEqual(v.status, 0, "pin tamper must fail closed");
    assert.match(v.stdout + v.stderr, /V1/);
  });
});

test("ADAL/1: usage errors exit 2 (missing --case, invalid case, missing --out, foreign files)", () => {
  const cases = [
    [CLINode, REPO, []],
    [CLINode, REPO, ["--out", "x"]],
    [CLINode, REPO, ["--case", "C", "--out", "x"]],
    [CLINode, REPO, ["--case", "A"]],
  ];
  for (const [script, cwd, args] of cases) {
    const r = run(script, cwd, args);
    assert.equal(r.status, 2, `args ${JSON.stringify(args)} must exit 2 (got ${r.status})`);
  }
  withTmp((dir) => {
    const out = join(dir, "occupied");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "junk.txt"), "foreign");
    const r = run(CLINode, REPO, ["--case", "A", "--out", out]);
    assert.equal(r.status, 2, "dir with foreign files must refuse with exit 2");
  });
});

test("ADAL/1: verifier exit 2 outside a dispute-package dir", () => {
  withTmp((dir) => {
    const r = run(VERIFY, dir);
    assert.equal(r.status, 2);
  });
});

test("ADAL/1: package boundary declares synthetic + no overclaim, generated package readable", () => {
  withTmp((dir) => {
    const out = join(dir, "out");
    run(GEN, REPO, ["--case", "A", "--out", out]);
    const pkg = JSON.parse(readFileSync(join(out, "dispute-package.json"), "utf8"));
    assert.equal(pkg.synthetic, true);
    assert.match(pkg.boundary, /synthetic/);
    assert.match(pkg.boundary, /no .*merits outcome|not.*establish/i);
    assert.equal(pkg.protocolVersion, "ADAL/1");
    assert.equal(pkg.caseRef, "A");
    // the committed reference package in the repo must also be disabled-escrow/unknown-award compliant
    const manifest = JSON.parse(readFileSync(join(out, "dispute-hashes.json"), "utf8"));
    assert.equal(manifest.manifest.protocolVersion, "ADAL/1");
    assert.ok(manifest.manifest.selfExcluded.includes("dispute-hashes.json"));
  });
});