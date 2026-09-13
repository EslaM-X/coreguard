/**
 * CoreGuard AgentProof — Manifest Canonical Model (CGEP/1:AGENT-PROVENANCE §3/§4)
 *
 * The manifest's well-founded identity: NO circularity.
 *
 *   manifestCore  = manifest WITHOUT { manifestId, signature, commit }
 *   manifestId    = H("CGEP/1:AGENT-PROVENANCE" || canonicalize(manifestCore))
 *
 * `manifestId` never appears inside what it hashes, so the hash is well-founded.
 * Canonical encoding reuses the project's `@coreguard/canonical` exactly
 * (alphabetical field sort, decimal strings, lowercase 0x, explicit null,
 * required version field).
 */

import { canonicalize, domainHash } from "../canonical/index.js";

export const PROVENANCE_DOMAIN = "CGEP/1:AGENT-PROVENANCE";
export const DELEGATION_DOMAIN = "CGEP/1:DELEGATION";
export const ATTESTATION_DOMAIN = "CGEP/1:ATTESTATION";
export const VERIFY_PROVENANCE_DOMAIN = "CGEP/1:VERIFY-PROVENANCE";

export const MANIFEST_KINDS = ["REGISTRATION", "STAMP"];

/**
 * The signable root of a manifest: everything except the envelope fields
 * `manifestId`, `signature`, and `commit`. The signer commits to EXACTLY this.
 */
export function manifestCore(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new TypeError("manifest: expected an object");
  }
  const { manifestId: _mid, signature: _sig, commit: _commit, ...core } = manifest;
  return core;
}

/**
 * Compute the well-founded manifestId.
 *   manifestId = H("CGEP/1:AGENT-PROVENANCE" || canonicalize(manifestCore))
 * Deterministic; independent of any self-reference.
 */
export async function computeManifestId(manifest) {
  return domainHash(PROVENANCE_DOMAIN, manifestCore(manifest));
}

/**
 * Compute the delegation-link hash for a signed delegation message
 * (domain `CGEP/1:DELEGATION`).
 */
export async function delegationLinkHash(link) {
  const { signature: _sig, ...linkBody } = link;
  return domainHash(DELEGATION_DOMAIN, linkBody);
}

/**
 * Compute the attestation content hash (domain `CGEP/1:ATTESTATION`).
 */
export async function attestationContentHash(attestation) {
  const { signature: _sig, ...attestationBody } = attestation;
  return domainHash(ATTESTATION_DOMAIN, attestationBody);
}

export { canonicalize };