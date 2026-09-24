import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  prepareDryRun,
  deriveLabels,
  validateMappings,
  buildMappings,
  ADAPTER_PROTOCOL,
  OUT_FILES,
} from "../../packages/peoples-court-adapter/adapter.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CLI = join(REPO, "packages", "peoples-court-adapter", "cli.mjs");
const REF_A = join(REPO, "examples", "delivery-fixture", "pairs", "dispute-package", "reference-A");
const REF_B = join(REPO, "examples", "delivery-fixture", "pairs", "dispute-package", "reference-B");

function run(script, cwd, extraArgs = []) {
  return spawnSync(process.execPath, [script, ...extraArgs], { cwd, encoding: "utf8" });
}

function tmpOut(prefix) {
  const d = mkdtempSync(join(tmpdir(), prefix));
  const out = join(d, "out");
  mkdirSync(out, { recursive: true });
  return { d, out };
}

function withTmp(fn) {
  const { d, out } = tmpOut("cga-");
  try {
    return fn({ d, out });
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}

test("adapter: CLI on reference-A exits 0 with PEOPLES_COURT_ADAPTER_READY + expected files", () => {
  withTmp(({ out }) => {
    const r = run(CLI, REPO, ["--case", REF_A, "--out", out]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /PEOPLES_COURT_ADAPTER_READY/);
    for (const f of OUT_FILES) assert.ok(existsSync(join(out, f)), `${f} missing`);
  });
});

test("adapter: all eight labels are derived honestly on reference-A", () => {
  withTmp(({ out }) => {
    const r = prepareDryRun({ caseDir: REF_A, outDir: out });
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400));
    assert.deepEqual(r.labels, {
      authority: "DERIVED",
      consent: "VERIFIED_LABELS",
      execution: "CORE_MAINNET_RECEIPT",
      evidence: "SHA256_PINNED",
      record: "ADAL/1",
      award: "EXTERNAL",
      settlement: "AUTHORITY_BOUND",
      "network-call": "NOT_PERFORMED",
    });
    // every check that contributed to the labels must be a real pass
    assert.ok(r.checks.length >= 7, "at least one evidence path per label");
    assert.ok(r.checks.every((c) => c.ok === true), "no silent failure");
  });
});

test("adapter: reference-B (PARTIAL modeled assent) also maps — labels are verified, not adjudicated", () => {
  withTmp(({ out }) => {
    const r = prepareDryRun({ caseDir: REF_B, outDir: out });
    assert.equal(r.ok, true);
    assert.equal(r.labels.consent, "VERIFIED_LABELS");
    // the tri-state PARTIAL must survive — never converted to FULL or a boolean
    const req = JSON.parse(readFileSync(join(out, "expected-request.json"), "utf8"));
    assert.equal(req.mappings.consentArtifact.modeledAssent, "PARTIAL");
    assert.equal(typeof req.mappings.consentArtifact.modeledAssent, "string");
    assert.equal(req.mappings.consentArtifact.perPartyAssent.principalB, "UNKNOWN");
  });
});

test("adapter: exact byte determinism — two runs into different out dirs are identical", () => {
  const { d: d1, out: o1 } = tmpOut("cgd1-");
  const { d: d2, out: o2 } = tmpOut("cgd2-");
  try {
    assert.equal(prepareDryRun({ caseDir: REF_A, outDir: o1 }).ok, true);
    assert.equal(prepareDryRun({ caseDir: REF_A, outDir: o2 }).ok, true);
    for (const f of OUT_FILES) {
      assert.deepEqual(
        readFileSync(join(o1, f)),
        readFileSync(join(o2, f)),
        `${f} must be byte-identical (no Date.now / abs path leakage)`,
      );
    }
  } finally {
    rmSync(d1, { recursive: true, force: true });
    rmSync(d2, { recursive: true, force: true });
  }
});

test("adapter: generated fixtures conform to the packaged output schemas", () => {
  withTmp(({ out }) => {
    const r = prepareDryRun({ caseDir: REF_A, outDir: out });
    assert.equal(r.ok, true);
    const req = JSON.parse(readFileSync(join(out, "expected-request.json"), "utf8"));
    // runtime schema validation already ran inside prepareDryRun; here we assert
    // the report's validation summary and spot-check mapped fields
    assert.ok(r.validation.ok, JSON.stringify(r.validation.results, null, 2));
    assert.equal(req.mappings.authority.confirmationRequired, true);
    assert.notEqual(req.mappings.evidenceExport.packageRevision, null);
  });
});

