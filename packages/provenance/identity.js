import {
  computeClaimSetHash,
  buildIdentityClaimSetContext,
} from "./canonical.js";
import {
  classifyAttestationVersion,
  verifyAttestationVersioned,
  scopeCovers,
  isTrustedAttestor,
  revocationStatus,
} from "./attestation.js";

export const IDENTITY_FIELDS = Object.freeze(["manufacturer", "model", "modelVersion"]);

export const IDENTITY_PATHS = Object.freeze(
  IDENTITY_FIELDS.map((field) => `identity.${field}`),
);

export const IDENTITY_LIMITS = Object.freeze({
  manufacturer: 64,
  model: 64,
  modelVersion: 32,
});

export const IDENTITY_CHARSET = /^[a-z0-9._-]+$/;

export const IDENTITY_NULL_CLAIM = Object.freeze({
  PERMITTED: "PERMITTED",
  FORBIDDEN: "FORBIDDEN",
});

export const IDENTITY_DEFAULT_NULL_CLAIM = IDENTITY_NULL_CLAIM.FORBIDDEN;

export const IDENTITY_RULES = Object.freeze({
  AGENT_IDENTITY: Object.freeze({
    fields: IDENTITY_FIELDS,
    nullValue: IDENTITY_NULL_CLAIM.FORBIDDEN,
  }),
  AGENT_PROFILE: Object.freeze({
    fields: IDENTITY_FIELDS,
    nullValue: IDENTITY_NULL_CLAIM.FORBIDDEN,
  }),
});

export const IDENTITY_CAP = Object.freeze({
  active: true,
  rule: "ID-CAP-OI002-1",
  reason: "Phase B cap (SRR-1 R2): no identity claim may resolve to ATTESTED or VERIFIED until the attested claim set composition is fully ratified; a fully-passing v2 attestation remains DECLARED under this cap.",
});

const STATE_LADDER = Object.freeze(["VERIFIED", "ATTESTED", "DECLARED", "INFERRED", "NOT_PROVEN"]);

function stateRank(state) {
  const index = STATE_LADDER.indexOf(state);
  return index === -1 ? STATE_LADDER.length : index;
}

export function validateIdentity(declared) {
  const root =
    declared && typeof declared === "object" ? declared.identity : undefined;
  const errors = [];
  const values = {};

  if (root === undefined || root === null) {
    return { presence: "ABSENT", values, errors, malformed: false };
  }

  if (typeof root !== "object" || Array.isArray(root)) {
    return {
      presence: "PRESENT",
      values,
      malformed: true,
      errors: [
        {
          path: "declared.identity",
          code: "MALFORMED_INPUT",
          reason: "declared.identity must be a plain object or null",
        },
      ],
    };
  }

  const keys = Object.keys(root);
  if (keys.length === 0) {
    return { presence: "EMPTY", values, errors, malformed: false };
  }

  for (const key of keys) {
    const path = `declared.identity.${key}`;
    if (!IDENTITY_FIELDS.includes(key)) {
      errors.push({
        path,
        code: "MALFORMED_INPUT",
        reason: `unknown identity field "${key}" (allowed: ${IDENTITY_FIELDS.join(", ")})`,
      });
      continue;
    }
    const value = root[key];
    if (value === null) {
      values[key] = null;
      continue;
    }
    if (typeof value !== "string") {
      errors.push({
        path,
        code: "MALFORMED_INPUT",
        reason: `${path} must be a string`,
      });
      continue;
    }
    if (value.length === 0) {
      errors.push({
        path,
        code: "MALFORMED_INPUT",
        reason: `${path} must not be empty`,
      });
      continue;
    }
    if (value.length > IDENTITY_LIMITS[key]) {
      errors.push({
        path,
        code: "MALFORMED_INPUT",
        reason: `${path} exceeds ${IDENTITY_LIMITS[key]} characters`,
      });
      continue;
    }
    if (!IDENTITY_CHARSET.test(value)) {
      errors.push({
        path,
        code: "MALFORMED_INPUT",
        reason: `${path} must match ${IDENTITY_CHARSET}`,
      });
      continue;
    }
    values[key] = value;
  }

  return { presence: "PRESENT", values, errors, malformed: false };
}

