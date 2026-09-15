/**
 * Verifier C — canonicalization parity (W3-I2 mirror). A/B/C canonicalize the
 * same values and must emit byte-identical canonical text.
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";

import { canonicalize as refCanonicalize } from "../../packages/canonical/index.js";
import { ivInstance, cInstance, eoaArgs } from "./helpers.js";

after(async () => {
  await cInstance.close();
});

const refCanon = (o) => refCanonicalize(o);

const corpus = [
  { label: "null", value: null },
  { label: "true", value: true },
  { label: "false", value: false },
  { label: "zero", value: 0 },
  { label: "positive integer", value: 123 },
  { label: "negative integer", value: -42 },
  { label: "empty string", value: "" },
  { label: "string", value: "hello" },
  { label: "0x address", value: "0xABCDEF1234567890abcdef1234567890ABCDEF12" },
  { label: "empty array", value: [] },
  { label: "array", value: [1, "two", true, null] },
  { label: "empty object", value: {} },
  { label: "object keys sorted", value: { b: 2, a: 1 } },
  { label: "nested object", value: { z: { m: 1, a: 2 }, a: [3, 2] } },
  { label: "big int string", value: "9007199254740993" },
];

for (const { label, value } of corpus) {
  test(`canon parity: ${label}`, async () => {
    const ref = refCanon(value);
    const b = await ivInstance.canonRaw(value);
    const c = await cInstance.canonRaw(value);
    assert.deepStrictEqual(b.ok, true, `B canon should succeed for ${label}`);
    assert.deepStrictEqual(c.ok, true, `C canon should succeed for ${label}`);
    assert.deepStrictEqual(b.value, ref, `B canon bytes for ${label} must be identical to reference`);
    assert.deepStrictEqual(c.value, ref, `C canon bytes for ${label} must be identical to reference`);
  });
}

test("canon parity: full signed EOA envelope leaves", async () => {
  const args = await eoaArgs();
  for (const leaf of ["intent", "declaration"]) {
    const ref = refCanon(args[leaf]);
    const b = await ivInstance.canonRaw(args[leaf]);
    const c = await cInstance.canonRaw(args[leaf]);
    assert.deepStrictEqual(b.ok, true, `B canon of ${leaf}`);
    assert.deepStrictEqual(c.ok, true, `C canon of ${leaf}`);
    assert.deepStrictEqual(b.value, ref, `B canon bytes of ${leaf}`);
    assert.deepStrictEqual(c.value, ref, `C canon bytes of ${leaf}`);
  }
});

test("canon parity: binding record", async () => {
  const args = await eoaArgs();
  const binding = args.frozenRecord.binding;
  const ref = refCanon(binding);
  const b = await ivInstance.canonRaw(binding);
  const c = await cInstance.canonRaw(binding);
  assert.deepStrictEqual(b.value, ref, "B binding canon bytes");
  assert.deepStrictEqual(c.value, ref, "C binding canon bytes");
});

test("canon refusal parity: unsafe JS number (unsafe integers are refused)", async () => {
  const bad = { a: 9007199254740992 };
  const b = await ivInstance.canonRaw(bad);
  const c = await cInstance.canonRaw(bad);
  assert.deepStrictEqual(b.ok, false, "B must refuse unsafe integers");
  assert.deepStrictEqual(c.ok, false, "C must refuse unsafe integers");
  assert.deepStrictEqual(b.error, c.error, "refusal reason must be byte-identical");
});