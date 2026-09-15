/**
 * Verifier C — reproducibility metadata pin (Dec-C-9).
 *
 * The interpreter version + verifier source checksums provide REPRODUCIBILITY
 * METADATA for the override-considered implementation; they do not constitute
 * a cryptographic attestation of the interpreter/runtime itself.
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cInstance } from "./helpers.js";
import { PACKAGE_ROOT } from "./helpers.js";

after(async () => {
  await cInstance.close();
});

test("bridge pins python ^3.14 (reproducibility metadata)", () => {
  assert.match(cInstance.metadata.python, /^3\.14\./, "python version pin ^3.14");
});

test("METADATA.json checksums match live bridge sources", async () => {
  const metadata = JSON.parse(readFileSync(join(PACKAGE_ROOT, "METADATA.json"), "utf8"));
  const expected = metadata.sources || {};
  assert.ok(Object.keys(expected).length >= 7, "all C source modules pinned");
  for (const file of Object.keys(expected)) {
    assert.deepStrictEqual(
      cInstance.metadata.sources[file],
      expected[file],
      `live checksum for ${file} must match METADATA.json`
    );
  }
});

test("bridge artifact kind + source set", () => {
  assert.deepStrictEqual(cInstance.artifact.kind, "python-bridge");
  const names = Object.keys(cInstance.metadata.sources).sort();
  assert.deepStrictEqual(names, [
    "__init__.py",
    "_canon.py",
    "_json.py",
    "_keccak.py",
    "_pipeline.py",
    "_secp.py",
    "bridge.py",
  ]);
});