/**
 * CoreGuard AgentProof — Attestation Recognition (CGEP/1:AGENT-PROVENANCE
 * §5 ATTESTATION, §7 ATTESTATION_SIGNATURES / ATTESTATION_RECOGNITION)
 *
 * Attestation envelope (per §5):
 *   { issuer, credentialType, proofRef, scope{chainId,txHash},
 *     issuedAt, expiresAt, revokedAt, signature{...} }
 *
 * Two independent axes are evaluated separately:
 *   ATTESTATION_SIGNATURES   — cryptographic replay: recovered signer MUST be
 *                              the declared issuer (valid/not proof of truth).
 *   ATTESTATION_RECOGNITION  — policy: a trusted issuer+credentialType+scope
 *                              vouching the content resolves the verdict to
 *                              ATTESTED (not VERIFIED — recognition is not
 *                              proof of the world, per §7 DEFINITIONS).
 *
 * Revocation (§5b): the verifier only ever reports revocation that is
 * AUTHORITATIVE. An in-envelope `revokedAt` alone is a DECLARED fact at most;
 * PROVEN revocation requires corroborating evidence (on-chain/registry/
 * verifiable revoke signature). v0.1 never claims PROVEN revocation.
 *
 * EVM CRYPTO BOUNDARY: EIP-712 digest + signer recovery are provided by the
 * injected `evm` adapter (@coreguard/evm). When the adapter is absent the
 * verifier reports NOT_RUN — it never fabricates a replay result.
 */

import { loadEvmAdapter } from "./evm-adapter.js";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const TXHASH_RE = /^0x[0-9a-fA-F]{64}$/;

export const VERDICT_NOT_PROVEN = "NOT_PROVEN";   // XP.FAIL (flows revert-safe)
export const VERDICT_ATTESTED = "ATTESTED";       // XP (flows allow)
export const VERDICT_VERIFIED = "VERIFIED";       // XP++ (bilinear, on-chain)
export const VERDICT_UNRECOGNIZED = "UNRECOGNIZED";
export const VERDICT_DECLARED = "DECLARED";       // storage-internal label

export const VERDICT_NOT_RUN = "NOT_RUN";         // EVM adapter unavailable

export const RECOGNITION_LEVELS = Object.freeze([
  VERDICT_NOT_PROVEN,
  VERDICT_DECLARED,
  VERDICT_ATTESTED,
  VERDICT_VERIFIED,
]);

/**
 * Attestation typed-data root (EIP-712, domain = AgentProof domain).
 * Content: keccak256 of the canonical CATEGORY string.
 */
export const ATTESTATION_PRIMARY_TYPE = "Attestation";
export const ATTESTATION_TYPES = Object.freeze([
  { name: "issuer", type: "address" },
  { name: "subject", type: "address" },
  { name: "credentialType", type: "string" },
  { name: "scopeChainId", type: "uint256" },
  { name: "scopeTxHash", type: "bytes32" },
  { name: "issuedAt", type: "uint256" },
  { name: "expiresAt", type: "uint256" },
]);

/**
 * Resolve the EVM adapter for a caller. Explicitly-passed adapter wins as-is
 * (null intentionally means "not available" → NOT_RUN). Only `undefined`
 * triggers the memoized gate auto-load, preserving the lazy optional adapter.
 */
export async function getEvmFor(evm) {
  if (evm !== undefined) return evm;
  return loadEvmAdapter();
}

/** The bytes32 the signer commits to inside the attestation envelope. */
export async function attestationContentDigest(attestation, evm = undefined) {
  const adapter = await getEvmFor(evm);
  if (!adapter || typeof adapter.typedDataDigest !== "function") {
    throw new Error("@coreguard/evm adapter unavailable — cannot compute attestation digest");
  }
  const scope = attestation.scope || {};
  const data = {
    issuer: attestation.issuer,
    subject: attestation.subject,
    credentialType: attestation.credentialType,
    scopeChainId: BigInt(scope.chainId ?? "0"),
    scopeTxHash: scope.txHash ?? `0x${"0".repeat(64)}`,
    issuedAt: BigInt(attestation.issuedAt ?? "0"),
    expiresAt: BigInt(attestation.expiresAt ?? "0"),
  };
  return adapter.typedDataDigest(
    ATTESTATION_PRIMARY_TYPE,
    { Attestation: ATTESTATION_TYPES },
    data,
    String(scope.chainId ?? "0"),
  );
}

/**
 * ATTESTATION_SIGNATURES: replay the envelope against the EIP-712 root.
 * @returns {{ valid: boolean, status: string, signer: string|null, reason?: string }}
 *   status: "OK" | "NOT_PROVEN" | "NOT_RUN" (NOT_RUN only when the EVM
 *   adapter is unavailable — the check was not evaluable, not a failure).
 */
