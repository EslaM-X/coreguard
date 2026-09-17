import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateIdentity,
  detectIdentityContradiction,
  resolveIdentityClaims,
  IDENTITY_FIELDS,
  IDENTITY_PATHS,
  IDENTITY_LIMITS,
  IDENTITY_CHARSET,
  IDENTITY_RULES,
  IDENTITY_NULL_CLAIM,
  IDENTITY_DEFAULT_NULL_CLAIM,
  IDENTITY_CAP,
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
const DECLARED = fixture("declared.json");

const CHAIN_ID = "1116";
const ISSUER = seedKey(60);
const SUBJECT = seedKey(61);
const IDENTITY_ROOT = SUBJECT.address;
const MANIFEST_ID = VECTORS.manifestId;
const EXECUTION_REF = { chainId: CHAIN_ID, txHash: makeTxHash(0xbb), blockNumber: "12345" };
const FULL_VALUES = { manufacturer: "example-labs", model: "reasoner", modelVersion: "2.1.0" };
const BASE_OK = { manifestSignature: "OK", declarerBinding: "OK" };

function identityClaimsFor(values) {
  const claims = {};
  for (const field of ["manufacturer", "model", "modelVersion"]) {
    if (Object.prototype.hasOwnProperty.call(values, field) && values[field] !== null) {
      claims[`identity.${field}`] = values[field];
    }
  }
  return claims;
}

async function computePin({ issuer = ISSUER.address, subject = IDENTITY_ROOT, credentialType = "AGENT_IDENTITY", values, chainId = CHAIN_ID, executionRef = EXECUTION_REF, manifestId = MANIFEST_ID }) {
  return computeClaimSetHash({
    credentialType,
    issuer,
    subject,
    claims: identityClaimsFor(values),
    context: buildIdentityClaimSetContext({ chainId, executionRef, manifestId }),
  });
}

async function signV2({ issuer = ISSUER, subject = IDENTITY_ROOT, credentialType = "AGENT_IDENTITY", scope = { chainId: CHAIN_ID, txHash: EXECUTION_REF.txHash }, claimSetHash, issuedAt = "1000", expiresAt = "5000", revokedAt = null } = {}) {
  const envelope = { issuer: issuer.address, subject, credentialType, scope, issuedAt, expiresAt, revokedAt, claimSetHash };
  const digest = await attestationContentDigestV2(envelope, EVM);
  envelope.signature = await signDigest(digest, issuer.priv);
  return envelope;
}

async function signV1({ issuer = ISSUER, subject = IDENTITY_ROOT, credentialType = "AGENT_IDENTITY", scope = { chainId: CHAIN_ID, txHash: EXECUTION_REF.txHash }, issuedAt = "1000", expiresAt = "5000" } = {}) {
  const envelope = { issuer: issuer.address, subject, credentialType, scope, issuedAt, expiresAt };
  const digest = await attestationContentDigest(envelope, EVM);
  envelope.signature = await signDigest(digest, issuer.priv);
  return envelope;
}

function makeContext(overrides = {}) {
  return {
    chainId: CHAIN_ID,
    executionRef: EXECUTION_REF,
    manifestId: MANIFEST_ID,
    currentBlock: "1000",
    confidence: {
      trustedAttestors: [
        { issuer: ISSUER.address, credentialType: "AGENT_IDENTITY", chainId: CHAIN_ID },
        { issuer: ISSUER.address, credentialType: "AGENT_PROFILE" },
      ],
    },
    evm: EVM,
    identityRoot: IDENTITY_ROOT,
    revocationEvidence: {},
    ...overrides,
  };
}

async function resolve({ declared, base = BASE_OK, attestations = [], context = makeContext(), suspicion, cap } = {}) {
  const validation = validateIdentity(typeof declared === "object" ? declared : {});
  const result = await resolveIdentityClaims({
    validation,
    base,
    attestations,
    context,
    suspicion,
    ...(cap !== undefined ? { cap } : {}),
  });
  return result;
}

test("identity: field registry and constants", () => {
  assert.deepEqual(IDENTITY_FIELDS, ["manufacturer", "model", "modelVersion"]);
  assert.deepEqual(IDENTITY_PATHS, ["identity.manufacturer", "identity.model", "identity.modelVersion"]);
  assert.equal(IDENTITY_LIMITS.manufacturer, 64);
  assert.equal(IDENTITY_LIMITS.model, 64);
  assert.equal(IDENTITY_LIMITS.modelVersion, 32);
  assert.match("abc_123.def-1", IDENTITY_CHARSET);
  assert.doesNotMatch("UPPER", IDENTITY_CHARSET);
  assert.doesNotMatch("with space", IDENTITY_CHARSET);
  assert.equal(IDENTITY_NULL_CLAIM.PERMITTED, "PERMITTED");
  assert.equal(IDENTITY_DEFAULT_NULL_CLAIM, "FORBIDDEN");
  assert.equal(IDENTITY_RULES.AGENT_IDENTITY.nullValue, "FORBIDDEN");
  assert.equal(IDENTITY_CAP.active, true);
});