export function detectIdentityContradiction(manifests, executionRef) {
  if (!Array.isArray(manifests) || manifests.length < 2) {
    return { contradiction: false, fields: [] };
  }

  const sameExecution = [];
  for (const manifest of manifests) {
    const ref = manifest && manifest.executionRef;
    if (!ref || typeof ref !== "object") continue;
    if (
      executionRef &&
      String(ref.chainId) === String(executionRef.chainId) &&
      String(ref.txHash).toLowerCase() === String(executionRef.txHash).toLowerCase() &&
      String(ref.blockNumber) === String(executionRef.blockNumber)
    ) {
      sameExecution.push(manifest);
    }
  }
  if (sameExecution.length < 2) {
    return { contradiction: false, fields: [] };
  }

  const fields = [];
  for (const field of IDENTITY_FIELDS) {
    const declared = [];
    for (const manifest of sameExecution) {
      const id =
        manifest.declared && typeof manifest.declared === "object"
          ? manifest.declared.identity
          : undefined;
      if (id && typeof id === "object" && Object.prototype.hasOwnProperty.call(id, field)) {
        declared.push(id[field]);
      }
    }
    for (let i = 0; i < declared.length; i += 1) {
      for (let j = i + 1; j < declared.length; j += 1) {
        const a = declared[i];
        const b = declared[j];
        if (a === b) continue;
        if (a === null && b === null) continue;
        fields.push(field);
      }
    }
  }

  return { contradiction: fields.length > 0, fields: Array.from(new Set(fields)) };
}

function claimSetClaimsFor(rule, values) {
  const claims = {};
  const nullForbiddenFields = [];
  for (const field of rule.fields) {
    if (!Object.prototype.hasOwnProperty.call(values, field)) continue;
    const value = values[field];
    if (value === null) {
      if (rule.nullValue === IDENTITY_NULL_CLAIM.PERMITTED) {
        claims[`identity.${field}`] = null;
      } else {
        nullForbiddenFields.push(field);
      }
      continue;
    }
    claims[`identity.${field}`] = value;
  }
  return { claims, nullForbiddenFields };
}

async function attestationOutcome(attestation, { values, context, cap }) {
  if (!attestation || typeof attestation !== "object") {
    return { verdict: "NOT_PROVEN", label: "SIGNATURE_INVALID", reason: "attestation missing", nullForbiddenFields: [] };
  }

  const rule = IDENTITY_RULES[attestation.credentialType];
  if (!rule) {
    return { verdict: "DECLARED", label: "CREDENTIAL_TYPE_UNRECOGNIZED", reason: `credentialType "${attestation.credentialType}" does not cover identity claims`, nullForbiddenFields: [] };
  }

  if (
    context.identityRoot &&
    String(attestation.subject || "").toLowerCase() !== String(context.identityRoot).toLowerCase()
  ) {
    return { verdict: "NOT_PROVEN", label: "SUBJECT_MISMATCH", reason: "attestation subject does not match this manifest's identity root", nullForbiddenFields: [] };
  }

  const version = classifyAttestationVersion(attestation);
  if (version.version === "INVALID") {
    return { verdict: "INPUT_ERROR", label: "MALFORMED_INPUT", reason: version.error.reason, nullForbiddenFields: [] };
  }

  const scope = scopeCovers(attestation.scope, context.executionRef, context.chainId);
  if (scope.result === "NOT_COVERS" || scope.result === "UNEVALUABLE") {
    return { verdict: "NOT_PROVEN", label: "SCOPE_MISMATCH", reason: scope.reason || "attestation scope does not cover this execution", nullForbiddenFields: [] };
  }
  if (scope.result === "NOT_APPLICABLE" && context.executionRef) {
    return { verdict: "NOT_PROVEN", label: "SCOPE_MISMATCH", reason: "REGISTRATION attestation requires a null scope with no executionRef", nullForbiddenFields: [] };
  }

  const sig = await verifyAttestationVersioned(attestation, context.evm);
  if (sig.status === "NOT_RUN") {
    return { verdict: "NOT_PROVEN", label: "EVM_ADAPTER_UNAVAILABLE", reason: sig.reason, nullForbiddenFields: [] };
  }
  if (sig.status === "INPUT_ERROR") {
    return { verdict: "INPUT_ERROR", label: "MALFORMED_INPUT", reason: sig.reason, nullForbiddenFields: [] };
  }
  if (!sig.valid) {
    return { verdict: "NOT_PROVEN", label: "SIGNATURE_INVALID", reason: sig.reason || "attestation signature does not replay to declared issuer", nullForbiddenFields: [] };
  }

  const chainId = String(context.chainId);
  if (!isTrustedAttestor(context.confidence, attestation.issuer, attestation.credentialType, chainId)) {
    return { verdict: "DECLARED", label: "ISSUER_UNRECOGNIZED", reason: `issuer ${attestation.issuer} / ${attestation.credentialType} not in trusted set`, nullForbiddenFields: [] };
  }

  const now = context.currentBlock;
  if (now !== null && now !== undefined) {
    try {
      if (now < BigInt(String(attestation.issuedAt ?? "0"))) {
        return { verdict: "NOT_PROVEN", label: "PRE_ISSUED", reason: `currentBlock ${now} < issuedAt ${attestation.issuedAt}`, nullForbiddenFields: [] };
      }
      if (now > BigInt(String(attestation.expiresAt ?? "0"))) {
        return { verdict: "NOT_PROVEN", label: "WINDOW_EXPIRED", reason: `currentBlock ${now} > expiresAt ${attestation.expiresAt}`, nullForbiddenFields: [] };
      }
    } catch {
      return { verdict: "NOT_PROVEN", label: "WINDOW_UNEVALUABLE", reason: "issuedAt/expiresAt are not valid uint strings", nullForbiddenFields: [] };
    }
  }

  const rev = revocationStatus(attestation, context.revocationEvidence || {});
  if (rev.revoked) {
    return {
      verdict: "NOT_PROVEN",
      label: rev.provenance === "PROVEN" ? "REVOKED_AT_BLOCK" : "REVOCATION_UNESTABLISHED",
      reason: rev.reason,
      nullForbiddenFields: [],
    };
  }

  if (version.version === "v1") {
    return { verdict: "DECLARED", label: "NO_CLAIM_SET", reason: "v1 attestation carries no claimSetHash; identity claims cannot be bound", nullForbiddenFields: [] };
  }

  const { claims, nullForbiddenFields } = claimSetClaimsFor(rule, values);
  const nullForbidden = nullForbiddenFields.filter((field) => rule.fields.includes(field));
  if (nullForbidden.length > 0 && Object.keys(claims).length === 0) {
    return { verdict: "NOT_PROVEN", label: "NULL_CLAIM_FORBIDDEN", reason: "explicit-null identity claims are FORBIDDEN for this credentialType", nullForbiddenFields: nullForbidden };
  }

  const cacs = await computeClaimSetHash({
    credentialType: attestation.credentialType,
    issuer: attestation.issuer,
    subject: attestation.subject,
    claims,
    context: buildIdentityClaimSetContext({
      chainId: context.chainId,
      executionRef: context.executionRef,
      manifestId: context.manifestId,
    }),
  });

  if (String(cacs.claimSetHash).toLowerCase() !== String(attestation.claimSetHash).toLowerCase()) {
    return { verdict: "NOT_PROVEN", label: "CLAIM_SET_HASH_MISMATCH", reason: "recomputed claimSetHash does not match the signed claim set", nullForbiddenFields: [] };
  }

  if (cap && cap.active) {
    return { verdict: "DECLARED", label: "ATTESTED_BLOCKED_BY_CAP", reason: `${cap.rule}: ${cap.reason}`, nullForbiddenFields: nullForbidden };
  }
  return { verdict: "ATTESTED", label: "ATTESTED", reason: "trusted issuer vouched the attested claim set", nullForbiddenFields: nullForbidden };
}