export async function verifyAttestationSignature(attestation, evm = undefined) {
  if (!attestation || typeof attestation !== "object") {
    return { valid: false, status: "NOT_PROVEN", signer: null, reason: "attestation missing" };
  }
  const sig = attestation.signature;
  if (!sig || typeof sig !== "object") {
    return { valid: false, status: "NOT_PROVEN", signer: null, reason: "attestation.signature missing" };
  }
  if (!ADDRESS_RE.test(attestation.issuer || "")) {
    return { valid: false, status: "NOT_PROVEN", signer: null, reason: "attestation.issuer is not an address" };
  }
  if (typeof sig.r !== "string" || !/^[0-9a-fA-F]{64}$/.test(sig.r) ||
      typeof sig.s !== "string" || !/^[0-9a-fA-F]{64}$/.test(sig.s) ||
      (sig.v !== 27 && sig.v !== 28)) {
    return { valid: false, status: "NOT_PROVEN", signer: null, reason: "attestation.signature r/s/v malformed" };
  }

  const adapter = await getEvmFor(evm);
  if (!adapter || typeof adapter.recoverSignerAddress !== "function") {
    return {
      valid: false,
      status: "NOT_RUN",
      signer: null,
      reason: "EVM adapter not loaded — signature replay NOT_RUN (never fabricated)",
    };
  }

  let digest;
  try {
    digest = await attestationContentDigest(attestation, adapter);
  } catch (e) {
    return { valid: false, status: "NOT_PROVEN", signer: null, reason: `digest error: ${e.message}` };
  }

  let recovered;
  try {
    recovered = adapter.recoverSignerAddress(digest, { r: sig.r, s: sig.s, v: sig.v });
  } catch (e) {
    return { valid: false, status: "NOT_PROVEN", signer: null, reason: `recovery error: ${e.message}` };
  }

  if (recovered.toLowerCase() !== attestation.issuer.toLowerCase()) {
    return { valid: false, status: "NOT_PROVEN", signer: recovered, reason: "recovered signer != declared issuer" };
  }
  return { valid: true, status: "OK", signer: recovered };
}

/**
 * One entry in the verifier's trusted-issuer registry:
 *   { issuer, credentialType, chainId }  → recognition policy.
 */
export function isTrustedAttestor(confidence, issuer, credentialType, chainId) {
  const entries = (confidence && confidence.trustedAttestors) || [];
  const wantIt = String(chainId);
  return entries.some(
    (e) =>
      (e.issuer || "").toLowerCase() === String(issuer).toLowerCase() &&
      (e.credentialType === undefined || e.credentialType === credentialType) &&
      (e.chainId === undefined || String(e.chainId) === wantIt),
  );
}

/**
 * ATTESTATION_RECOGNITION: map a well-signed attestation to a verdict using
 * the verifier's trust policy.
 *
 * @param {object}  attestation   verified-already envelope
 * @param {object}  confidence    { trustedAttestors: [{issuer, credentialType?, chainId?}] }
 * @param {object}  [evm]         injected @coreguard/evm adapter (null → NOT_RUN)
 * @returns {{ verdict: string, label: string, reason: string }}
 */
export async function recognizeAttestation(attestation, confidence = {}, evm = undefined) {
  const scope = attestation.scope || {};
  const chainId = String(scope.chainId ?? "");
  const sig = await verifyAttestationSignature(attestation, evm);
  if (sig.status === "NOT_RUN") {
    return {
      verdict: VERDICT_NOT_RUN,
      label: "EVM_ADAPTER_UNAVAILABLE",
      reason: "EVM adapter not loaded — attestation recognition NOT_RUN (never fabricated)",
    };
  }

  if (!sig.valid) {
    return {
      verdict: VERDICT_NOT_PROVEN,
      label: "NOSIG_INVALID",
      reason: "attestation signature does not replay to declared issuer",
    };
  }

  if (!isTrustedAttestor(confidence, attestation.issuer, attestation.credentialType, chainId)) {
    return {
      verdict: VERDICT_NOT_PROVEN,
      label: "UNRECOGNIZED",
      reason: `issuer ${attestation.issuer} / ${attestation.credentialType} not in trusted set`,
    };
  }

  const now = confidence.currentBlock ?? null;
  if (now !== null) {
    if (now < BigInt(String(attestation.issuedAt ?? "0"))) {
      return {
        verdict: VERDICT_NOT_PROVEN,
        label: "PRE_ISSUED",
        reason: `currentBlock ${now} < issuedAt ${attestation.issuedAt}`,
      };
    }
    if (now > BigInt(String(attestation.expiresAt ?? "0"))) {
      return {
        verdict: VERDICT_NOT_PROVEN,
        label: "EXPIRED",
        reason: `currentBlock ${now} > expiresAt ${attestation.expiresAt}`,
      };
    }
  }

  return { verdict: VERDICT_ATTESTED, label: "ATTESTED", reason: "trusted issuer vouches content" };
}

/**
 * §5b — Revocation report. NEVER claims PROVEN revocation without
 * authoritative evidence (on-chain/registry/verifiable revoke signature).
 * Without evidence the best-possible statement is DECLARED.
 */
export function revocationStatus(attestation, evidence = {}) {
  const declaredRevokedAt = attestation.revokedAt === null || attestation.revokedAt === undefined
    ? null
    : BigInt(String(attestation.revokedAt));

  if (evidence.revocationProof) {
    // Authoritative: registry / on-chain / verifiable revoke signature.
    // Recognize ONLY if it binds to this exact attestation identity.
    const binds = String(evidence.revocationProof.attestationHash || "").toLowerCase() ===
      String(attestation.id || "").toLowerCase();
    if (binds) {
      return {
        revoked: true,
        provenance: "PROVEN",
        atBlock: evidence.revocationProof.atBlock,
        reason: "authoritative revocation evidence present",
      };
    }
    return {
      revoked: false,
      provenance: undefined,
      reason: "revocation evidence does not bind to this attestation",
    };
  }

  if (declaredRevokedAt !== null) {
    return {
      revoked: declaredRevokedAt !== null,
      provenance: "DECLARED",
      atBlock: declaredRevokedAt,
      reason: "in-envelope revokedAt is a declaration; not authoritative without evidence",
    };
  }

  return { revoked: false, provenance: undefined, reason: "no revocation declared" };
}