test("validateIdentity: declared matrix", () => {
  const cases = [
    ["absent", "ABSENT", false, 0],
    ["nullIdentity", "ABSENT", false, 0],
    ["empty", "EMPTY", false, 0],
    ["validFull", "PRESENT", false, 0],
    ["validCharsetFull", "PRESENT", false, 0],
    ["validPartial", "PRESENT", false, 0],
    ["uppercase", "PRESENT", false, 1],
    ["badCharset", "PRESENT", false, 1],
    ["emptyString", "PRESENT", false, 1],
    ["longString", "PRESENT", false, 1],
    ["overLimitManufacturer", "PRESENT", false, 1],
    ["typeError", "PRESENT", false, 1],
    ["unknownField", "PRESENT", false, 1],
    ["nullField", "PRESENT", false, 0],
    ["nullAndValue", "PRESENT", false, 0],
    ["malformedString", "PRESENT", true, 1],
    ["malformedArray", "PRESENT", true, 1],
  ];
  for (const [name, presence, malformed, errorCount] of cases) {
    const r = validateIdentity(DECLARED[name]);
    assert.equal(r.presence, presence, `${name} presence`);
    assert.equal(Boolean(r.malformed), malformed, `${name} malformed`);
    assert.equal(r.errors.length, errorCount, `${name} error count`);
    for (const err of r.errors) assert.equal(err.code, "MALFORMED_INPUT");
  }
});

test("validateIdentity: length boundaries", () => {
  const ok64 = validateIdentity({ identity: { manufacturer: "a".repeat(64) } });
  assert.equal(ok64.errors.length, 0);
  assert.equal(ok64.values.manufacturer, "a".repeat(64));

  const over64 = validateIdentity({ identity: { manufacturer: "a".repeat(65) } });
  assert.equal(over64.errors.length, 1);

  const ok32 = validateIdentity({ identity: { modelVersion: "a".repeat(32) } });
  assert.equal(ok32.errors.length, 0);

  const over32 = validateIdentity({ identity: { modelVersion: "a".repeat(33) } });
  assert.equal(over32.errors.length, 1);
});

test("validateIdentity: null values are preserved, not validated as strings", () => {
  const r = validateIdentity({ identity: { manufacturer: null, model: "reasoner" } });
  assert.equal(r.errors.length, 0);
  assert.equal(r.values.manufacturer, null);
  assert.equal(r.values.model, "reasoner");
});

test("detectIdentityContradiction: same executionRef conflicting fields", () => {
  const ref = { chainId: "1116", txHash: "0x" + "aa".repeat(32), blockNumber: "1" };
  const a = { executionRef: ref, declared: { identity: { manufacturer: "example-labs", model: "reasoner" } } };
  const b = { executionRef: ref, declared: { identity: { manufacturer: "example-labs", model: "other-model" } } };
  const r = detectIdentityContradiction([a, b], ref);
  assert.equal(r.contradiction, true);
  assert.deepEqual(r.fields, ["model"]);
});

test("detectIdentityContradiction: identical declarations are not contradictions", () => {
  const ref = { chainId: "1116", txHash: "0x" + "aa".repeat(32), blockNumber: "1" };
  const a = { executionRef: ref, declared: { identity: { manufacturer: "example-labs" } } };
  const b = { executionRef: ref, declared: { identity: { manufacturer: "example-labs" } } };
  const r = detectIdentityContradiction([a, b], ref);
  assert.equal(r.contradiction, false);
});

test("detectIdentityContradiction: different executionRef is not a contradiction", () => {
  const ref1 = { chainId: "1116", txHash: "0x" + "aa".repeat(32), blockNumber: "1" };
  const ref2 = { chainId: "1116", txHash: "0x" + "bb".repeat(32), blockNumber: "2" };
  const a = { executionRef: ref1, declared: { identity: { model: "reasoner" } } };
  const b = { executionRef: ref2, declared: { identity: { model: "other" } } };
  assert.equal(detectIdentityContradiction([a, b], ref1).contradiction, false);
});