test("adapter: no-claim discipline — network-call NOT_PERFORMED, credentials NOT_PROVIDED, disclaimers present", () => {
  withTmp(({ out }) => {
    const r = prepareDryRun({ caseDir: REF_A, outDir: out });
    assert.equal(r.ok, true);
    const req = JSON.parse(readFileSync(join(out, "expected-request.json"), "utf8"));
    const resp = JSON.parse(readFileSync(join(out, "expected-response.json"), "utf8"));
    const report = JSON.parse(readFileSync(join(out, "adapter-report.json"), "utf8"));
    assert.equal(req.networkCall, "NOT_PERFORMED");
    assert.equal(resp.networkCall, "NOT_PERFORMED");
    assert.equal(report.networkCall, "NOT_PERFORMED");
    assert.equal(req.dryRun, true);
    assert.equal(resp.submitted, false);
    for (const cred of req.credentialsRequired) assert.equal(cred.status, "NOT_PROVIDED");
    assert.match(req.disclaimer, /not a live submission/);
    assert.match(resp.note, /publicly documented/);
    // the fixture must never claim an integration
    assert.equal(String(req.targetSurface).includes("referenced, not invoked"), true);
  });
});

test("adapter: fail-closed — tampered award slot means nothing is emitted", () => {
  withTmp(({ d, out }) => {
    const caseDir = join(d, "case");
    mkdirSync(caseDir, { recursive: true });
    for (const f of ["dispute-package.json", "dispute-hashes.json"]) {
      writeFileSync(join(caseDir, f), readFileSync(join(REF_A, f)));
    }
    const pkgPath = join(caseDir, "dispute-package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    pkg.awardSlot = { status: "ISSUED", signedReasonedAward: "x", adjudicator: "X" };
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

    const r = prepareDryRun({ caseDir, outDir: out });
    assert.equal(r.ok, false);
    assert.equal(r.stage, "verify");
    assert.equal(readdirSync(out).length, 0, "no output may be emitted for a failed package");
  });
});

test("adapter: fail-closed — pin tamper is rejected by the external verifier", () => {
  withTmp(({ d, out }) => {
    const caseDir = join(d, "case");
    mkdirSync(caseDir, { recursive: true });
    for (const f of ["dispute-package.json", "dispute-hashes.json"]) {
      const raw = readFileSync(join(REF_A, f), "utf8");
      writeFileSync(join(caseDir, f), f === "dispute-package.json" ? raw.replace("FULL", "PARTIAL") : raw);
    }
    const r = prepareDryRun({ caseDir, outDir: out });
    assert.equal(r.ok, false);
    assert.equal(readdirSync(out).length, 0);
  });
});

test("adapter: CLI usage errors exit 2 (missing --case, not a package dir, out == case dir)", () => {
  const bad = run(CLI, REPO, []);
  assert.equal(bad.status, 2);
  withTmp(({ d, out }) => {
    const r = run(CLI, REPO, ["--case", out, "--out", join(d, "x")]);
    assert.equal(r.status, 2, "an empty dir is not a package dir");
    const same = run(CLI, REPO, ["--case", REF_A, "--out", REF_A]);
    assert.equal(same.status, 2, "out must not equal the case dir");
  });
});

test("adapter: library surface exposes labels + mappings + schema validator", () => {
  const pkg = JSON.parse(readFileSync(join(REF_A, "dispute-package.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(REF_A, "dispute-hashes.json"), "utf8"));
  const { labels, complete } = deriveLabels(pkg);
  assert.equal(complete, true);
  const mappings = buildMappings(pkg, manifest);
  const v = validateMappings(mappings);
  assert.equal(v.ok, true);
  assert.equal(ADAPTER_PROTOCOL, "PEOPLES-COURT-ADAPTER/1");
  assert.equal(pkg.adapter.integrationStatus, "NOT_BUILT", "NOT_BUILT must persist end-to-end");
});