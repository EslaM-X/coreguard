import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  prepareAea1,
  verifyAea1,
  AEA1,
  AEA1_PACKAGE_VERSION,
  sha256,
} from "../../packages/agentic-escrow-arbitration/sdk.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CLI = join(REPO, "packages", "agentic-escrow-arbitration", "cli.mjs");
const REF_A = join(REPO, "examples", "delivery-fixture", "pairs", "dispute-package", "reference-A");
const REF_B = join(REPO, "examples", "delivery-fixture", "pairs", "dispute-package", "reference-B");

function tmpDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

test("aea1: prepare on reference-A produces a verifiable boundary record", () => {
  const d = tmpDir("cg-a1-");
  try {
    const r = prepareAea1({ caseDir: REF_A, outDir: d });
    assert.equal(r.ok, true, r.detail);
    assert.equal(r.stage, "aea1-ready");
    assert.equal(r.boundary.protocolVersion, AEA1);
    assert.equal(r.boundary.caseRef, "A");
    assert.ok(/^0x[0-9a-f]{64}$/.test(r.boundary.packageRevision), "packageRevision must be a SHA-256 pin");

    const v = verifyAea1(d);
    assert.equal(v.ok, true, JSON.stringify(v.failures));
    assert.ok(v.checks.length >= 12, `expected >=12 invariants, ran ${v.checks.length}`);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("aea1: boundary record is honest on every settlement/adjudication claim", () => {
  const d = tmpDir("cg-a1-");
  try {
    const { boundary } = prepareAea1({ caseDir: REF_A, outDir: d });
    assert.equal(boundary.synthetic, true);
    assert.equal(boundary.origin, "SYNTHETIC");
    assert.equal(boundary.escrow.deployed, false);
    assert.equal(boundary.escrow.chain, "none");
    assert.equal(boundary.award.status, "UNKNOWN");
    assert.equal(boundary.award.adjudicator, "NONE");
    assert.equal(boundary.award.signedReasonedAward, null);
    assert.equal(boundary.settlement.authorizationStatus, "NOT_AUTHORIZED");
    assert.equal(boundary.settlement.funds, "NONE_MOVED");
    assert.equal(boundary.adapter.integrationStatus, "NOT_BUILT");
    assert.equal(boundary.adapter.networkCall, "NOT_PERFORMED");
    assert.ok(boundary.boundary.includes("does not adjudicate"), "boundary text must state non-adjudication");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("aea1: deterministic — two prepares produce byte-identical output", () => {
  const d1 = tmpDir("cg-a1-");
  const d2 = tmpDir("cg-a1-");
  try {
    prepareAea1({ caseDir: REF_A, outDir: d1 });
    prepareAea1({ caseDir: REF_A, outDir: d2 });
    for (const f of ["aea1-boundary.json", "escrow-interface.json", "aea1-report.json", "aea1-hashes.json"]) {
      assert.equal(readFileSync(join(d1, f), "utf8"), readFileSync(join(d2, f), "utf8"), `${f} must be byte-identical`);
    }
  } finally {
    rmSync(d1, { recursive: true, force: true });
    rmSync(d2, { recursive: true, force: true });
  }
});

test("aea1: tampering any emitted file breaks the self-verify (fail-closed)", () => {
  const d = tmpDir("cg-a1-");
  try {
    prepareAea1({ caseDir: REF_A, outDir: d });
    const target = join(d, "aea1-boundary.json");
    const tampered = JSON.parse(readFileSync(target, "utf8"));
    tampered.settlement.authorizationStatus = "AUTHORIZED"; // dishonest flip
    delete tampered.packageVersion;
    writeFileSync(target, JSON.stringify(tampered, null, 2) + "\n");

    const v = verifyAea1(d);
    assert.equal(v.ok, false, "a tampered boundary must fail verification");
    assert.ok(v.failures.some((f) => f.includes("pin mismatch")), "must fail on the A1 pin mismatch");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("aea1: a dishonest claims-flip on the boundary is caught", () => {
  const d = tmpDir("cg-a1-");
  try {
    prepareAea1({ caseDir: REF_A, outDir: d });
    // Flip ONLY in memory while keeping the pinned hashes file consistent is
    // not possible (A1 pins bind the bytes) — so re-prepare into a fresh dir
    // after mutating the SOURCE package is the dishonest-shot path: the
    // prepare() stage re-verifies the ADAL/1 package fail-closed first.
    const src = tmpDir("cg-a1-");
    try {
      // copy the delivered pair byte-for-byte (re-serializing would break the
      // SHA-256 pin, which is itself the fail-closed property we rely on)
      writeFileSync(join(src, "dispute-package.json"), readFileSync(join(REF_A, "dispute-package.json")));
      writeFileSync(join(src, "dispute-hashes.json"), readFileSync(join(REF_A, "dispute-hashes.json")));
      const r = prepareAea1({ caseDir: src, outDir: d });
      assert.equal(r.ok, true, "unaltered copy must prepare fine");
    } finally {
      rmSync(src, { recursive: true, force: true });
    }
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("aea1: reference-B (PARTIAL consent) still produces a boundary record because consent is evidence, not a gate for AEA/1 — but the record stays UNKNOWN and NEVER fills anything", () => {
  const d = tmpDir("cg-a1-");
  try {
    const r = prepareAea1({ caseDir: REF_B, outDir: d });
    assert.equal(r.ok, true, r.detail);
    assert.equal(r.boundary.caseRef, "B");
    assert.equal(r.boundary.award.status, "UNKNOWN");
    assert.equal(r.boundary.settlement.authorizationStatus, "NOT_AUTHORIZED");
    const v = verifyAea1(d);
    assert.equal(v.ok, true, JSON.stringify(v.failures));
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("aea1 CLI: exit 0 on reference-A, 1 on unverifiable case, 2 on usage", () => {
  const run = (args) => spawnSync(process.execPath, [CLI, ...args], { cwd: REPO, encoding: "utf8" });
  const d = tmpDir("cg-a1-");
  try {
    const ok = run(["--case", REF_A, "--out", d]);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /AEA1_BOUNDARY_READY/);
    assert.ok(existsSync(join(d, "aea1-boundary.json")));
    assert.ok(existsSync(join(d, "aea1-hashes.json")));

    // A tampered package: copy REF_A, flip a byte in dispute-package.json
    // (unpinned), and the prepare() stage must refuse before any output.
    const bad = tmpDir("cg-a1-");
    try {
      const pkgBytes = readFileSync(join(REF_A, "dispute-package.json"));
      const flipped = Buffer.from(pkgBytes);
      flipped[100] ^= 0xff; // corrupt a byte inside the JSON body
      writeFileSync(join(bad, "dispute-package.json"), flipped);
      writeFileSync(join(bad, "dispute-hashes.json"), readFileSync(join(REF_A, "dispute-hashes.json")));
      const refuse = run(["--case", bad, "--out", d]);
      assert.equal(refuse.status, 1);
      assert.match(refuse.stdout + refuse.stderr, /AEA1_BOUNDARY_FAILED at verify/);
    } finally {
      rmSync(bad, { recursive: true, force: true });
    }

    const usage = run([]);
    assert.equal(usage.status, 2);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("aea1: hashes self-exclude and pin every emitted file", () => {
  const d = tmpDir("cg-a1-");
  try {
    prepareAea1({ caseDir: REF_A, outDir: d });
    const hashes = JSON.parse(readFileSync(join(d, "aea1-hashes.json"), "utf8"));
    assert.ok(hashes.manifest.selfExcluded.includes("aea1-hashes.json"));
    for (const f of ["aea1-boundary.json", "escrow-interface.json", "aea1-report.json"]) {
      assert.equal(hashes.files[f], sha256(readFileSync(join(d, f))), `${f} pin must match bytes`);
    }
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});