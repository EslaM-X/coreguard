/**
 * Phase A — Manifest canonical model & schema validation (CGEP/1 §3/§5).
 *
 * manifestId = H("CGEP/1:AGENT-PROVENANCE" || canonicalize(manifestCore))
 * with NO circularity: manifestId is never inside what it hashes.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { computeManifestId, manifestCore, MANIFEST_KINDS } from "../../packages/provenance/canonical.js";
import { validateManifest } from "../../packages/provenance/manifest.js";

const SIGNER = "0x" + "11".repeat(20);

const baseStamp = {
  version: "CGEP/1",
  manifestKind: "STAMP",
  nonce: "7",
  executionRef: {
    chainId: "1116",
    txHash: "0x" + "ab".repeat(32),
    blockNumber: "12345",
  },
  declared: {
    signerBinding: { address: SIGNER },
    executorType: "AI_AGENT",
  },
};

function validManifest() {
  return {
    ...baseStamp,
    declared: { ...baseStamp.declared },
    signature: {
      scheme: "EIP-712",
      signer: SIGNER,
      r: "11".repeat(32),
      s: "22".repeat(32),
      v: 27,
    },
  };
}

test("canonical: manifestCore drops only envelope fields", () => {
  const m = validManifest();
  const core = manifestCore(m);
  assert.equal(core.version, "CGEP/1");
  assert.equal(core.manifestKind, "STAMP");
  assert.deepEqual(core.declared, m.declared);
  assert.ok(!("manifestId" in core));
  assert.ok(!("signature" in core));
  assert.ok(!("commit" in core));
});

test("canonical: computeManifestId is deterministic and well-founded", async () => {
  const m1 = validManifest();
  const m2 = validManifest();
  const id1 = await computeManifestId(m1);
  const id2 = await computeManifestId(m2);
  assert.equal(id1, id2);
  assert.ok(!m1.manifestId, "computeManifestId must not mutate input");
});

test("canonical: changing declared content changes the manifestId", async () => {
  const m = validManifest();
  const before = await computeManifestId(m);
  m.declared.executorType = "BOT";
  const after = await computeManifestId(m);
  assert.notEqual(before, after);
});

test("canonical: adding a signature does NOT change the manifestId", async () => {
  const m = validManifest();
  delete m.signature;
  const noSig = await computeManifestId(m);
  const withSig = await computeManifestId(validManifest());
  assert.equal(noSig, withSig);
});

test("canonical: manifestId is 32-byte hex", async () => {
  const id = await computeManifestId(validManifest());
  assert.match(id, /^0x[0-9a-f]{64}$/);
});

test("schema: valid STAMP passes", () => {
  const r = validateManifest(validManifest());
  assert.equal(r.valid, true);
  assert.equal(r.kind, "STAMP");
  assert.equal(r.executorType, "AI_AGENT");
});

test("schema: STAMP missing executionRef is INVALID", () => {
  const m = validManifest();
  m.executionRef = undefined;
  const r = validateManifest(m);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /executionRef/.test(e)));
});

test("schema: STAMP with multiple executionRefs is INVALID (EXACTLY ONE)", () => {
  const m = validManifest();
  m.executionRef = [m.executionRef, m.executionRef];
  const r = validateManifest(m);
  assert.equal(r.valid, false);
});

test("schema: REGISTRATION requires executionRef = null", () => {
  const m = { ...validManifest(), manifestKind: "REGISTRATION", executionRef: null };
  const ok = validateManifest(m);
  assert.equal(ok.valid, true);
  assert.equal(ok.kind, "REGISTRATION");

  const bad = { ...m, executionRef: { chainId: "1116", txHash: "0x" + "ab".repeat(32), blockNumber: "1" } };
  assert.equal(validateManifest(bad).valid, false);
});

test("schema: unknown manifestKind is INVALID (fail-closed)", () => {
  const m = { ...validManifest(), manifestKind: "FANCY" };
  assert.equal(validateManifest(m).valid, false);
});

test("schema: wrong version is INVALID", () => {
  const m = { ...validManifest(), version: "CGEP/0" };
  assert.equal(validateManifest(m).valid, false);
});

test("schema: malformed signature envelope is INVALID", () => {
  for (const mutation of [
    { scheme: "RAW" },
    { v: 99 },
    { r: "0".repeat(64), s: "11".repeat(32), v: 27 }, // r must be > 0
    { r: "11".repeat(31), s: "11".repeat(32), v: 27 }, // wrong length
    { signer: "not-an-address" },
  ]) {
    const m = validManifest();
    m.signature = { ...m.signature, ...mutation };
    assert.equal(validateManifest(m).valid, false, `expected INVALID for ${JSON.stringify(mutation)}`);
  }
});

test("schema: executorType normalizes (unknown → UNKNOWN, not error)", () => {
  const m = validManifest();
  m.declared.executorType = "my-custom-agent-v2";
  const r = validateManifest(m);
  assert.equal(r.valid, true);
  assert.equal(r.executorType, "UNKNOWN");
});

test("schema: manifestKind set is closed", () => {
  assert.deepEqual([...MANIFEST_KINDS].sort(), ["REGISTRATION", "STAMP"]);
});