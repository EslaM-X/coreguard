import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateIdentity,
  resolveIdentityClaims,
} from "../../packages/provenance/identity.js";
import {
  computeClaimSetHash,
  buildIdentityClaimSetContext,
} from "../../packages/provenance/canonical.js";
import {
  attestationContentDigest,
  attestationContentDigestV2,
} from "../../packages/provenance/attestation.js";
import { signDigest } from "../../packages/evm/index.js";
import { seedKey, makeAddress, makeTxHash } from "./helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) =>
  JSON.parse(readFileSync(join(__dirname, "fixtures", "identity", name), "utf8"));

const EVM = await import("../../packages/evm/index.js");
const VECTORS = fixture("cacs-vectors.json");

const CHAIN_ID = "1116";
const ISSUER = seedKey(60);
const OTHER = seedKey(63);
const IDENTITY_ROOT = seedKey(61).address;
const MANIFEST_ID = VECTORS.manifestId;
const EXECUTION_REF = { chainId: CHAIN_ID, txHash: makeTxHash(0xbb), blockNumber: "12345" };
const FULL_VALUES = { manufacturer: "example-labs", model: "reasoner", modelVersion: "2.1.0" };
const BASE_OK = { manifestSignature: "OK", declarerBinding: "OK" };
const TRUSTED = {
  trustedAttestors: [
    { issuer: ISSUER.address, credentialType: "AGENT_IDENTITY", chainId: CHAIN_ID },
  ],
};

function identityClaimsFor(values) {
  const claims = {};
  for (const field of ["manufacturer", "model", "modelVersion"]) {
    if (Object.prototype.hasOwnProperty.call(values, field) && values[field] !== null) {
      claims[`identity.${field}`] = values[field];
    }
  }
  return claims;
}

async function computePin(values, executionRef = EXECUTION_REF) {
  return computeClaimSetHash({
    credentialType: "AGENT_IDENTITY",
    issuer: ISSUER.address,
    subject: IDENTITY_ROOT,
    claims: identityClaimsFor(values),
    context: buildIdentityClaimSetContext({ chainId: CHAIN_ID, executionRef, manifestId: MANIFEST_ID }),
  });
}

async function signV2(attestation, priv = ISSUER.priv) {
  const digest = await attestationContentDigestV2(attestation, EVM);
  attestation.signature = await signDigest(digest, priv);
  return attestation;
}

async function signV1(attestation, priv = ISSUER.priv) {
  const digest = await attestationContentDigest(attestation, EVM);
  attestation.signature = await signDigest(digest, priv);
  return attestation;
}

function context(overrides = {}) {
  return {
    chainId: CHAIN_ID,
    executionRef: EXECUTION_REF,
    manifestId: MANIFEST_ID,
    currentBlock: "1000",
    confidence: TRUSTED,
    evm: EVM,
    identityRoot: IDENTITY_ROOT,
    revocationEvidence: {},
    ...overrides,
  };
}

async function resolve(declared, attestations, overrides = {}) {
  const validation = validateIdentity(declared);
  return resolveIdentityClaims({
    validation,
    base: BASE_OK,
    attestations,
    context: context(overrides),
  });
}

test("negative: malformed claimSetHash is an input error, not a silent v1 fallback", async () => {
  const bad = await signV2({
    issuer: ISSUER.address,
    subject: IDENTITY_ROOT,
    credentialType: "AGENT_IDENTITY",
    scope: { chainId: CHAIN_ID, txHash: EXECUTION_REF.txHash },
    issuedAt: "1000",
    expiresAt: "5000",
    revokedAt: null,
    claimSetHash: "0x123",
  });
  const r = await resolve({ identity: FULL_VALUES }, [bad]);
  assert.equal(r.claims.manufacturer.state, null);
  assert.equal(r.claims.manufacturer.error, "MALFORMED_INPUT");
  assert.ok(r.overall.error.length > 0);
  assert.ok(r.overall.reasons.includes("MALFORMED_INPUT"));
});

