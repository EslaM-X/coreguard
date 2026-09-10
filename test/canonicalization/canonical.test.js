/**
 * CoreGuard Canonicalization Tests
 *
 * Verify that identical logical data produces identical bytes and hashes.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { canonicalize, domainHash } from "../../packages/canonical/index.js";

test("canonicalize: integers become decimal strings", () => {
  assert.equal(canonicalize(123), "123");
  assert.equal(canonicalize(0), "0");
});

test("canonicalize: booleans", () => {
  assert.equal(canonicalize(true), "true");
  assert.equal(canonicalize(false), "false");
});

test("canonicalize: null", () => {
  assert.equal(canonicalize(null), "null");
  assert.equal(canonicalize(undefined), "null");
});

test("canonicalize: arrays in order", () => {
  assert.equal(canonicalize([1, 2, 3]), "[1,2,3]");
  assert.equal(canonicalize([]), "[]");
});

test("canonicalize: objects keys sorted alphabetically", () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

test("canonicalize: addresses lowercase", () => {
  assert.equal(canonicalize("0xABC"), '"0xabc"');
});

test("canonicalize: nested objects", () => {
  const obj = { nested: { z: 1, a: 2 }, top: 1 };
  assert.equal(canonicalize(obj), '{"nested":{"a":2,"z":1},"top":1}');
});

test("canonicalize: determinism — same input, same output", () => {
  const a = { b: [1, 2], a: { c: "hello", d: true } };
  const b = JSON.parse(JSON.stringify(a));
  assert.equal(canonicalize(a), canonicalize(b));
});

test("domainHash: domain separation produces different hashes", async () => {
  const data = { test: 1 };
  const h1 = await domainHash("CGEP/1:INTENT", data);
  const h2 = await domainHash("CGEP/1:POLICY", data);
  assert.notEqual(h1, h2);
});

test("domainHash: deterministic hash", async () => {
  const data = { test: 1 };
  const h1 = await domainHash("CGEP/1:INTENT", data);
  const h2 = await domainHash("CGEP/1:INTENT", data);
  assert.equal(h1, h2);
});

test("domainHash: different data produces different hashes", async () => {
  const h1 = await domainHash("CGEP/1:INTENT", { a: 1 });
  const h2 = await domainHash("CGEP/1:INTENT", { a: 2 });
  assert.notEqual(h1, h2);
});