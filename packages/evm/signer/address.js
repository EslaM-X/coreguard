/**
 * CoreGuard EVM signer adapter — EVM address derivation.
 *
 * address = keccak256(uncompressedPubKey[1:]).slice(12) — matches the
 * convention used by Core/EVM wallets.
 */

import { bytesToHex } from "../bytes.js";
import { keccak } from "../keccak256.js";

/** Ethereum address from an uncompressed (0x04‖X‖Y) 65-byte public key. */
export function addressFromPublicKey(uncompressed) {
  const raw = uncompressed.length === 65 ? uncompressed.slice(1) : uncompressed;
  if (raw.length !== 64) throw new Error("addressFromPublicKey: expected 64-byte key");
  return "0x" + bytesToHex(keccak(raw).slice(12));
}