test("negative: tampered issuer breaks replay (SIGNATURE_INVALID)", async () => {
  const pin = await computePin(FULL_VALUES);
  const att = await signV2({
    issuer: ISSUER.address,
    subject: IDENTITY_ROOT,
    credentialType: "AGENT_IDENTITY",
    scope: { chainId: CHAIN_ID, txHash: EXECUTION_REF.txHash },
    issuedAt: "1000",
    expiresAt: "5000",
    revokedAt: null,
    claimSetHash: pin.claimSetHash,
  });
  att.issuer = OTHER.address;
  const r = await resolve({ identity: FULL_VALUES }, [att]);
  assert.equal(r.claims.manufacturer.state, "NOT_PROVEN");
  assert.equal(r.claims.manufacturer.label, "SIGNATURE_INVALID");
});

test("negative: v2-signed envelope stripped to v1 does not replay (schemes are disjoint)", async () => {
  const pin = await computePin(FULL_VALUES);
  const att = await signV2({
    issuer: ISSUER.address,
    subject: IDENTITY_ROOT,
    credentialType: "AGENT_IDENTITY",
    scope: { chainId: CHAIN_ID, txHash: EXECUTION_REF.txHash },
    issuedAt: "1000",
    expiresAt: "5000",
    revokedAt: null,
    claimSetHash: pin.claimSetHash,
  });
  delete att.claimSetHash;
  const r = await resolve({ identity: FULL_VALUES }, [att]);
  assert.equal(r.claims.manufacturer.state, "NOT_PROVEN");
  assert.equal(r.claims.manufacturer.label, "SIGNATURE_INVALID");
});

test("negative: v1-signed envelope with a claimSetHash appended does not replay", async () => {
  const pin = await computePin(FULL_VALUES);
  const att = await signV1({
    issuer: ISSUER.address,
    subject: IDENTITY_ROOT,
    credentialType: "AGENT_IDENTITY",
    scope: { chainId: CHAIN_ID, txHash: EXECUTION_REF.txHash },
    issuedAt: "1000",
    expiresAt: "5000",
  });
  att.claimSetHash = pin.claimSetHash;
  const r = await resolve({ identity: FULL_VALUES }, [att]);
  assert.equal(r.claims.manufacturer.state, "NOT_PROVEN");
  assert.equal(r.claims.manufacturer.label, "SIGNATURE_INVALID");
});

test("negative: signing a different claim set breaks the hash binding", async () => {
  const pin = await computePin(FULL_VALUES);
  const signedOther = await computePin({ modelVersion: "9.9.9" });
  const att = await signV2({
    issuer: ISSUER.address,
    subject: IDENTITY_ROOT,
    credentialType: "AGENT_IDENTITY",
    scope: { chainId: CHAIN_ID, txHash: EXECUTION_REF.txHash },
    issuedAt: "1000",
    expiresAt: "5000",
    revokedAt: null,
    claimSetHash: signedOther.claimSetHash,
  });
  void pin;
  const r = await resolve({ identity: FULL_VALUES }, [att]);
  assert.equal(r.claims.manufacturer.state, "NOT_PROVEN");
  assert.equal(r.claims.manufacturer.label, "CLAIM_SET_HASH_MISMATCH");
  assert.equal(r.claims.modelVersion.state, "NOT_PROVEN");
  assert.equal(r.claims.modelVersion.label, "CLAIM_SET_HASH_MISMATCH");
});

test("negative: unrecognized issuer stays DECLARED and never lifts", async () => {
  const pin = await computePin(FULL_VALUES);
  const att = await signV2({
    issuer: OTHER.address,
    subject: IDENTITY_ROOT,
    credentialType: "AGENT_IDENTITY",
    scope: { chainId: CHAIN_ID, txHash: EXECUTION_REF.txHash },
    issuedAt: "1000",
    expiresAt: "5000",
    revokedAt: null,
    claimSetHash: pin.claimSetHash,
  }, OTHER.priv);
  const r = await resolve({ identity: FULL_VALUES }, [att]);
  assert.equal(r.claims.manufacturer.state, "DECLARED");
  assert.equal(r.claims.manufacturer.label, "ISSUER_UNRECOGNIZED");
});

