import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const AUDIT = join(REPO, "scripts", "boundary-audit.mjs");

// Assembled at runtime so the source never contains a contiguous PEM block —
// the audit scans this very file and must stay clean (fail-closed self-honesty).
const PEM = [
  "-----BEGIN EC " + "PRIVATE KEY-----",
  "MHQCAQEEICEXAMPLEPRIVATEKEYEXAMPLE",
  "-----END EC " + "PRIVATE KEY-----",
].join("\n");

function runAudit(root, extra = [], out) {
  const args = [AUDIT, "--root", root];
  if (out) args.push("--out", out);
  return spawnSync(process.execPath, [...args, ...extra], { cwd: REPO, encoding: "utf8" });
}

function withTmp(fn) {
  const d = mkdtempSync(join(tmpdir(), "boundary-audit-"));
  try {
    return fn(d);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}

test("boundary: the committed tree passes the audit (fail-closed only on violations)", () => {
  const r = runAudit(REPO);
  assert.equal(r.status, 0, `audit must pass on the clean tree: ${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /BOUNDARY-AUDIT: PASS/);
});

test("boundary: a planted private key is refused, content is redacted", () => {
  withTmp((d) => {
    writeFileSync(join(d, "leak.txt"), `note ${PEM} end`);
    const r = runAudit(d);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /B1\/PRIVATE_KEY_PEM/);
    assert.doesNotMatch(r.stdout, /EXAMPLEPRIVATEKEY/);
  });
});

test("boundary: a deployed:true emission is refused (execution request)", () => {
  withTmp((d) => {
    writeFileSync(join(d, "report.json"), JSON.stringify({ escrow: { deployed: true } }));
    const r = runAudit(d);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /B3\/exec-req/);
    assert.match(r.stdout, /escrow\.deployed/);
  });
});

test("boundary: networkCall PERFORMED is refused (status honesty)", () => {
  withTmp((d) => {
    writeFileSync(join(d, "adapter-report.json"), JSON.stringify({ networkCall: "PERFORMED" }));
    const r = runAudit(d);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /B2\/netcall/);
  });
});

test("boundary: a filled awardSlot is refused (CoreGuard never authorizes an award)", () => {
  withTmp((d) => {
    writeFileSync(join(d, "dispute-package.json"), JSON.stringify({ awardSlot: { status: "EXECUTED" } }));
    const r = runAudit(d);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /B2\/award-slot/);
  });
});

test("boundary: legacy-quarantine is excluded by design and reported", () => {
  withTmp((d) => {
    const q = join(d, "legacy-quarantine");
    mkdirSync(q);
    writeFileSync(join(q, "legacy-broadcast.txt"), PEM);
    const out = join(d, "rep.json");
    const r = runAudit(d, [], out);
    assert.equal(r.status, 0, `quarantined private-key material must be out of scan scope: ${r.stdout}${r.stderr}`);
    const report = JSON.parse(readFileSync(out, "utf8"));
    assert.ok(report.excludedDirs.includes("legacy-quarantine"));
  });
});

test("boundary: local .env is out of scan scope, but .env.example stays scanned", () => {
  withTmp((d) => {
    writeFileSync(join(d, ".env"), PEM);
    writeFileSync(join(d, ".env.example"), `PRIVATE_KEY=${PEM}`);
    const r = runAudit(d);
    const combined = r.stdout + r.stderr;
    assert.equal(r.status, 1);
    assert.ok(!combined.includes("\n  .env ::"), "the local .env must be out of scan scope");
    assert.match(combined, /\n  \.env\.example :: content :: B1\/PRIVATE_KEY_PEM/, "a real secret in an .env.example must still be caught");
  });
});

test("boundary: no local env secret file is ever tracked by git (.env.example templates are fine)", () => {
  const ls = execFileSync("git", ["ls-files"], { cwd: REPO, encoding: "utf8" }).split("\n");
  const trackedEnv = ls.filter((p) => {
    const base = p.split("/").pop();
    if (!/^\.env($|\.)/.test(base)) return false;
    return !base.endsWith(".example");
  });
  assert.deepEqual(trackedEnv, [], "git must never track a local environment secret file");
});

test("boundary: the audit report is deterministic across runs (byte-identical)", () => {
  withTmp((d) => {
    const a = join(d, "a.json");
    const b = join(d, "b.json");
    const r1 = runAudit(REPO, [], a);
    const r2 = runAudit(REPO, [], b);
    assert.equal(r1.status, 0);
    assert.equal(r2.status, 0);
    assert.equal(readFileSync(a, "utf8"), readFileSync(b, "utf8"), "report bytes must be deterministic");
  });
});