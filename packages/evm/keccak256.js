/**
 * CoreGuard EVM signer adapter — Keccak-256.
 *
 * Single-writer owner of the `@noble/hashes` dependency for this package.
 * Everything else in @coreguard/evm imports keccak from here (or bytes.js).
 */

import { keccak_256 } from "@noble/hashes/sha3";
import { asBytes } from "./bytes.js";

/**
 * keccak256 of a message (Uint8Array, hex string, or UTF-8 string).
 * @returns {Uint8Array} 32-byte digest
 */
export function keccak(msg) {
  const bytes =
    typeof msg === "string"
      ? Buffer.from(msg, "utf8")
      : asBytes(msg);
  return asBytes(keccak_256(bytes));
}

export function keccakHex(msg) {
  return Buffer.from(keccak(msg)).toString("hex");
}