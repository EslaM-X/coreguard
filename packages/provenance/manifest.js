/**
 * CoreGuard AgentProof — Manifest Schema Validation (CGEP/1:AGENT-PROVENANCE §5)
 *
 * Field rules enforced here:
 *   - `manifestKind` ∈ {REGISTRATION, STAMP} REQUIRED.
 *       REGISTRATION: executionRef MUST be null (binds to an agent identity).
 *       STAMP:        executionRef MUST be exactly one execution
 *                     (chainId + txHash + blockNumber) — missing or multiple → INVALID.
 *   - `version` MUST be "CGEP/1".
 *   - signerBinding present with a canonical address.
 *   - declared.executorType normalizes to the closed enum (see taxonomy.js).
 *
 * This module is VALIDATION ONLY — it never mutates input and never signs.
 */

import { MANIFEST_KINDS } from "./canonical.js";
import { normalizeExecutorType } from "./taxonomy.js";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const TXHASH_RE = /^0x[0-9a-fA-F]{64}$/;
const BLOCK_RE = /^[0-9]+$/;

export const REQUIRED_VERSION = "CGEP/1";

/**
 * Validate a manifest's structural schema. Returns a normalized report.
 * Fail-closed: returns { valid:false, errors:[...] } on ANY violation;
 * never throws for schema violations (throwing is reserved for programming
 * errors, e.g. non-object input).
 *
 * @param {object} manifest
 * @returns {{ valid: boolean, errors: string[], kind: string|null,
 *             executorType: string, chainId: string|null }}
 */
export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new TypeError("validateManifest: manifest must be an object");
  }

  const errors = [];

  if (manifest.version !== REQUIRED_VERSION) {
    errors.push(`version must be "${REQUIRED_VERSION}"`);
  }

  if (!MANIFEST_KINDS.includes(manifest.manifestKind)) {
    errors.push(`manifestKind must be one of ${MANIFEST_KINDS.join(", ")}`);
  }

  const executionRef = manifest.executionRef;

  if (manifest.manifestKind === "REGISTRATION") {
    if (executionRef !== null && executionRef !== undefined) {
      errors.push("REGISTRATION must have executionRef = null");
    }
  }

  if (manifest.manifestKind === "STAMP") {
    if (!executionRef || typeof executionRef !== "object") {
      errors.push("STAMP requires executionRef with chainId, txHash, blockNumber");
    } else {
      if (typeof executionRef.chainId !== "string" || !/^[0-9]+$/.test(executionRef.chainId)) {
        errors.push("STAMP executionRef.chainId must be a decimal string");
      }
      if (typeof executionRef.txHash !== "string" || !TXHASH_RE.test(executionRef.txHash)) {
        errors.push("STAMP executionRef.txHash must be a 0x 32-byte hex hash");
      }
      if (typeof executionRef.blockNumber !== "string" || !BLOCK_RE.test(executionRef.blockNumber)) {
        errors.push("STAMP executionRef.blockNumber must be a decimal string");
      }
    }
  }

  if (!manifest.declared || typeof manifest.declared !== "object") {
    errors.push("declared object is required");
  }

  const executorType = normalizeExecutorType(manifest.declared?.executorType);

  const signerBinding = manifest.declared?.signerBinding;
  if (!signerBinding || typeof signerBinding !== "object") {
    errors.push("declared.signerBinding is required");
  } else if (!ADDRESS_RE.test(signerBinding.address || "")) {
    errors.push("declared.signerBinding.address must be a 0x 20-byte address");
  }

  const signature = manifest.signature;
  if (!signature || typeof signature !== "object") {
    errors.push("signature envelope is required");
  } else {
    if (signature.scheme !== "EIP-712") {
      errors.push('signature.scheme must be "EIP-712"');
    }
    if (!ADDRESS_RE.test(signature.signer || "")) {
      errors.push("signature.signer must be a 0x 20-byte address");
    }
    if (typeof signature.r !== "string" || !/^[0-9a-fA-F]{64}$/.test(signature.r)) {
      errors.push("signature.r must be 32 bytes of hex");
    }
    if (typeof signature.s !== "string" || !/^[0-9a-fA-F]{64}$/.test(signature.s)) {
      errors.push("signature.s must be 32 bytes of hex");
    }
    if (/^[0]+$/.test(signature.r || "")) {
      errors.push("signature.r must be non-zero (recoverable)");
    }
    if (/^[0]+$/.test(signature.s || "")) {
      errors.push("signature.s must be non-zero (recoverable)");
    }
    if (signature.v !== 27 && signature.v !== 28) {
      errors.push("signature.v must be 27 or 28");
    }
    if (typeof signature.digest === "string" && !/^0x[0-9a-fA-F]{64}$/.test(signature.digest)) {
      errors.push("signature.digest, when present, must be a 0x 32-byte hex");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    kind: MANIFEST_KINDS.includes(manifest.manifestKind) ? manifest.manifestKind : null,
    executorType,
    chainId:
      manifest.manifestKind === "STAMP" && executionRef
        ? String(executionRef.chainId)
        : null,
  };
}