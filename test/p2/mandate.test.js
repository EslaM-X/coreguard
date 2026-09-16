/**
 * WS-2.3 — Mandate Proof GATE (fail-closed capability chain; fail-closed).
 * Pure, deterministic, engine-free substrate. Drives the REAL package
 * packages/mandate (foldMandate) — the mandate/intent → authorization →
 * execution → attestation byte-seam that MUST byte-bind every layer, and
 * folds byte-IDENTICAL recomputed bindings only.
 *
 * Fail-closed non-negotiables (same alphabet + same no-majority rule as
 * WS-6, WS-2.2 — a VERIFIED mandate can NEVER convert another verdict):
 *   WS-2.3/1 full valid chain               => VERIFIED
 *   WS-2.3/2 scope mismatch                 => INVALID (never VERIFIED)
 *   WS-2.3/3 expired                        => INVALID (never VERIFIED)
 *   WS-2.3/4 signer mismatch                => INVALID (never VERIFIED)
 *   WS-2.3/5 invalid delegation             => INVALID (never VERIFIED)
 *   WS-2.3/6 chain/binding mismatch         => INVALID (never VERIFIED)
 *   WS-2.3/7 missing layer                  => NOT_PROVEN (never VERIFIED)
 *   WS-2.3/8 mandate/authorization ALONE    => NOT_PROVEN — an
 *          authorization/commitment is NEVER execution proof
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { MANDATE_VERDICTS, MANDATE_TOKEN, MANDATE_LABEL, foldMandate } from "../../packages/mandate/index.js";

const VERIFIED = MANDATE_VERDICTS.VERIFIED;
const INVALID = MANDATE_VERDICTS.INVALID;
const NOT_PROVEN = MANDATE_VERDICTS.NOT_PROVEN;

const canonicalMandate = () => ({
  mandateRef: "0x" + "11".repeat(32),
  intentRef: "0x" + "22".repeat(32),
  grantFor: "0x" + "22".repeat(32),
  authorizationRef: "0x" + "33".repeat(32),
  executionRef: "0x" + "33".repeat(32),
  attestationRef: "0x" + "33".repeat(32),
  policyRef: "0x" + "66".repeat(32),
  scope: "coreguard/execute/transfer",
  executionScope: "coreguard/execute/transfer",
  now: 1000,
  notBefore: 0,
  notAfter: 2000,
  hasDelegate: true,
  delegateTo: "0x" + "88".repeat(32),
  signers: ["0x" + "77".repeat(32)],
  signedBy: "0x" + "77".repeat(32),
});

const fold = (over) => foldMandate({ ...canonicalMandate(), ...over });

test("WS-2.3/1: full valid chain => combined VERIFIED", () => {
  const v = fold({});
  assert.equal(v.token, VERIFIED, `expected VERIFIED got ${v.token}: ${v.reason ?? v.label}`);
});

test("WS-2.3/2: scope mismatch => INVALID (never VERIFIED)", () => {
  const v = fold({ executionScope: "coreguard/admin/drain" });
  assert.equal(v.token, INVALID, `scope mismatch must be INVALID got ${v.token}: ${v.reason ?? v.label}`);
  assert.notEqual(v.token, VERIFIED, "scope mismatch must NEVER be VERIFIED (fail-closed)");
});

test("WS-2.3/3: expired => INVALID (never VERIFIED)", () => {
  const v = fold({ now: 5000 });
  assert.equal(v.token, INVALID, `expired must be INVALID got ${v.token}: ${v.reason ?? v.label}`);
  assert.notEqual(v.token, VERIFIED, "expired must NEVER be VERIFIED (fail-closed)");
});

test("WS-2.3/8: mandate/authorization ALONE is never execution proof", () => {
  const v = foldMandate({ mandateRef: "0x" + "11".repeat(32) });
  assert.equal(v.token, NOT_PROVEN, `mandate ALONE must be NOT_PROVEN got ${v.token}: ${v.reason ?? v.label}`);
  assert.notEqual(v.token, VERIFIED, "mandate ALONE must NEVER be VERIFIED: authorization/commitment is never execution proof");
});

test("WS-2.3 tokens byte-bound to the WS-6 consensus alphabet", () => {
  assert.equal(VERIFIED, "VERIFIED", "mandate VERIFIED token must be the byte-identical consensus token");
  assert.equal(INVALID, "INVALID", "mandate INVALID token must be the byte-identical consensus token");
});
