import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const PAIR = join(REPO, "examples", "delivery-fixture", "pairs", "assent-pair");
const GEN = join(PAIR, "make-assent-pair.mjs");
const VERIFY = join(PAIR, "verify-assent-pair.mjs");

function genInto(dir) {
  const r = spawnSync(process.execPath, [GEN, "--out", dir], { cwd: REPO, encoding: "utf8" });
  assert.equal(r.status, 0, `generator failed: ${r.stderr}`);
  return r.stdout;
}

function verifyIn(dir) {
  return spawnSync(process.execPath, [VERIFY], { cwd: dir, encoding: "utf8" });
}

function patchManifest(dir, file, mutate) {
  const p = join(dir, file);
  const obj = JSON.parse(readFileSync(p, "utf8"));
  mutate(obj);
  const json = JSON.stringify(obj, null, 2) + "\n";
  writeFileSync(p, json, "utf8");
  const pin = "0x" + createHash("sha256").update(Buffer.from(json, "utf8")).digest("hex");
  const m = join(dir, "pair-hashes.json");
  const manifest = JSON.parse(readFileSync(m, "utf8"));
  manifest.files[file] = pin;
  writeFileSync(m, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

test("generator determinism: two runs produce byte-identical pair", () => {
  const d1 = mkdtempSync(join(tmpdir(), "cg-ap1-"));
  const d2 = mkdtempSync(join(tmpdir(), "cg-ap2-"));
  try {
    genInto(d1);
    genInto(d2);
    for (const f of ["assent-a.json", "assent-b.json", "expected-field-map.json", "pair-hashes.json"]) {
      assert.equal(readFileSync(join(d1, f), "utf8"), readFileSync(join(d2, f), "utf8"), `${f} differs between runs`);
    }
  } finally {
    rmSync(d1, { recursive: true, force: true });
    rmSync(d2, { recursive: true, force: true });
  }
});

test("verifier exits 0 on the clean committed pair", () => {
  const r = verifyIn(PAIR);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /ASSENT_PAIR OK/);
  assert.match(r.stdout, /10\/10/);
});

test("execution + delivery identical; consent differs exactly as modeled", () => {
  const A = JSON.parse(readFileSync(join(PAIR, "assent-a.json"), "utf8"));
  const B = JSON.parse(readFileSync(join(PAIR, "assent-b.json"), "utf8"));
  assert.equal(JSON.stringify(A.execution), JSON.stringify(B.execution));
  assert.equal(JSON.stringify(A.delivery), JSON.stringify(B.delivery));
  assert.equal(A.consent.parties.principalA.assent, "ASSENTED");
  assert.equal(B.consent.parties.principalA.assent, "ASSENTED");
  assert.equal(A.consent.parties.principalB.assent, "ASSENTED");
  assert.equal(B.consent.parties.principalB.assent, "UNKNOWN");
  assert.ok(B.consent.unknownFields.includes("principalBAssentForThisObligation"));
  assert.equal(A.execution.compensationSettlement.status, "NOT_SETTLED");
  assert.equal(B.execution.compensationSettlement.status, "NOT_SETTLED");
});