test("detectIdentityContradiction: null vs value is a contradiction", () => {
  const ref = { chainId: "1116", txHash: "0x" + "aa".repeat(32), blockNumber: "1" };
  const a = { executionRef: ref, declared: { identity: { model: "reasoner" } } };
  const b = { executionRef: ref, declared: { identity: { model: null } } };
  const r = detectIdentityContradiction([a, b], ref);
  assert.equal(r.contradiction, true);
  assert.deepEqual(r.fields, ["model"]);
});

test("resolve: authentic self-claim stays DECLARED when no attestation is asserted", async () => {
  const r = await resolve({ declared: { identity: FULL_VALUES } });
  for (const field of IDENTITY_FIELDS) {
    assert.equal(r.claims[field].state, "DECLARED");
    assert.equal(r.claims[field].label, "DECLARED_SELF_CLAIM");
  }
  assert.equal(r.overall.state, "DECLARED");
  assert.equal(r.manifest, "VALID");
});

test("resolve: identity absent resolves UNKNOWN for every field", async () => {
  const r = await resolve({ declared: {} });
  for (const field of IDENTITY_FIELDS) {
    assert.equal(r.claims[field].state, "UNKNOWN");
    assert.equal(r.claims[field].label, "NOT_DECLARED");
  }
  assert.equal(r.overall.state, "UNKNOWN");
});

test("resolve: identity block null resolves UNKNOWN for every field", async () => {
  const r = await resolve({ declared: { identity: null } });
  for (const field of IDENTITY_FIELDS) {
    assert.equal(r.claims[field].state, "UNKNOWN");
  }
});

test("resolve: explicit-null field without attestation is UNKNOWN (no value asserted)", async () => {
  const r = await resolve({ declared: { identity: { model: null } } });
  assert.equal(r.claims.model.state, "UNKNOWN");
  assert.equal(r.claims.model.label, "NULL_DECLARED");
});

test("cacs vectors: deterministic recomputation matches pinned hashes", async () => {
  for (const v of VECTORS.vectors) {
    const r = await computeClaimSetHash({
      credentialType: VECTORS.credentialType,
      issuer: VECTORS.issuer,
      subject: VECTORS.subject,
      claims: v.claims,
      context: buildIdentityClaimSetContext(v.context),
    });
    assert.equal(r.hashInput, v.canonicalInput, `${v.id} canonical input`);
    assert.equal(r.claimSetHash, v.claimSetHash, `${v.id} claimSetHash`);
  }
});

test("cacs vectors: V1 pin independently verified via raw sha256", () => {
  const v = VECTORS.vectors[0];
  const digest = createHash("sha256")
    .update(Buffer.concat([Buffer.from(VECTORS.domain, "ascii"), Buffer.from(v.canonicalInput, "utf8")]))
    .digest("hex");
  assert.equal(`0x${digest}`, v.claimSetHash);
});

test("resolve: fully-passing v2 attestation is DECLARED under the cap (never ATTESTED/VERIFIED)", async () => {
  const pin = await computePin({ values: FULL_VALUES });
  const att = await signV2({ claimSetHash: pin.claimSetHash });
  const r = await resolve({ declared: { identity: FULL_VALUES }, attestations: [att] });

  assert.equal(IDENTITY_CAP.active, true);
  for (const field of IDENTITY_FIELDS) {
    assert.equal(r.claims[field].state, "DECLARED");
    assert.equal(r.claims[field].label, "ATTESTED_BLOCKED_BY_CAP");
  }
  assert.equal(r.overall.state, "DECLARED");
  const states = [
    ...Object.values(r.claims).map((c) => c.state),
    r.overall.state,
  ];
  assert.ok(!states.includes("ATTESTED"), "cap must block ATTESTED");
  assert.ok(!states.includes("VERIFIED"), "cap must block VERIFIED");
});

test("resolve: with the cap inactive a fully-passing v2 attestation reaches ATTESTED", async () => {
  const pin = await computePin({ values: FULL_VALUES });
  const att = await signV2({ claimSetHash: pin.claimSetHash });
  const r = await resolve({
    declared: { identity: FULL_VALUES },
    attestations: [att],
    cap: { active: false, rule: "NONE", reason: "future path" },
  });
  for (const field of IDENTITY_FIELDS) {
    assert.equal(r.claims[field].state, "ATTESTED");
  }
  assert.equal(r.overall.state, "ATTESTED");
});

test("resolve: v1 attestation (no claimSetHash) cannot bind identity claims (stays DECLARED)", async () => {
  const att = await signV1();
  const r = await resolve({ declared: { identity: FULL_VALUES }, attestations: [att] });
  for (const field of IDENTITY_FIELDS) {
    assert.equal(r.claims[field].state, "DECLARED");
    assert.equal(r.claims[field].label, "NO_CLAIM_SET");
  }
});

