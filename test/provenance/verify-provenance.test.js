/**
 * Phase A — verify-provenance orchestrator (CGEP/1 §7).
 *
 * End-to-end, fail-closed:
 *   - a valid STAMP with a direct signer (tx.from) reaches
 *     MANIFEST_ID_PROVEN (or + ATTESTED when a trusted attestation is present).
 *   - a STAMP whose declared authority does NOT own tx.from is FAIL.
 *   - a tampered (attacker-modified) manifest is FAIL — the signature and
 *     manifestId recomputation both reject it.
 *   - unknown executor types resolve to UNKNOWN (fail-closed, not an error).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { verifyProvenance } from "../../packages/provenance/index.js";
import { makeManifest, signManifest, seedKey, makeAddress, makeTxHash } from "./helpers.js";
import { signDigest } from "../../packages/evm/index.js";
import { delegationDigest } from "../../packages/provenance/delegation.js";

const EVM = await import("../../packages/evm/index.js");
const CHAIN_ID = "1116";
const TX_FROM = makeAddress(0x1); // actual execution from (per on-chain evidence)

async function stampManifest({ signer, chainId = CHAIN_ID, delegation = null, executorType = "AI_AGENT" }) {
  const totalPriv = signer.priv;
  const manifest = makeManifest({
    kind: "STAMP",
    signerAddress: signer.address,
    chainId,
    executorType,
    executionRef: {
      chainId,
      txHash: makeTxHash(0xa1),
      blockNumber: "12345",
    },
    extra: delegation ? { delegationChain: delegation } : {},
  });
  const signed = await signManifest(manifest, totalPriv, chainId);
  // signManifest uses declared.signerBinding.address as its signature.signer;
  // that address must equal the actual signing key's address.
  assert.equal(signed.signature.signer.toLowerCase(), signer.address.toLowerCase());
  return signed;
}

async function signDelegationLink({ authority, grantedTo, priv, chainId = CHAIN_ID }) {
  const digest = await delegationDigest(
    { authority, grantedTo, scopeActionHash: "0", maxValue: "0", validAfter: "0", expiresAt: "0" },
    chainId,
    EVM,
  );
  const sig = await signDigest(digest, priv);
  return {
    authority,
    grantedTo,
    scopeActionHash: "0",
    maxValue: "0",
    validAfter: "0",
    expiresAt: "0",
    signature: sig,
  };
}

test("verify-provenance: valid direct STAMP → MANIFEST_ID_PROVEN", async () => {
  const signer = seedKey(70);
  const manifest = await stampManifest({ signer });
  const out = await verifyProvenance(manifest, {
    chainId: CHAIN_ID,
    executionFrom: signer.address,
    executionBlock: "12345",
  });

  assert.equal(out.verdicts.PROVENANCE_COMMITMENT.status, "OK");
  assert.equal(out.verdicts.MANIFEST_SIGNATURE.status, "OK");
  assert.equal(out.verdicts.DECLARER_EXECUTION_BINDING.status, "OK");
  assert.equal(out.verdicts.DECLARER_EXECUTION_BINDING.label, "DIRECT (signer = tx.from)");
  assert.equal(out.summary, "MANIFEST_ID_PROVEN");
});

test("verify-provenance: DECLARER_EXECUTION_BINDING fails when tx.from != declared authority", async () => {
  const signer = seedKey(71);
  const manifest = await stampManifest({ signer });
  const out = await verifyProvenance(manifest, {
    chainId: CHAIN_ID,
    executionFrom: TX_FROM,
    executionBlock: "12345",
  });

  // Signature itself replays fine, but the declarer does not own THIS tx.
  assert.equal(out.verdicts.MANIFEST_SIGNATURE.status, "OK");
  assert.equal(out.verdicts.DECLARER_EXECUTION_BINDING.status, "NOT_PROVEN");
  assert.match(out.summary, /FAIL_CLOSED/);
  assert.ok(out.errors.some((e) => /DECLARER_EXECUTION_BINDING/.test(e)));
});

test("verify-provenance: attacker-tampered manifest is FAIL (signature breaks)", async () => {
  const signer = seedKey(72);
  const manifest = await stampManifest({ signer });
  // attacker swaps signed content → manifestId recompute differs + replay fails
  manifest.declared.executorType = "MALICIOUS";
  const out = await verifyProvenance(manifest, {
    chainId: CHAIN_ID,
    executionFrom: signer.address,
    executionBlock: "12345",
  });

  assert.equal(out.verdicts.MANIFEST_SIGNATURE.status, "NOT_PROVEN");
  assert.match(out.summary, /FAIL_CLOSED/);
});

test("verify-provenance: attacker-tampered manifestId is FAIL (commitment mismatch)", async () => {
  const signer = seedKey(73);
  const manifest = await stampManifest({ signer });
  manifest.manifestId = `0x${"ff".repeat(32)}`;
  const out = await verifyProvenance(manifest, {
    chainId: CHAIN_ID,
    executionFrom: signer.address,
    executionBlock: "12345",
  });

  assert.equal(out.verdicts.PROVENANCE_COMMITMENT.status, "NOT_PROVEN");
  assert.equal(out.verdicts.PROVENANCE_COMMITMENT.label, "MANIFEST_ID_MISMATCH");
  assert.match(out.summary, /FAIL_CLOSED/);
});

test("verify-provenance: schema-invalid manifest fails closed", async () => {
  const signer = seedKey(74);
  const manifest = await stampManifest({ signer });
  manifest.manifestKind = "SCAM";
  const out = await verifyProvenance(manifest, {
    chainId: CHAIN_ID,
    executionFrom: signer.address,
    executionBlock: "12345",
  });

  assert.equal(out.verdicts.PROVENANCE_COMMITMENT.label, "SCHEMA_INVALID");
  assert.match(out.summary, /FAIL_CLOSED/);
});

test("verify-provenance: unknown executorType is UNKNOWN (advisory, no error)", async () => {
  const signer = seedKey(75);
  const manifest = await stampManifest({ signer, executorType: "quantum-hive-mind" });
  const out = await verifyProvenance(manifest, {
    chainId: CHAIN_ID,
    executionFrom: signer.address,
    executionBlock: "12345",
  });

  assert.equal(out.verdicts.EXECUTOR_TYPE.executorType, "UNKNOWN");
  assert.equal(out.summary, "MANIFEST_ID_PROVEN");
});

test("verify-provenance: REGISTRATION passes with identity-root binding", async () => {
  const signer = seedKey(76);
  const manifest = makeManifest({ kind: "REGISTRATION", signerAddress: signer.address, chainId: CHAIN_ID });
  const signed = await signManifest(manifest, signer.priv, CHAIN_ID);

  const out = await verifyProvenance(signed, {
    chainId: CHAIN_ID,
    executionFrom: TX_FROM, // REGISTRATION does NOT need tx.from
    executionBlock: "12345",
  });

  assert.equal(out.verdicts.DECLARER_EXECUTION_BINDING.status, "OK");
  assert.equal(out.verdicts.DECLARER_EXECUTION_BINDING.label, "REGISTRATION (identity root)");
});

test("verify-provenance: delegated STAMP via valid delegation chain reaches proven", async () => {
  // head is the declarer authority, grants to the tx.from, who executes.
  const head = seedKey(77);
  const grantee = seedKey(78);
  const link = await signDelegationLink({ authority: head.address, grantedTo: grantee.address, priv: head.priv });

  const manifest = await stampManifest({ signer: head, delegation: [link] });

  const out = await verifyProvenance(manifest, {
    chainId: CHAIN_ID,
    executionFrom: grantee.address,
    executionBlock: "12345",
  });

  assert.equal(out.verdicts.DELEGATION_CHAIN.status, "OK");
  assert.equal(out.verdicts.DECLARER_EXECUTION_BINDING.status, "OK");
  assert.equal(out.verdicts.DECLARER_EXECUTION_BINDING.label, "DELEGATED (grantee = tx.from)");
  assert.equal(out.summary, "MANIFEST_ID_PROVEN");
});

test("verify-provenance: attestation from trusted issuer lifts to ATTESTED", async () => {
  const signer = seedKey(79);
  const issuer = seedKey(60);

  const manifest = await stampManifest({ signer });

  const attestation = {
    issuer: issuer.address,
    subject: signer.address,
    credentialType: "AGENT_PROFILE",
    scope: { chainId: CHAIN_ID, txHash: makeTxHash(0xa1) },
    issuedAt: "0",
    expiresAt: "9999999999",
    revokedAt: null,
  };
  const { attestationContentDigest } = await import("../../packages/provenance/attestation.js");
  const digest = await attestationContentDigest(attestation, EVM);
  attestation.signature = await signDigest(digest, issuer.priv);

  const out = await verifyProvenance(manifest, {
    chainId: CHAIN_ID,
    executionFrom: signer.address,
    executionBlock: "12345",
    attestations: [attestation],
    confidence: {
      trustedAttestors: [
        { issuer: issuer.address, credentialType: "AGENT_PROFILE", chainId: CHAIN_ID },
      ],
    },
  });

  assert.equal(out.verdicts.ATTESTATION_SIGNATURES.status, "OK");
  assert.equal(out.verdicts.ATTESTATION_RECOGNITION.status, "OK");
  assert.equal(out.verdicts.ATTESTATION_RECOGNITION.label, "ATTESTED");
  assert.equal(out.summary, "MANIFEST_ID_PROVEN + ATTESTED");
});

test("verify-provenance: adapters ommitted → EVM checks NOT_RUN, zero-dep commitment still evaluated", async () => {
  // Force the EVM adapter to be unavailable (options.evm = null) to prove the
  // verifier reports NOT_RUN — it never invents a cryptographic result.
  const signer = seedKey(71);
  const manifest = await stampManifest({ signer });

  const out = await verifyProvenance(manifest, {
    chainId: CHAIN_ID,
    executionFrom: signer.address,
    executionBlock: "12345",
  }, { evm: null });

  // Zero-dep core (sha256 commitment) still evaluates; EVM axes are NOT_RUN.
  assert.equal(out.verdicts.PROVENANCE_COMMITMENT.status, "OK");
  assert.equal(out.verdicts.MANIFEST_SIGNATURE.status, "NOT_RUN");
  assert.equal(out.verdicts.MANIFEST_SIGNATURE.label, "EVM_ADAPTER_UNAVAILABLE");
  assert.equal(out.verdicts.DECLARER_EXECUTION_BINDING.status, "NOT_RUN");
  assert.equal(out.verdicts.DELEGATION_CHAIN.status, "NOT_PROVEN");
  assert.equal(out.verdicts.DELEGATION_CHAIN.label, "NO_DELEGATION_CHAIN");
  assert.match(out.summary, /NOT_RUN/);
  assert.ok(out.errors.every((e) => !/recovered signer|DECLARER_EXECUTION_BINDING/.test(e)),
    "NOT_RUN must not fabricate a signer-failure error");
});