function applyOutcomesToField(outcomes, field, value) {
  const nullForbidden = outcomes.some(
    (outcome) => Array.isArray(outcome.nullForbiddenFields) && outcome.nullForbiddenFields.includes(field),
  );
  if (nullForbidden) {
    return { state: "NOT_PROVEN", label: "NULL_CLAIM_FORBIDDEN", reason: "explicit-null identity claim is FORBIDDEN for the attested credentialType" };
  }

  const inputErrors = outcomes.filter((outcome) => outcome.verdict === "INPUT_ERROR");
  if (inputErrors.length > 0) {
    return { state: null, error: "MALFORMED_INPUT", reason: inputErrors.map((o) => o.reason).join("; ") };
  }

  const failed = outcomes.filter((outcome) => outcome.verdict === "NOT_PROVEN");
  if (failed.length > 0) {
    return { state: "NOT_PROVEN", label: failed[0].label, reason: failed.map((o) => o.reason).join("; ") };
  }

  const capped = outcomes.filter((outcome) => outcome.label === "ATTESTED_BLOCKED_BY_CAP");
  if (capped.length > 0) {
    if (value === null) {
      return { state: "UNKNOWN", label: "NULL_MATCH", reason: "explicit-null claim matched the attested claim set" };
    }
    return { state: "DECLARED", label: "ATTESTED_BLOCKED_BY_CAP", reason: capped[0].reason };
  }

  const attested = outcomes.filter((outcome) => outcome.verdict === "ATTESTED");
  if (attested.length > 0) {
    return { state: "ATTESTED", label: "ATTESTED", reason: attested[0].reason };
  }

  if (value === null) {
    return { state: "UNKNOWN", label: "NULL_DECLARED", reason: "explicit-null identity claim asserts no value" };
  }
  return { state: "DECLARED", label: outcomes[0].label, reason: outcomes[0].reason };
}