test("resolve: AGENT_PROFILE credential covers identity fields", async () => {
  const values = { modelVersion: "2.1.0" };
  const pin = await computePin({ credentialType: "AGENT_PROFILE", values });
  const att = await signV2({ credentialType: "AGENT_PROFILE", claimSetHash: pin.claimSetHash });
  const r = await resolve({ declared: { identity: values }, attestations: [att] });
  assert.equal(r.claims.modelVersion.state, "DECLARED");
  assert.equal(r.claims.modelVersion.label, "ATTESTED_BLOCKED_BY_CAP");
  assert.equal(r.claims.manufacturer.state, "UNKNOWN");
});

test("resolve: explicit-null field covered by a matching claim set is NOT_PROVEN (nullValue FORBIDDEN)", async () => {
  const values = { manufacturer: "example-labs", model: null };
  const pin = await computePin({ values });
  const att = await signV2({ claimSetHash: pin.claimSetHash });
  const r = await resolve({ declared: { identity: values }, attestations: [att] });
  assert.equal(r.claims.manufacturer.state, "DECLARED");
  assert.equal(r.claims.manufacturer.label, "ATTESTED_BLOCKED_BY_CAP");
  assert.equal(r.claims.model.state, "NOT_PROVEN");
  assert.equal(r.claims.model.label, "NULL_CLAIM_FORBIDDEN");
});

test("resolve: scope matrix", async () => {
  const pin = await computePin({ values: FULL_VALUES });

  const covering = await signV2({ claimSetHash: pin.claimSetHash });
  const r1 = await resolve({ declared: { identity: FULL_VALUES }, attestations: [covering] });
  assert.equal(r1.claims.manufacturer.label, "ATTESTED_BLOCKED_BY_CAP");

  const wrongTx = await signV2({ scope: { chainId: CHAIN_ID, txHash: makeTxHash(0xcc) }, claimSetHash: pin.claimSetHash });
  const r2 = await resolve({ declared: { identity: FULL_VALUES }, attestations: [wrongTx] });
  assert.equal(r2.claims.manufacturer.state, "NOT_PROVEN");
  assert.equal(r2.claims.manufacturer.label, "SCOPE_MISMATCH");

  const wrongChain = await signV2({ scope: { chainId: "1114", txHash: EXECUTION_REF.txHash }, claimSetHash: pin.claimSetHash });
  const r3 = await resolve({ declared: { identity: FULL_VALUES }, attestations: [wrongChain] });
  assert.equal(r3.claims.manufacturer.label, "SCOPE_MISMATCH");

  const nullScopeStamp = await signV2({ scope: null, claimSetHash: pin.claimSetHash });
  const r4 = await resolve({ declared: { identity: FULL_VALUES }, attestations: [nullScopeStamp] });
  assert.equal(r4.claims.manufacturer.label, "SCOPE_MISMATCH");
});

test("resolve: REGISTRATION attestation (scope null, executionRef null) passes and matches its pin", async () => {
  const values = FULL_VALUES;
  const pin = await computePin({ values, executionRef: null });
  const att = await signV2({ scope: null, claimSetHash: pin.claimSetHash });
  const r = await resolve({
    declared: { identity: values },
    attestations: [att],
    context: makeContext({ executionRef: null }),
  });
  assert.equal(r.claims.manufacturer.label, "ATTESTED_BLOCKED_BY_CAP");
  assert.equal(r.overall.state, "DECLARED");
});

test("resolve: REGISTRATION attestation with an executionRef present is NOT_PROVEN", async () => {
  const values = FULL_VALUES;
  const pin = await computePin({ values, executionRef: null });
  const att = await signV2({ scope: null, claimSetHash: pin.claimSetHash });
  const r = await resolve({ declared: { identity: values }, attestations: [att] });
  assert.equal(r.claims.manufacturer.state, "NOT_PROVEN");
  assert.equal(r.claims.manufacturer.label, "SCOPE_MISMATCH");
});

test("resolve: time window", async () => {
  const pin = await computePin({ values: FULL_VALUES });

  const att1 = await signV2({ issuedAt: "2000", claimSetHash: pin.claimSetHash });
  const r1 = await resolve({ declared: { identity: FULL_VALUES }, attestations: [att1] });
  assert.equal(r1.claims.manufacturer.state, "NOT_PROVEN");
  assert.equal(r1.claims.manufacturer.label, "PRE_ISSUED");

  const att2 = await signV2({ expiresAt: "500", claimSetHash: pin.claimSetHash });
  const r2 = await resolve({ declared: { identity: FULL_VALUES }, attestations: [att2] });
  assert.equal(r2.claims.manufacturer.label, "WINDOW_EXPIRED");
});

