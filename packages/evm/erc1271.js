/**
 * CoreGuard EVM signer adapter — EIP-1271 contract-signature primitives.
 *
 * Pure ABI/bool helpers ONLY (deterministic, offline). EIP-1271
 * `isValidSignature(bytes32,bytes)` is a `view` function per the standard's
 * no-state-mutation requirement; the transport (read-only `eth_call`) is
 * injected by the caller — this module performs no network call and makes no
 * claim that a `STATICCALL` opcode was executed (see
 * spec/agent-provenance-eip1271.md Q-B1.1/Q-B1.5).
 *
 * Semantic bound (Q-B1.3): a returned magic value is CONTRACT_AUTHORIZATION
 * evidence — it is NEVER executor proof (`magic != executor proof`).
 */

import { hexToBytes, concat, bytesToHex } from "./bytes.js";
import { encodeUint256 } from "./signer/eip712.js";
import { keccak } from "./keccak256.js";

/** EIP-1271 magic value returned by a positive isValidSignature. */
export const ERC1271_MAGIC = "0x1626ba7e";

/** Canonical EIP-1271 function signature. */
export const ERC1271_FN_SIG = "isValidSignature(bytes32,bytes)";

/** Function selector: bytes4(keccak256(fnSig)). Must equal ERC1271_MAGIC. */
export function erc1271Selector() {
  return "0x" + bytesToHex(keccak(ERC1271_FN_SIG)).slice(0, 8);
}

function normalizeHex(value) {
  const s = String(value);
  return s.startsWith("0x") ? s.toLowerCase() : "0x" + s.toLowerCase();
}

/**
 * Build the ABI calldata for `isValidSignature(bytes32,bytes)`:
 * selector ‖ digest(32) ‖ offset(0x40) ‖ length ‖ data(padded to 32).
 * Returns a lowercase "0x"-prefixed hex string.
 */
export function isValidSignatureCalldata(digest, signatureHex = "0x") {
  const dig = normalizeHex(digest);
  if (!/^0x[0-9a-f]{64}$/.test(dig)) {
    throw new Error("erc1271: digest must be a 0x 32-byte hex string");
  }
  const sig = normalizeHex(signatureHex);
  if (!/^0x(?:[0-9a-f]{2})*$/.test(sig)) {
    throw new Error("erc1271: signature must be an even-length 0x hex string");
  }
  const sigBytes = hexToBytes(sig);
  const pad = (32 - (sigBytes.length % 32)) % 32;
  const padded = sigBytes.length
    ? concat(sigBytes, new Uint8Array(pad))
    : new Uint8Array(0);

  const data = concat(
    hexToBytes(erc1271Selector()),
    hexToBytes(dig),
    encodeUint256(0x40),
    encodeUint256(sigBytes.length),
    padded,
  );
  return "0x" + bytesToHex(data);
}

/**
 * Decode the 4-byte return value of isValidSignature. Returns the first
 * four bytes as "0x…" (e.g. ERC1271_MAGIC) or null when there is no usable
 * return data (revert / OOG / empty).
 */
export function decodeIsValidSignatureReturn(retHex) {
  const norm = normalizeHex(retHex);
  if (!/^0x[0-9a-f]*$/.test(norm) || norm.length < 10) return null;
  return "0x" + norm.slice(2, 10);
}

/** True iff the return data starts with the EIP-1271 magic value. */
export function isErc1271Magic(retHex) {
  return decodeIsValidSignatureReturn(retHex) === ERC1271_MAGIC;
}