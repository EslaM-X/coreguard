/**
 * Gate 4.1 on-chain verifier regression (independent, self-contained).
 *
 * Guards the properties the reviewer relies on for STATE-1 evidence:
 *   1. scripts/verify-gate-4.1-onchain.mjs loads with ZERO package imports
 *      (runs from a bare `git clone` with only node installed).
 *   2. Inline Keccak-256 reproduces the canonical selector + topic0 and the two
 *      known reference vectors (guards the crypto, incl. the RHO-table fix).
 *   3. The full run is PASS with exactly schema.checkCount (66) instances, all
 *      37 unique assertions present, categories match the schema.
 *   4. --json output is byte-deterministic across repetitions.
 *   5. The committed result file is byte-identical to a fresh --json
 *      regeneration (evidence reproducibility from the committed tree).
 *   6. evidence/raw/ dumps are still pinned by their manifest SHA-256s.
 *
 * The test never touches the network, keys, or writes anything into evidence/.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const VERIFIER = join(ROOT, "scripts", "verify-gate-4.1-onchain.mjs");
const RESULT = join(ROOT, "evidence", "gate-4.1-independent-verify.json");
const MANIFEST = join(ROOT, "evidence", "raw", "manifest.json");

const sha256Hex = (b) => createHash("sha256").update(b).digest("hex");
const run = (args) =>
  spawnSync(process.execPath, [VERIFIER, ...args], { encoding: "utf8", cwd: ROOT });

test("G41-VER: verifier imports are self-contained (no external packages)", () => {
  const src = readFileSync(VERIFIER, "utf8");
  const imports = [...src.matchAll(/^import\s+.*from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  const packages = imports.filter((s) => !s.startsWith("node:"));
  assert.deepStrictEqual(packages, [], `verifier must not import packages (got ${packages.join(", ")})`);
  assert.ok(imports.every((s) => s.startsWith("node:")), "all imports must be node: built-ins");
});

test("G41-VER: inline Keccak reproduces selector, topic0, and reference vectors", () => {
  const first = run(["--json"]);
  assert.strictEqual(first.status, 0, `verifier exited ${first.status}:\n${first.stderr}`);
  const j = JSON.parse(first.stdout);
  const byId = Object.fromEntries(j.checks.map((c) => [c.id, c.ok]));
  for (const id of ["SPEC-01", "SPEC-02", "SPEC-03", "SPEC-04"]) {
    assert.strictEqual(byId[id], true, `assertion ${id} must PASS`);
  }
});

test("G41-VER: full matrix = schema.count 66 instances / 37 unique, PASS", () => {
  const first = run(["--json"]);
  assert.strictEqual(first.status, 0, `verifier exited ${first.status}:\n${first.stderr}`);
  const j = JSON.parse(first.stdout);
  assert.strictEqual(j.verdict, "PASS");
  assert.strictEqual(j.checkCount, j.schema.checkCount, "checkCount === schema.checkCount");
  assert.strictEqual(j.passedChecks, j.checkCount, "all checks must pass");
  const unique = new Set(j.checks.map((c) => c.id));
  assert.strictEqual(unique.size, j.schema.uniqueCount, "unique assertion ids === schema.uniqueCount");
  assert.deepStrictEqual(j.schema.byCategory, {
    spec: j.checks.filter((c) => c.category === "spec").length,
    tx: j.checks.filter((c) => c.category === "tx").length,
    receipt: j.checks.filter((c) => c.category === "receipt").length,
    readback: j.checks.filter((c) => c.category === "readback").length,
    cross: j.checks.filter((c) => c.category === "cross").length,
  }, "category totals match schema");
  for (const c of j.checks) {
    assert.ok(c.id && c.source, `every check needs an id and provenance source (missing in ${c.name})`);
  }
});

test("G41-VER: output is byte-deterministic and matches the committed result", () => {
  const a = run(["--json"]);
  const b = run(["--json"]);
  assert.strictEqual(a.status, 0);
  assert.strictEqual(a.stdout, b.stdout, "--json must be byte-identical across reruns");
  const committed = readFileSync(RESULT, "utf8");
  assert.strictEqual(a.stdout.trim(), committed.trim(),
    "committed evidence/gate-4.1-independent-verify.json must equal a fresh regeneration");
});

test("G41-VER: evidence/raw/ dumps still match their manifest SHA-256 pins", () => {
  if (!existsSync(MANIFEST)) {
    assert.fail(`missing manifest: ${MANIFEST}`);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const entries = manifest.files || Object.entries(manifest);
  assert.ok(Array.isArray(entries) && entries.length >= 6, `manifest.files must list >=6 dumps`);
  for (const e of entries) {
    const file = typeof e === "string" ? e : e.file;
    if (file === "manifest.json") continue; /* self-entry cannot pin its own on-disk bytes */
    const expect = typeof e === "string" ? manifest.sha256 && manifest.sha256[file] : e.sha256;
    assert.ok(file && expect, `manifest entry malformed: ${JSON.stringify(e)}`);
    const disk = readFileSync(join(ROOT, "evidence", "raw", file));
    assert.strictEqual(sha256Hex(disk), expect.replace(/^0x/, "").toLowerCase(),
      `raw dump ${file} drifted from its manifest pin (CRLF rewrite? content edit?)`);
  }
});

test("G41-VER: inventory mode is static (works without reading raw data)", () => {
  const inv = run(["--inventory"]);
  assert.strictEqual(inv.status, 0);
  const j = JSON.parse(inv.stdout);
  assert.strictEqual(j.totalInstances, 66);
  assert.strictEqual(Object.keys(j.assertions).length, 37);
});