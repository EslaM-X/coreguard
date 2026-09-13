/**
 * Phase A — Attestation signature & recognition (CGEP/1 §5/§7, §5b revocation).
 *
 * ATTESTATION_SIGNATURES: recovered signer MUST equal declared issuer.
 * ATTESTATION_RECOGNITION: only a verifier-trusted issuer+credentialType+
 *   scope vouches content up to ATTESTED (never VERIFIED via signatures alone).
 * §5b: in-envelope revokedAt alone is DECLARED — never PROVEN.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  verifyAttestationSignature,
  recognizeAttestation,
  revocationStatus,
  attestationContentDigest,
  VERDICT_ATTESTED,
} from "../../packages/provenance/attestation.js";
import { signDigest } from "../../packages/provenance/eip712.js";
import { seedKey, makeAddress, makeTxHash } from "./helpers.js";

const ISSUER = seedKey(60);
const SUBJECT = makeAddress(0xaa);

async function makeAttestation({ issuer = ISSUER, subject = SUBJECT, credentialType = "AGENT_PROFILE", scopeChainId = "1116", revoke = false } = {}) {
  const attestation = {
    issuer: issuer.address,
    subject,
    credentialType,
    scope: { chainId: scopeChainId, txHash: makeTxHash(0xbb) },
    issuedAt: "1000",
    expiresAt: "5000",
    revokedAt: revoke ? "2000" : null,
  };
  const digest = attestationContentDigest(attestation);
  attestation.signature = await signDigest(digest, issuer.priv);
  return attestation;
}

test("attestation: valid signed envelope passes replay", async () => {
  const att = await makeAttestation();
  const r = verifyAttestationSignature(att);
  assert.equal(r.valid, true);
  assert.equal(r.signer.toLowerCase(), ISSUER.address.toLowerCase());
});

test("attestation: issuer field substitution breaks replay (FAIL)", async () => {
  const att = await makeAttestation();
  const swapped = { ...att, issuer: SUBJECT };
  const r = verifyAttestationSignature(swapped);
  assert.equal(r.valid, false);
  assert.match(r.reason, /issuer/);
});

test("attestation: tampered credentialType breaks replay", async () => {
  const att = await makeAttestation();
  const tampered = { ...att, credentialType: "AUDIT_REPORT" };
  assert.equal(verifyAttestationSignature(tampered).valid, false);
});

test("attestation: tampered scope.txHash breaks replay", async () => {
  const att = await makeAttestation();
  const tampered = { ...att, scope: { ...att.scope, txHash: makeTxHash(0xcc) } };
  assert.equal(verifyAttestationSignature(tampered).valid, false);
});

test("recognition: unrecognized issuer stays NOT_PROVEN (fail-closed)", async () => {
  const att = await makeAttestation();
  const r = recognizeAttestation(att, { trustedAttestors: [{ issuer: makeAddress(0x99), credentialType: "AGENT_PROFILE" }] });
  assert.equal(r.verdict, "NOT_PROVEN");
  assert.match(r.reason, /trusted set/);
});

test("recognition: trusted issuer + type + scope → ATTESTED", async () => {
  const att = await makeAttestation();
  const r = recognizeAttestation(att, {
    trustedAttestors: [{ issuer: ISSUER.address, credentialType: "AGENT_PROFILE", chainId: "1116" }],
  });
  assert.equal(r.verdict, VERDICT_ATTESTED);
});

test("recognition: trusted for another chainId does NOT vouch", async () => {
  const att = await makeAttestation();
  const r = recognizeAttestation(att, {
    trustedAttestors: [{ issuer: ISSUER.address, credentialType: "AGENT_PROFILE", chainId: "10" }],
  });
  assert.equal(r.verdict, "NOT_PROVEN");
});

test("recognition: expired attestation is NOT_PROVEN", async () => {
  const att = await makeAttestation();
  const r = recognizeAttestation(att, { trustedAttestors: [{ issuer: ISSUER.address, credentialType: "AGENT_PROFILE" }], currentBlock: "6000" });
  assert.equal(r.verdict, "NOT_PROVEN");
  assert.equal(r.label, "EXPIRED");
});

test("revocation (§5b): in-manifest revokedAt is DECLARED, not PROVEN", async () => {
  const att = await makeAttestation({ revoke: true });
  const r = revocationStatus(att, {});
  assert.equal(r.revoked, true);
  assert.equal(r.provenance, "DECLARED");
  assert.match(r.reason, /declaration/);
});

test("revocation (§5b): authoritative evidence → PROVEN", async () => {
  const att = await makeAttestation({ revoke: true });
  att.id = `0x${"dd".repeat(32)}`;
  const r = revocationStatus(att, {
    revocationProof: { attestationHash: att.id, atBlock: "1999" },
  });
  assert.equal(r.revoked, true);
  assert.equal(r.provenance, "PROVEN");
});

test("revocation (§5b): evidence not bound to THIS attestation is ignored", async () => {
  const att = await makeAttestation({ revoke: true });
  att.id = `0x${"dd".repeat(32)}`;
  const r = revocationStatus(att, {
    revocationProof: { attestationHash: `0x${"ee".repeat(32)}`, atBlock: "1" },
  });
  assert.equal(r.revoked, false);
  assert.match(r.reason, /bind/);
});

test("attestation: no revocation declared returns false clean", async () => {
  const att = await makeAttestation();
  const r = revocationStatus(att, {});
  assert.equal(r.revoked, false);
});