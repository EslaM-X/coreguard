/**
 * CoreGuard AgentProof — Delegation Validation (CGEP/1:AGENT-PROVENANCE
 * §7 DELEGATION_CHAIN, Q3)
 *
 * delegationChain is ordered authority→grantee. Each link is a separate
 * EIP-712 signed typed message whose root (first authority) must be the tx
 * signer (for STAMP) or the registered agent authority (for REGISTRATION).
 *
 * Delegation typed data (EIP-712 domain = the AgentProof domain, chainId of
 * the anchoring chain):
 *   Delegation(
 *     address authority,
 *     address grantedTo,
 *     uint256 scopeActionHash,   // keccak256 of action string ("SWAP", ...)
 *     uint256 maxValue,          // 0 = unlimited
 *     uint256 validAfter,
 *     uint256 expiresAt
 *   )
 *
 * Revocation semantics (§5b): an in-manifest `revokedAt` alone is a
 * declaration (at most DECLARED status); the verifier never claims PROVEN
 * revocation without authoritative evidence.
 */

import { typedDataDigest, recoverSignerAddress } from "./eip712.js";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export const DELEGATION_PRIMARY_TYPE = "Delegation";
export const DELEGATION_TYPES = Object.freeze([
  { name: "authority", type: "address" },
  { name: "grantedTo", type: "address" },
  { name: "scopeActionHash", type: "uint256" },
  { name: "maxValue", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "expiresAt", type: "uint256" },
]);

/** keccak256 of the delegation type name configured for the chainId's domain. */
export function delegationDigest(link, chainId) {
  const data = {
    authority: link.authority,
    grantedTo: link.grantedTo,
    scopeActionHash: BigInt(link.scopeActionHash),
    maxValue: BigInt(link.maxValue),
    validAfter: BigInt(link.validAfter),
    expiresAt: BigInt(link.expiresAt),
  };
  return typedDataDigest(DELEGATION_PRIMARY_TYPE, { Delegation: DELEGATION_TYPES }, data, chainId);
}

/**
 * Verify ONE delegation link's EIP-712 signature in isolation.
 * @returns {{ valid: boolean, signer: string|null, reason?: string }}
 */
export function verifyDelegationLinkSignature(link, chainId) {
  if (!link || typeof link !== "object") {
    return { valid: false, signer: null, reason: "link missing" };
  }
  if (!ADDRESS_RE.test(link.authority || "")) {
    return { valid: false, signer: null, reason: "link.authority is not an address" };
  }
  if (!ADDRESS_RE.test(link.grantedTo || "")) {
    return { valid: false, signer: null, reason: "link.grantedTo is not an address" };
  }
  const sig = link.signature;
  if (!sig || typeof sig !== "object") {
    return { valid: false, signer: null, reason: "link.signature missing" };
  }
  if (typeof sig.r !== "string" || !/^[0-9a-fA-F]{64}$/.test(sig.r) ||
      typeof sig.s !== "string" || !/^[0-9a-fA-F]{64}$/.test(sig.s) ||
      (sig.v !== 27 && sig.v !== 28)) {
    return { valid: false, signer: null, reason: "link.signature r/s/v malformed" };
  }

  let digest;
  try {
    digest = delegationDigest(link, chainId);
  } catch (e) {
    return { valid: false, signer: null, reason: `digest error: ${e.message}` };
  }

  let recovered;
  try {
    recovered = recoverSignerAddress(digest, { r: sig.r, s: sig.s, v: sig.v });
  } catch (e) {
    return { valid: false, signer: null, reason: `recovery error: ${e.message}` };
  }

  if (recovered.toLowerCase() !== link.authority.toLowerCase()) {
    return {
      valid: false,
      signer: recovered,
      reason: "recovered signer is not link.authority",
    };
  }
  return { valid: true, signer: recovered };
}

/**
 * Validate a full delegation chain (ordered authority→grantee) at a given
 * execution block. Returns the chain verdict:
 *   - valid:true when EVERY link replays AND the chain is continuous AND the
 *     root authority equals `rootAuthority` (tx signer for STAMP).
 *   - valid:false otherwise with a precise `reason`.
 *
 * Execution-time checks (DELEGATION_CHAIN) are enforced when `executionBlock`
 * is provided: each link's validAfter ≤ executionBlock ≤ expiresAt, and any
 * in-manifest revokedAt must BE AFTER the execution block or be null (per §5b
 * revocation is only declared at most — never PROVEN without evidence).
 *
 * @param {Array}  chain          ordered delegation links (authority→grantee)
 * @param {object} options
 * @param {string} options.chainId        anchoring chain
 * @param {string} options.rootAuthority  expected root (tx signer / agent)
 * @param {string} [options.executionBlock] decimal block number, if known
 * @returns {{ valid: boolean, reason?: string, links: Array }}
 */
export function verifyDelegationChain(chain, { chainId, rootAuthority, executionBlock } = {}) {
  if (!Array.isArray(chain) || chain.length === 0) {
    return { valid: false, reason: "empty delegation chain", links: [] };
  }

  const links = [];
  const root = String(rootAuthority || "").toLowerCase();
  const block = executionBlock === undefined || executionBlock === null ? null : BigInt(String(executionBlock));

  for (let i = 0; i < chain.length; i += 1) {
    const link = chain[i];
    const entry = { index: i, link, valid: false, reason: "unverified" };

    const sigResult = verifyDelegationLinkSignature(link, chainId);
    if (!sigResult.valid) {
      entry.reason = `link ${i} signature: ${sigResult.reason}`;
      links.push(entry);
      return { valid: false, reason: entry.reason, links };
    }
    entry.valid = true;

    if (i > 0) {
      const prev = chain[i - 1];
      if ((prev.grantedTo || "").toLowerCase() !== (link.authority || "").toLowerCase()) {
        entry.valid = false;
        entry.reason = `link ${i} authority does not continue chain (prev grantedTo != this authority)`;
        links.push(entry);
        return { valid: false, reason: entry.reason, links };
      }
    }

    if (block !== null) {
      const validAfter = BigInt(String(link.validAfter ?? "0"));
      const expiresAt = BigInt(String(link.expiresAt ?? "0"));
      if (block < validAfter) {
        entry.valid = false;
        entry.reason = `link ${i}: executionBlock ${block} < validAfter ${validAfter}`;
        links.push(entry);
        return { valid: false, reason: entry.reason, links };
      }
      if (expiresAt > 0n && block > expiresAt) {
        entry.valid = false;
        entry.reason = `link ${i}: executionBlock ${block} > expiresAt ${expiresAt}`;
        links.push(entry);
        return { valid: false, reason: entry.reason, links };
      }
      // §5b: revocation is a DECLARED fact at most. An in-manifest revokedAt
      // that is ≤ executionBlock makes this link unusable at that block.
      if (link.revokedAt != null && link.revokedAt !== undefined) {
        const revokedAt = BigInt(String(link.revokedAt));
        if (revokedAt <= block) {
          entry.valid = false;
          entry.reason = `link ${i}: revokedAt ${revokedAt} <= executionBlock ${block} (in-manifest declaration)`;
          links.push(entry);
          return { valid: false, reason: entry.reason, links };
        }
      }
    }

    links.push(entry);
  }

  const lastGrantee = chain[chain.length - 1].grantedTo.toLowerCase();
  if (root && chain[0].authority.toLowerCase() !== root) {
    return {
      valid: false,
      reason: `chain root authority ${chain[0].authority} != expected root ${root}`,
      links,
    };
  }

  return { valid: true, reason: "delegation chain valid", links, grantee: lastGrantee };
}