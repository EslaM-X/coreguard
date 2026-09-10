/**
 * CoreGuard Canonical Encoding
 *
 * Ensures identical logical data always produces identical bytes.
 */

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
 */
export function canonicalize(obj) {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "boolean") return obj ? "true" : "false";
  if (typeof obj === "number") {
    if (!Number.isInteger(obj)) throw new Error("Non-integer numbers not supported");
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

  const hashBuffer = await crypto.subtle.digest("SHA-256", combined);
  return "0x" + Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
 * Compute receipt ID
 */
export async function computeReceiptId(receipt) {
  return domainHash("CGEP/1:RECEIPT", receipt);
}