export async function resolveIdentityClaims({
  validation,
  base,
  attestations,
  context = {},
  suspicion = { contradiction: false, fields: [] },
  cap = IDENTITY_CAP,
}) {
  const values =
    context.identityValues !== undefined ? context.identityValues : validation.values || {};
  const claims = {};
  const reasons = [];
  const inputErrors = [];
  const contradictionFields = [];
  const manifestInvalid = Boolean(suspicion && suspicion.contradiction);

  if (validation.malformed) {
    for (const err of validation.errors) {
      inputErrors.push(err);
      reasons.push({ code: err.code, reason: err.reason });
    }
    for (const field of IDENTITY_FIELDS) {
      claims[field] = { state: null, error: "MALFORMED_INPUT", reason: "declared.identity is malformed" };
    }
  } else {
    for (const err of validation.errors) {
      inputErrors.push(err);
      reasons.push({ code: err.code, reason: err.reason });
      const prefix = "declared.identity.";
      if (err.path && err.path.startsWith(prefix)) {
        const field = err.path.slice(prefix.length);
        if (IDENTITY_FIELDS.includes(field)) {
          claims[field] = { state: null, error: err.code, reason: err.reason };
        }
      }
    }
  }

  const baseOk = Boolean(
    base &&
    base.manifestSignature === "OK" &&
    base.declarerBinding === "OK",
  );

  const coveredAttestations = new Map();
  for (const attestation of Array.isArray(attestations) ? attestations : []) {
    const rule = attestation && IDENTITY_RULES[attestation.credentialType];
    if (!rule) continue;
    for (const field of rule.fields) {
      const list = coveredAttestations.get(field) || [];
      list.push({ attestation, rule });
      coveredAttestations.set(field, list);
    }
  }

  const suspicionFields =
    suspicion && Array.isArray(suspicion.fields) ? suspicion.fields : [];

  for (const field of IDENTITY_FIELDS) {
    if (claims[field]) continue;

    const fieldContradiction =
      suspicion &&
      suspicion.contradiction &&
      (suspicionFields.length === 0 || suspicionFields.includes(field));

    if (fieldContradiction) {
      contradictionFields.push(field);
      claims[field] = {
        state: "UNKNOWN",
        label: "CONTRADICTION",
        reason: "conflicting identity declarations across manifests for the same executionRef",
      };
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(values, field)) {
      claims[field] = { state: "UNKNOWN", label: "NOT_DECLARED", reason: "identity field not declared" };
      continue;
    }

    const value = values[field];

    if (value !== null && !baseOk) {
      claims[field] = {
        state: "NOT_PROVEN",
        label: "BASE_NOT_PROVEN",
        reason: `base authenticity not proven (manifestSignature=${base && base.manifestSignature}, declarerBinding=${base && base.declarerBinding})`,
      };
      continue;
    }

    const cover = coveredAttestations.get(field) || [];
    if (cover.length === 0) {
      if (value === null) {
        claims[field] = { state: "UNKNOWN", label: "NULL_DECLARED", reason: "explicit-null identity claim asserts no value" };
      } else {
        claims[field] = { state: "DECLARED", label: "DECLARED_SELF_CLAIM", reason: "authentic self-claim; no covering attestation asserted" };
      }
      continue;
    }

    const outcomes = [];
    for (const entry of cover) {
      const outcome = await attestationOutcome(entry.attestation, { values, context, cap });
      if (outcome.verdict === "INPUT_ERROR") {
        const wrapped = {
          path: `declared.identity.${field}`,
          code: outcome.label,
          reason: outcome.reason,
        };
        inputErrors.push(wrapped);
        reasons.push({ code: outcome.label, reason: outcome.reason });
      }
      outcomes.push(outcome);
    }
    claims[field] = applyOutcomesToField(outcomes, field, value);
  }

  const claimStates = Object.values(claims)
    .filter((entry) => entry.state && entry.state !== "UNKNOWN")
    .map((entry) => entry.state);

  const overall = { state: claimStates.length > 0 ? STATE_LADDER[Math.min(...claimStates.map(stateRank))] : "UNKNOWN" };
  if (manifestInvalid) overall.contradiction = contradictionFields;
  if (inputErrors.length > 0) overall.error = inputErrors.map((err) => err.reason);
  overall.reasons = reasons.map((r) => r.code);

  return {
    claims,
    manifest: manifestInvalid ? "INVALID" : "VALID",
    overall,
    reasons: reasons.map((r) => r.code),
  };
}