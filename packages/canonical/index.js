/**
 * CoreGuard Canonical Encoding
 *
 * Ensures identical logical data always produces identical bytes.
 */

import { createHash } from "node:crypto";

export {
  canonicalUintString,
  isCanonicalUintString,
  uintToBigInt,
  UINT256_MAX,
  UINT256_MAX_BI,
  UINT64_MAX,
  UINT64_MAX_BI,
} from "./uint.js";

const ENCODING_VERSION = "CGEP/1";

/**
 * Canonicalize any value to deterministic string representation.
 * Rules:
 * - Integers → decimal strings
 * - Addresses → lowercase hex with 0x
 * - Bytes → lowercase hex with 0x
 * - Booleans → true/false
 * - Null → null
 * - Objects → keys sorted alphabetically
 * - Arrays → elements in order, no trailing commas
 *
 * P1 (integer safety): JS Numbers are only accepted when they are safe
 * integers (|n| <= 2^53-1). Anything larger is an ambiguity hazard and FAILS
 * CLOSED — big integers MUST arrive as canonical decimal strings (uint.js).
 */
export function canonicalize(obj) {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "boolean") return obj ? "true" : "false";
  if (typeof obj === "number") {
    if (!Number.isInteger(obj)) throw new Error("Non-integer numbers not supported");
    if (!Number.isSafeInteger(obj)) {
      throw new Error(
        `Unsafe JS Number ${obj}: pass large integers as canonical decimal strings (CGEP/1 uint)`
      );
    }
    return String(obj);
  }
  if (typeof obj === "string") {
    if (obj.startsWith("0x")) return JSON.stringify(obj.toLowerCase());
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    const elements = obj.map((e) => canonicalize(e));
    return "[" + elements.join(",") + "]";
  }
  if (typeof obj === "object") {
    const keys = Object.keys(obj).sort();
    const pairs = keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k]));
    return "{" + pairs.join(",") + "}";
  }
  throw new Error(`Unsupported type: ${typeof obj}`);
}

/**
 * Hash with domain separation.
 * H("CGEP/1:INTENT" || canonicalized)
 */
export async function domainHash(domain, data) {
  const encoder = new TextEncoder();
  const domainBytes = encoder.encode(domain);
  const dataBytes = encoder.encode(canonicalize(data));

  const combined = new Uint8Array(domainBytes.length + dataBytes.length);
  combined.set(domainBytes);
  combined.set(dataBytes, domainBytes.length);

  const digest = createHash("sha256").update(combined).digest("hex");
  return "0x" + digest;
}

/**
 * Compute intent hash
 */
export async function hashIntent(intent) {
  return domainHash("CGEP/1:INTENT", intent);
}

/**
 * Compute policy hash
 */
export async function hashPolicy(policy) {
  return domainHash("CGEP/1:POLICY", policy);
}

/**
 * Compute trace hash
 */
export async function hashTrace(trace) {
  return domainHash("CGEP/1:TRACE", trace);
}

/**
 * Compute evidence commitment
 */
export async function hashEvidence(evidence) {
  return domainHash("CGEP/1:EVIDENCE", evidence);
}

/**
 * Compute canonical state-delta commitment (P1)
 */
export async function hashStateDelta(stateDelta) {
  return domainHash("CGEP/1:STATEDELTA", stateDelta);
}

/**
 * Compute receipt ID
 */
export async function computeReceiptId(receipt) {
  return domainHash("CGEP/1:RECEIPT", receipt);
}
