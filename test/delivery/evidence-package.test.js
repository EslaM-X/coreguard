import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CLI = join(REPO, "scripts", "make-evidence-package.mjs");
const PAIR = join(REPO, "examples", "delivery-fixture", "pairs", "assent-pair");
const VERIFY = join(PAIR, "verify-assent-pair.mjs");
const FILES = ["assent-a.json", "assent-b.json", "expected-field-map.json", "pair-hashes.json"];

function runCli(dir) {
  return spawnSync(process.execPath, [CLI, "--out", dir], { cwd: REPO, encoding: "utf8" });
}

function runVerify(dir) {
  return spawnSync(process.execPath, [VERIFY], { cwd: dir, encoding: "utf8" });
}

test("evidence-package CLI: two runs are byte-identical and match the committed pair", () => {
  const d1 = mkdtempSync(join(tmpdir(), "cg-evp1-"));
  const d2 = mkdtempSync(join(tmpdir(), "cg-evp2-"));
  try {
    assert.equal(runCli(d1).status, 0);
    assert.equal(runCli(d2).status, 0);
    for (const f of FILES) {
      const committed = readFileSync(join(PAIR, f), "utf8");
      assert.equal(readFileSync(join(d1, f), "utf8"), committed, `${f} differs from committed`);
      assert.equal(readFileSync(join(d2, f), "utf8"), committed, `${f} differs between runs`);
    }
  } finally {
    rmSync(d1, { recursive: true, force: true });
    rmSync(d2, { recursive: true, force: true });
  }
});

test("evidence-package CLI: success contract on stdout (EVP_OK · ASSENT_PAIR OK · 11/11)", () => {
  const d = mkdtempSync(join(tmpdir(), "cg-evp-ok-"));
  try {
    const r = runCli(d);
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /decision\s*:\s*EVP_OK/);
    assert.match(r.stdout, /11\/11 → ASSENT_PAIR OK/);
    assert.match(r.stdout, /package\s*:\s*assent-pair-v1\.0\.0/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("evidence-package CLI: usage error when --out is missing", () => {
  const r = spawnSync(process.execPath, [CLI], { cwd: REPO, encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage:.*--out/);
});

test("evidence-package CLI: refuses a target directory that is not an evidence-package tree", () => {
  const d = mkdtempSync(join(tmpdir(), "cg-evp-refuse-"));
  try {
    writeFileSync(join(d, "unrelated.txt"), "not ours\n", "utf8");
    const r = runCli(d);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /refusing:/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("verifier is fail-closed: a tampered emitted file is rejected (pin integrity)", () => {
  const d = mkdtempSync(join(tmpdir(), "cg-evp-tamper-"));
  try {
    assert.equal(runCli(d).status, 0);
    const p = join(d, "assent-b.json");
    const obj = JSON.parse(readFileSync(p, "utf8"));
    obj.consent.parties.principalB.assent = "ASSENTED";
    writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
    const r = runVerify(d);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout, /\[V1\]/);
    assert.match(r.stdout, /REJECTED/);
    assert.doesNotMatch(r.stdout, /ASSENT_PAIR OK/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("verifier is fail-closed: an empty dir is an exit-2 usage error, never a pass", () => {
  const d = mkdtempSync(join(tmpdir(), "cg-evp-empty-"));
  try {
    const r = runVerify(d);
    assert.equal(r.status, 2);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});