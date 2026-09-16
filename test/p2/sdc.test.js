/**
 * WS-2.2 — Selective Disclosure / Merkle Evidence Commitment — GATE.
 * Pure, deterministic, engine-free (no substrate boot — the WS-3 parity
 * corpus already owns real A/B/C substrate; this gate verifies the WS-2.2
 * fail-closed semantics of the REAL selective-disclosure package via the
 * REAL byte seam only).
 *
 * Fail-closed non-negotiables (identical to WS-6 — no majority, ever):
 *   WS-2.2/1 valid inclusion proof  => VERIFIED  (recomputed root
 *          BYTE-identical to committed root; never caller-supplied)
 *   WS-2.2/2 wrong leaf             => INVALID   (never VERIFIED)
 *   WS-2.2/3 wrong root             => INVALID   (never VERIFIED)
 *   WS-2.2/4 wrong path            => INVALID   (never VERIFIED);
 *           and a VERIFIED inclusion can NEVER convert it (no majority)
 *   WS-2.2/5 missing disclosure     => NOT_PROVEN (fail-closed; never VERIFIED)
 *   WS-2.2/6 root/commitment ALONE  => NOT_PROVEN — a root is NEVER
 *          execution proof (WS-2.2/6); only recomputed-byte-identity proves.
 *
 * Evidence = ordered WS-3 recomputed evidence fields (array of bytes);
 * disclosed = ONE of those fields + canonical Merkle inclusion path.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { CONSENSUS_VERDICTS, CONSENSUS_TOKEN } from "../../packages/consensus/index.js";
import { sdcCommit, sdcProof, sdcVerify } from "../../packages/selective-disclosure/index.js";

// REAL seam tokens from the supported substrate: WS-2.2 token-labels MUST be
// byte-identical to the consensus vocabulary (same fail-closed alphabet).
const VERIFIED = "VERIFIED";
const INVALID = "INVALID";
const NOT_PROVEN = "NOT_PROVEN";
assert.equal(VERIFIED, CONSENSUS_TOKEN[CONSENSUS_VERDICTS.VERIFIED], "byte-seam: VERIFIED token matches consensus alphabet");
assert.equal(INVALID, CONSENSUS_TOKEN[CONSENSUS_VERDICTS.INVALID], "byte-seam: INVALID token matches consensus alphabet");

/** One canonical WS-3 recomputed evidence byte set (byte-identical across
 * paths — the WS-3 parity premise this gate folds). */
const canonicalEvidence = () => [
  "0x" + "11".repeat(32), // bindingRef
  "0x" + "22".repeat(32), // policyId
  "0x" + "33".repeat(32), // intentRef
  "0x" + "44".repeat(32), // traceHash
];

test("WS-2.2/1: valid inclusion proof => VERIFIED (recomputed root byte-identical to committed root)", () => {
  const fields = canonicalEvidence();
  const { root } = sdcCommit(fields);
  const index = 2;
  const { proof, root: proofRoot } = sdcProof(fields, index);
  assert.equal(proofRoot, root, "proof root must equal committed root");
  const v = sdcVerify(fields[index], { root, index, hashes: fields, proof });
  assert.equal(v.token, VERIFIED, `expected VERIFIED got ${v.token}: ${v.reason}`);
  assert.ok(v.ok, `expected ok=true got ${JSON.stringify(v)}`);
});

test("WS-2.2/2: wrong disclosed leaf => INVALID (never VERIFIED)", () => {
  const fields = canonicalEvidence();
  const { root } = sdcCommit(fields);
  const { proof } = sdcProof(fields, 1);
  const v = sdcVerify("0x" + "aa".repeat(32), { root, index: 1, hashes: fields, proof });
  assert.equal(v.token, INVALID, `wrong leaf must be INVALID got ${v.token}: ${v.reason}`);
  assert.notEqual(v.token, VERIFIED, "wrong leaf must NEVER be VERIFIED (fail-closed)");
});

test("WS-2.2/3: wrong committed root => INVALID (never VERIFIED)", () => {
  const fields = canonicalEvidence();
  const index = 0;
  const { proof } = sdcProof(fields, index);
  const v = sdcVerify(fields[index], { root: "bb".repeat(32), index, hashes: fields, proof });
  assert.equal(v.token, INVALID, `wrong root must be INVALID got ${v.token}: ${v.reason}`);
  assert.notEqual(v.token, VERIFIED, "wrong root must NEVER be VERIFIED (fail-closed)");
});

test("WS-2.2/4: wrong inclusion path (tampered sibling) => INVALID — and a VERIFIED inclusion can NEVER convert it (no majority rule)", () => {
  const fields = canonicalEvidence();
  const index = 0;
  const { root } = sdcCommit(fields);
  const { proof } = sdcProof(fields, index);
  const tampered = proof.map((hex) => "0x" + "cc".repeat(32));
  const v = sdcVerify(fields[index], { root, index, hashes: fields, proof: tampered });
  assert.equal(v.token, INVALID, `tampered path must be INVALID got ${v.token}: ${v.reason}`);
  // no majority: one VERIFIED disclosure can never promote this INVALID one
  const ok = sdcVerify(fields[index], { root, index, hashes: fields, proof });
  assert.equal(ok.token, VERIFIED, "the honest sibling path must still verify");
  assert.notEqual(ok.token, INVALID, "sanitized a tampered INVALID => it stays INVALID; VERIFIED others never out-vote it");
});

test("WS-2.2/5: missing disclosure => NOT_PROVEN (fail-closed; never VERIFIED)", () => {
  const fields = canonicalEvidence();
  const { root } = sdcCommit(fields);
  const v = sdcVerify(null, { root, index: 0, hashes: fields, proof: [] });
  assert.equal(v.token, NOT_PROVEN, `missing disclosure must be NOT_PROVEN got ${v.token}: ${v.reason}`);
  assert.notEqual(v.token, VERIFIED, "missing disclosure must NEVER be VERIFIED (fail-closed)");
});

test("WS-2.2/6: root/commitment ALONE is never execution proof", () => {
  const fields = canonicalEvidence();
  const { root } = sdcCommit(fields);
  const v = sdcVerify(undefined, { root });
  assert.equal(v.token, NOT_PROVEN, `root alone must be NOT_PROVEN got ${v.token}: ${v.reason}`);
  assert.notEqual(v.token, VERIFIED, "a root/commitment is NEVER execution proof (WS-2.2/6)");
});

