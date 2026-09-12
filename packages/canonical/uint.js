/**
 * CoreGuard Canonical Unsigned Integer (P1)
 *
 * CGEP/1 encodes every unsigned integer as a canonical DECIMAL string:
 *   - no leading zeros (except "0")
 *   - no sign, no exponent
 *   - bounded by uint256 (0 .. 2^256-1)
 *
 * Every representation is accepted on input (RPC-lowercase hex "0x…",
 * uppercase "0X…", decimal strings, safe integers, BigInt) and collapsed to
 * the ONE canonical decimal string. Hex that is NOT canonical (uppercase,
 * "0x00ff", "0X") is still accepted and normalized — because it can come from
 * an RPC. Any value that cannot represent an unsigned integer FAILS CLOSED
 * (throws): floats, negatives, malformed strings, "0x"-only, > uint256.
 *
 * JavaScript numbers are the primary hazard (2^53 precision wall) — code MUST
 * pass large integers as decimal strings, never as JS Number. canonicalize()
 * rejects unsafe JS Numbers so they can never leak into a commitment.
 */

export const UINT256_MAX_BI = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn;
export const UINT64_MAX_BI = 0xffffffffffffffffn;

export const UINT256_MAX = String(UINT256_MAX_BI);
export const UINT64_MAX = String(UINT64_MAX_BI);

export const HEX_UINT_RE = /^0[xX][0-9a-fA-F]+$/;
export const DEC_UINT_RE = /^\d+$/;

/**
 * Collapse any supported representation of an unsigned integer to its
 * canonical CGEP/1 decimal string. Throws (fail-closed) on anything that is
 * not a uint256-compatible value.
 *
 *   canonicalUintString("0xde0b6b3a7640000")   -> "1000000000000000000"
 *   canonicalUintString("1000000000000000000") -> "1000000000000000000"
 *   canonicalUintString(42)                    -> "42"
 *   canonicalUintString(10 ** 18)              -> THROWS (unsafe JS Number)
 *   canonicalUintString(-1)                    -> THROWS
 *   canonicalUintString("0x")                  -> THROWS
 *   canonicalUintString(0xFFFF...FFFF)         -> THROWS (exceeds uint256)
 */
export function canonicalUintString(value) {
  let big;
  if (typeof value === "bigint") {
    big = value;
  } else if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("uint: non-finite number");
    if (!Number.isInteger(value)) throw new TypeError("uint: non-integer number");
    if (value < 0) throw new TypeError("uint: negative number");
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(
        "uint: unsafe JS Number (>2^53). Pass large integers as decimal strings."
      );
    }
    big = BigInt(value);
  } else if (typeof value === "string") {
    const s = value.trim();
    if (s === "") throw new TypeError(`uint: empty string`);
    if (HEX_UINT_RE.test(s)) {
      big = BigInt(s);
    } else if (DEC_UINT_RE.test(s)) {
      big = BigInt(s);
    } else {
      throw new TypeError(`uint: unsupported integer string "${s}"`);
    }
  } else {
    throw new TypeError(`uint: unsupported type ${typeof value}`);
  }

  if (big < 0n) throw new TypeError("uint: negative value");
  if (big > UINT256_MAX_BI) throw new TypeError("uint: exceeds uint256 range");
  return big.toString();
}

/**
 * True when the string is a well-formed canonical uint (decimal, no leading
 * zeros, within uint256). Adversarial check: canonical forms must be unique.
 */
export function isCanonicalUintString(value) {
  if (typeof value !== "string") return false;
  if (!DEC_UINT_RE.test(value)) return false;
  if (value.length > 1 && value.startsWith("0")) return false;
  try {
    return BigInt(value) <= UINT256_MAX_BI;
  } catch {
    return false;
  }
}

/**
 * Decode to BigInt (throws on malformed / out-of-range).
 */
export function uintToBigInt(value) {
  return BigInt(canonicalUintString(value));
}