test("resolve: revocation blocks lift", async () => {
  const pin = await computePin({ values: FULL_VALUES });

  const revokedEnvelope = await signV2({ revokedAt: "2000", claimSetHash: pin.claimSetHash });
  const r1 = await resolve({ declared: { identity: FULL_VALUES }, attestations: [revokedEnvelope] });
  assert.equal(r1.claims.manufacturer.state, "NOT_PROVEN");
  assert.equal(r1.claims.manufacturer.label, "REVOCATION_UNESTABLISHED");

  const proven = await signV2({ revokedAt: "2000", claimSetHash: pin.claimSetHash });
  proven.id = `${pin.claimSetHash}`;
  const r2 = await resolve({
    declared: { identity: FULL_VALUES },
    attestations: [proven],
    context: makeContext({
      revocationEvidence: {
        revocationProof: { attestationHash: proven.id, atBlock: "1999" },
      },
    }),
  });
  assert.equal(r2.claims.manufacturer.label, "REVOKED_AT_BLOCK");
});

test("resolve: attestation subject must match the manifest identity root", async () => {
  const values = { manufacturer: "example-labs" };
  const pin = await computePin({ subject: makeAddress(0x99), values });
  const att = await signV2({ subject: makeAddress(0x99), claimSetHash: pin.claimSetHash });
  const r = await resolve({ declared: { identity: values }, attestations: [att] });
  assert.equal(r.claims.manufacturer.state, "NOT_PROVEN");
  assert.equal(r.claims.manufacturer.label, "SUBJECT_MISMATCH");
});

test("resolve: no EVM adapter is fail-closed (never fabricated)", async () => {
  const pin = await computePin({ values: FULL_VALUES });
  const att = await signV2({ claimSetHash: pin.claimSetHash });
  const r = await resolve({
    declared: { identity: FULL_VALUES },
    attestations: [att],
    context: makeContext({ evm: null }),
  });
  assert.equal(r.claims.manufacturer.state, "NOT_PROVEN");
  assert.equal(r.claims.manufacturer.label, "EVM_ADAPTER_UNAVAILABLE");
});

test("resolve: input errors surface per-field and in overall.error", async () => {
  const r = await resolve({ declared: { identity: { manufacturer: "example-labs", model: 42 } } });
  assert.equal(r.claims.manufacturer.state, "DECLARED");
  assert.equal(r.claims.model.state, null);
  assert.equal(r.claims.model.error, "MALFORMED_INPUT");
  assert.equal(r.overall.error.length, 1);
  assert.ok(r.overall.reasons.includes("MALFORMED_INPUT"));
  assert.equal(r.overall.state, "DECLARED");
});

test("resolve: any failing covering attestation fails the claim (fail-closed)", async () => {
  const pin = await computePin({ values: FULL_VALUES });
  const good = await signV2({ claimSetHash: pin.claimSetHash });
  const bad = await signV2({ scope: { chainId: "1114", txHash: EXECUTION_REF.txHash }, claimSetHash: pin.claimSetHash });
  const r = await resolve({ declared: { identity: FULL_VALUES }, attestations: [good, bad] });
  assert.equal(r.claims.manufacturer.state, "NOT_PROVEN");
  assert.equal(r.claims.manufacturer.label, "SCOPE_MISMATCH");
});

test("resolve: broken base makes non-null claims NOT_PROVEN even self-declared", async () => {
  const r = await resolve({
    declared: { identity: FULL_VALUES },
    base: { manifestSignature: "OK", declarerBinding: "NOT_PROVEN" },
  });
  for (const field of IDENTITY_FIELDS) {
    assert.equal(r.claims[field].state, "NOT_PROVEN");
    assert.equal(r.claims[field].label, "BASE_NOT_PROVEN");
  }
});

test("resolve: contradiction marks the field UNKNOWN and the manifest INVALID", async () => {
  const r = await resolve({
    declared: { identity: FULL_VALUES },
    suspicion: { contradiction: true, fields: ["model"] },
  });
  assert.equal(r.claims.model.state, "UNKNOWN");
  assert.equal(r.claims.model.label, "CONTRADICTION");
  assert.equal(r.claims.manufacturer.state, "DECLARED");
  assert.equal(r.manifest, "INVALID");
  assert.deepEqual(r.overall.contradiction, ["model"]);
});