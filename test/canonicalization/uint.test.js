/**
 * CoreGuard Canonical Unsigned Integer Safety Tests (P1)
 *
 * Proven: identical logical integers serialize to a SINGLE canonical decimal
 * string; hex and decimal can never collide; unsafe JS Numbers can never leak
 * into a commitment; uint256 bounds are enforced (fail-closed).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canonicalUintString,
  isCanonicalUintString,
  uintToBigInt,
  UINT256_MAX,
  UINT256_MAX_BI,
  canonicalize,
  domainHash,
  hashStateDelta,
} from "../../packages/canonical/index.js";

const UINT256_MAX_PLUS_1 = UINT256_MAX_BI + 1n;

test("uint: hex and decimal collapse to ONE canonical decimal string", () => {
  const hex = "0xde0b6b3a7640000"; // 1e18
  const dec = "1000000000000000000";
  assert.equal(canonicalUintString(hex), dec);
  assert.equal(canonicalUintString(dec), dec);
  assert.equal(canonicalUintString(hex), canonicalUintString(dec));
});

test("uint: leading zeros and case do not survive canonicalization", () => {
  assert.equal(canonicalUintString("0x0001"), "1");
  assert.equal(canonicalUintString("0X0001"), "1");
  assert.equal(canonicalUintString("0100"), "100");
  assert.equal(canonicalUintString("0"), "0");
  assert.equal(canonicalUintString("0x0"), "0");
  assert.equal(canonicalUintString("0x00ff"), "255");
});

test("uint: BigInt and safe integer inputs are accepted", () => {
  assert.equal(canonicalUintString(42n), "42");
  assert.equal(canonicalUintString(42), "42");
  assert.equal(canonicalUintString(0n), "0");
});

test("uint: uint256 boundary enforced (max ok, max+1 throws)", () => {
  assert.equal(canonicalUintString(UINT256_MAX), UINT256_MAX);
  assert.equal(canonicalUintString(UINT256_MAX_BI), UINT256_MAX);
  assert.throws(() => canonicalUintString(UINT256_MAX_PLUS_1));
  assert.throws(() => canonicalUintString("0x" + "ff".repeat(33)));
});

test("uint: fail-closed rejects negatives, floats, malformed, empty", () => {
  assert.throws(() => canonicalUintString(-1));
  assert.throws(() => canonicalUintString(-1n));
  assert.throws(() => canonicalUintString("1.5"));
  assert.throws(() => canonicalUintString(""));
  assert.throws(() => canonicalUintString("0x"));
  assert.throws(() => canonicalUintString("abc"));
  assert.throws(() => canonicalUintString("1e18"));
  assert.throws(() => canonicalUintString(null));
  assert.throws(() => canonicalUintString(undefined));
});

test("uint: unsafe JS Number (>2^53) is rejected, not silently rounded", () => {
  assert.throws(() => canonicalUintString(10 ** 18), /unsafe JS Number/i);
  assert.throws(() => canonicalUintString(9007199254740992));
  // The safe bound itself is accepted with full precision.
  assert.equal(canonicalUintString(9007199254740991), "9007199254740991");
});

test("uint: canonicalize rejects unsafe JS Numbers (never into a commitment)", () => {
  assert.equal(canonicalize(42), "42");
  assert.throws(() => canonicalize(10 ** 18), /Unsafe JS Number/);
  assert.throws(() => canonicalize(Number.MAX_SAFE_INTEGER + 1));
});

test("uint: isCanonicalUintString accepts only canonical decimal forms", () => {
  assert.equal(isCanonicalUintString("100"), true);
  assert.equal(isCanonicalUintString("0"), true);
  assert.equal(isCanonicalUintString(UINT256_MAX), true);
  assert.equal(isCanonicalUintString("01"), false);
  assert.equal(isCanonicalUintString("0x1"), false);
  assert.equal(isCanonicalUintString("-1"), false);
  assert.equal(isCanonicalUintString("1.5"), false);
  assert.equal(isCanonicalUintString("1e18"), false);
});

test("uint: uintToBigInt round-trips precision", () => {
  assert.equal(uintToBigInt("0xde0b6b3a7640000"), 10n ** 18n);
  assert.equal(uintToBigInt(UINT256_MAX).toString(), UINT256_MAX);
});

test("uint: hex/decimal equivalence proves identical bytes (no representation collision)", async () => {
  // 1.0 ETH written as RPC hex vs as canonical decimal must hash identically.
  const asHex = { version: "CGEP/1", amount: canonicalUintString("0xde0b6b3a7640000") };
  const asDec = { version: "CGEP/1", amount: "1000000000000000000" };
  const h1 = await domainHash("CGEP/1:INTENT", asHex);
  const h2 = await domainHash("CGEP/1:INTENT", asDec);
  assert.equal(h1, h2);
  // And a semantically different value must NOT collide.
  const asDecPlus = { version: "CGEP/1", amount: "1000000000000000001" };
  assert.notEqual(h2, await domainHash("CGEP/1:INTENT", asDecPlus));
});

test("stateDelta hash is domain-separated from evidence hash", async () => {
  const data = { version: "CGEP/1", accounts: [] };
  const sd = await hashStateDelta(data);
  const ev = await domainHash("CGEP/1:EVIDENCE", data);
  assert.notEqual(sd, ev);
  assert.equal(sd, await hashStateDelta(data));
});

test("stateDelta hash is deterministic", async () => {
  const data = { version: "CGEP/1", accounts: [{ address: "0xabc", balance: null }] };
  assert.equal(await hashStateDelta(data), await hashStateDelta(data));
});