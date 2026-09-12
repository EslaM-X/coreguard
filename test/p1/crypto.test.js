/**
 * P1-1: Intent signer authentication (zero-dependency WebCrypto ECDSA P-256).
 *
 * Prover model: signerAddress = "0x" + sha256(uncompressed pubkey).slice(0,40)
 * Signature covers the ENTIRE canonical intent except `signature` — including
 * signer + signerPubKey, so identity substitution is impossible.
 *
 * Fail-closed: any malformed/foreign signature or identity mismatch is FAIL.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { signIntent, verifyIntentSignature, generateSignerKeyPair, signerAddress } from "../../packages/crypto/index.js";

const INTENT = {
  version: "CGEP/1",
  chainId: "1116",
  nonce: "42",
  target: "0x" + "11".repeat(20),
  recipient: "0x" + "22".repeat(20),
  calldata: "0x23b872dd" + "00".repeat(100),
  amount: "1000000",
  deadline: "2999999999",
  validAfter: "1",
  validUntil: "9999999999",
  gasLimit: "300000",
  policyId: "0xabc",
  signer: "0x" + "33".repeat(20),
};

function flipHexLast(hex) {
  const c = hex.slice(-1);
  return hex.slice(0, -1) + (c === "0" ? "1" : "0");
}

test("crypto: signIntent produces a self-deriving signer identity", async () => {
  const pair = await generateSignerKeyPair();
  const signed = await signIntent(INTENT, pair.privateKeyJwk);
  assert.equal(signed.signer, signerAddress(signed.signerPubKey));
  assert.match(signed.signerPubKey, /^0x[0-9a-f]{128}$/);
  assert.equal(signed.signature.scheme, "ECDSA_P256_SHA256");
  assert.match(signed.signature.r, /^[0-9a-f]{64}$/);
  assert.match(signed.signature.s, /^[0-9a-f]{64}$/);
  assert.equal(signed.nonce, INTENT.nonce);
  assert.equal(signed.chainId, INTENT.chainId);
});

test("crypto: a valid signed intent verifies end-to-end", async () => {
  const pair = await generateSignerKeyPair();
  const signed = await signIntent(INTENT, pair.privateKeyJwk);
  const { valid, recovered } = await verifyIntentSignature(signed);
  assert.equal(valid, true);
  assert.equal(recovered, signed.signer);
});

test("crypto: tampered signature byte is FAIL (s flipped)", async () => {
  const pair = await generateSignerKeyPair();
  const signed = await signIntent(INTENT, pair.privateKeyJwk);
  const tampered = {
    ...signed,
    signature: { ...signed.signature, s: flipHexLast(signed.signature.s) },
  };
  const { valid, reason } = await verifyIntentSignature(tampered);
  assert.equal(valid, false);
  assert.match(reason, /does not verify/);
});

test("crypto: tampering with a committed field breaks the signature (whole-intent bind)", async () => {
  const pair = await generateSignerKeyPair();
  const signed = await signIntent(INTENT, pair.privateKeyJwk);
  const withTamperedAmount = { ...signed, amount: "2000000" };
  const { valid } = await verifyIntentSignature(withTamperedAmount);
  assert.equal(valid, false);
});

test("crypto: identity substitution (different signer than pubkey) is FAIL", async () => {
  const pair = await generateSignerKeyPair();
  const signed = await signIntent(INTENT, pair.privateKeyJwk);
  const swapped = { ...signed, signer: "0x" + "00".repeat(20) };
  const { valid, reason } = await verifyIntentSignature(swapped);
  assert.equal(valid, false);
  assert.match(reason, /derived from signerPubKey/);
});

test("crypto: cross-key signature (signer signs with another key) is FAIL", async () => {
  const pair1 = await generateSignerKeyPair();
  const pair2 = await generateSignerKeyPair();
  const signed = await signIntent(INTENT, pair1.privateKeyJwk);
  const alien = await signIntent({ ...signed, signer: "0x" + "00".repeat(20) }, pair2.privateKeyJwk);
  const { valid, reason } = await verifyIntentSignature({ ...signed, signature: alien.signature });
  assert.equal(valid, false);
  assert.match(reason, /derived from signerPubKey|does not verify/);
});

test("crypto: unknown signature scheme is FAIL (fail-closed, never silent)", async () => {
  const pair = await generateSignerKeyPair();
  const signed = await signIntent(INTENT, pair.privateKeyJwk);
  const alienScheme = { ...signed, signature: { ...signed.signature, scheme: "ETHEREUM_ECRECOVER" } };
  const { valid, reason } = await verifyIntentSignature(alienScheme);
  assert.equal(valid, false);
  assert.match(reason, /scheme/);
});

test("crypto: malformed r/s fields are FAIL (length/structure guard)", async () => {
  const pair = await generateSignerKeyPair();
  const signed = await signIntent(INTENT, pair.privateKeyJwk);
  for (const mutation of [
    { r: "ab12" },
    { r: signed.signature.r, s: "zz" + signed.signature.s.slice(2) },
    { r: "0".repeat(64), s: signed.signature.s }, // r = 0 -> out of range
    { r: signed.signature.r, s: "f".repeat(64) }, // s >= n -> malleability guard
    { r: signed.signature.r.slice(0, -1) },
  ]) {
    const { valid, reason } = await verifyIntentSignature({
      ...signed,
      signature: { ...signed.signature, ...mutation },
    });
    assert.equal(valid, false, `expected FAIL for ${JSON.stringify(mutation)}`);
    assert.ok(reason, "reason must be reported");
  }
});

test("crypto: deterministic prover identity (sha256-derived) is stable", async () => {
  const pub = "0x" + "ab".repeat(64);
  const a = signerAddress(pub);
  const b = signerAddress(pub);
  assert.equal(a, b);
  assert.match(a, /^0x[0-9a-f]{40}$/);
  assert.notEqual(a, "0x" + "00".repeat(20));
});