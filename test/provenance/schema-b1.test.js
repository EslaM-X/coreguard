/**
 * Phase B-1 — manifest schema additions: signerBinding.kind + signature.scheme
 * consistency (spec Q-B1.4).
 *
 * Rules: kind "EIP1271" ⇔ scheme "EIP-1271"; any mismatch is INVALID and the
 * verifier fails closed. EOA path stays untouched ("EIP-712" + r/s/v).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { validateManifest } from "../../packages/provenance/manifest.js";
import { makeManifest, makeTxHash } from "./helpers.js";

const CONTRACT = "0x2222222222222222222222222222222222222222";

function base({ kind = "STAMP", execKind = "EOA", scheme = "EIP-712" }) {
  const m = makeManifest({
    kind,
    signerAddress: CONTRACT,
    executionRef: kind === "STAMP" ? { chainId: "1116", txHash: makeTxHash(0xb1), blockNumber: "12345" } : undefined,
    extra: {
      signerBinding: { address: CONTRACT, ...(execKind === "EOA" ? {} : { kind: execKind }) },
    },
  });
  if (scheme === "EIP-1271") {
    m.signature = { scheme: "EIP-1271", signer: CONTRACT, bytes: "0xdeadbeef" };
  } else {
    m.signature = {
      scheme: "EIP-712",
      signer: CONTRACT,
      r: "ab".repeat(32),
      s: "cd".repeat(32),
      v: 27,
    };
  }
  return m;
}

test("schema-b1: EOA path retains EIP-712 envelope (kind absent defaults EOA)", () => {
  const m = base({ execKind: "EOA", scheme: "EIP-712" });
  assert.equal(validateManifest(m).valid, true);
});

test("schema-b1: EIP1271 kind + EIP-1271 scheme is valid (self-describing)", () => {
  const m = base({ execKind: "EIP1271", scheme: "EIP-1271" });
  assert.equal(validateManifest(m).valid, true);
});

test("schema-b1: kind EIP1271 with EIP-712 scheme is a consistency mismatch → INVALID", () => {
  const m = base({ execKind: "EIP1271", scheme: "EIP-712" });
  const out = validateManifest(m);
  assert.equal(out.valid, false);
  assert.ok(out.errors.some((e) => /inconsistent/.test(e)));
});

test("schema-b1: scheme EIP-1271 with EOA kind is a consistency mismatch → INVALID", () => {
  const m = base({ execKind: "EOA", scheme: "EIP-1271" });
  const out = validateManifest(m);
  assert.equal(out.valid, false);
  assert.ok(out.errors.some((e) => /inconsistent/.test(e)));
});

test("schema-b1: EIP-1271 envelope requires even-length 0x bytes", () => {
  const m = base({ execKind: "EIP1271", scheme: "EIP-1271" });
  m.signature.bytes = "0x123";
  assert.equal(validateManifest(m).valid, false);

  const m2 = base({ execKind: "EIP1271", scheme: "EIP-1271" });
  m2.signature.bytes = "0x"; // empty contract signature is legitimate (e.g. owner-only mock)
  assert.equal(validateManifest(m2).valid, true);
});

test("schema-b1: unknown signerBinding.kind is INVALID (fail-closed)", () => {
  const m = base({ execKind: "BADVAL", scheme: "EIP-712" });
  const out = validateManifest(m);
  assert.equal(out.valid, false);
  assert.ok(out.errors.some((e) => /signerBinding.kind/.test(e)));
});