test("negative: unrecognized credentialType asserts nothing", async () => {
  const claims = { "identity.manufacturer": "example-labs" };
  const cacs = await computeClaimSetHash({
    credentialType: "AUDIT_REPORT",
    issuer: ISSUER.address,
    subject: IDENTITY_ROOT,
    claims,
    context: buildIdentityClaimSetContext({ chainId: CHAIN_ID, executionRef: EXECUTION_REF, manifestId: MANIFEST_ID }),
  });
  const att = await signV2({
    issuer: ISSUER.address,
    subject: IDENTITY_ROOT,
    credentialType: "AUDIT_REPORT",
    scope: { chainId: CHAIN_ID, txHash: EXECUTION_REF.txHash },
    issuedAt: "1000",
    expiresAt: "5000",
    revokedAt: null,
    claimSetHash: cacs.claimSetHash,
  });
  const r = await resolve({ identity: FULL_VALUES }, [att]);
  assert.equal(r.claims.manufacturer.state, "DECLARED");
  assert.equal(r.claims.manufacturer.label, "DECLARED_SELF_CLAIM");
});

test("negative: a broken base is NOT_PROVEN even when a good attestation is asserted", async () => {
  const pin = await computePin(FULL_VALUES);
  const att = await signV2({
    issuer: ISSUER.address,
    subject: IDENTITY_ROOT,
    credentialType: "AGENT_IDENTITY",
    scope: { chainId: CHAIN_ID, txHash: EXECUTION_REF.txHash },
    issuedAt: "1000",
    expiresAt: "5000",
    revokedAt: null,
    claimSetHash: pin.claimSetHash,
  });
  const validation = validateIdentity({ identity: FULL_VALUES });
  const r = await resolveIdentityClaims({
    validation,
    base: { manifestSignature: "NOT_PROVEN", declarerBinding: "OK" },
    attestations: [att],
    context: context(),
  });
  assert.equal(r.claims.manufacturer.state, "NOT_PROVEN");
  assert.equal(r.claims.manufacturer.label, "BASE_NOT_PROVEN");
});

test("negative: empty claim set with explicit-null fields is NOT_PROVEN (nullValue FORBIDDEN)", async () => {
  const values = { manufacturer: null, model: null, modelVersion: null };
  const cacs = await computeClaimSetHash({
    credentialType: "AGENT_IDENTITY",
    issuer: ISSUER.address,
    subject: IDENTITY_ROOT,
    claims: {},
    context: buildIdentityClaimSetContext({ chainId: CHAIN_ID, executionRef: EXECUTION_REF, manifestId: MANIFEST_ID }),
  });
  const att = await signV2({
    issuer: ISSUER.address,
    subject: IDENTITY_ROOT,
    credentialType: "AGENT_IDENTITY",
    scope: { chainId: CHAIN_ID, txHash: EXECUTION_REF.txHash },
    issuedAt: "1000",
    expiresAt: "5000",
    revokedAt: null,
    claimSetHash: cacs.claimSetHash,
  });
  const r = await resolve({ identity: values }, [att]);
  assert.equal(r.claims.manufacturer.state, "NOT_PROVEN");
  assert.equal(r.claims.manufacturer.label, "NULL_CLAIM_FORBIDDEN");
});

test("negative: unknown identity field is rejected, never silently dropped", () => {
  const r = validateIdentity({ identity: { mystery: "x", manufacturer: "example-labs" } });
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].path, "declared.identity.mystery");
  assert.equal(r.values.manufacturer, "example-labs");
});

test("negative: uppercase identity values are rejected (no normalization)", () => {
  const r = validateIdentity({ identity: { manufacturer: "Example-Labs" } });
  assert.equal(r.errors.length, 1);
  assert.notEqual(r.values.manufacturer, "example-labs");
});

test("negative: typeError fields are never treated as claims", () => {
  const r = validateIdentity({ identity: { modelVersion: 123 } });
  assert.equal(r.errors.length, 1);
  assert.equal(r.values.modelVersion, undefined);
});