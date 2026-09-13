/**
 * CoreGuard EVM signer adapter — secp256k1 (sign / recover).
 *
 * Single-writer owner of the `@noble/curves` dependency for this package.
 * Provides raw ECDSA over secp256k1: public-key derivation, digest signing,
 * and public-key recovery (the EIP-712 verifier primitive).
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex, hexToBytes, asBytes, concat } from "../bytes.js";
import { keccak } from "../keccak256.js";
import { addressFromPublicKey } from "./address.js";

/** 32-byte big-endian encoding of a 256-bit value. */
export function to32(value) {
  const bytes = hexToBytes(Buffer.from(BigInt(value).toString(16).padStart(64, "0"), "hex"));
  return bytes;
}

/**
 * Uncompressed public key (65 bytes, 0x04‖X‖Y) for a raw 32-byte private key.
 */
export function publicKeyFromPrivateKey(privateKeyHex) {
  const priv = typeof privateKeyHex === "string"
    ? hexToBytes(privateKeyHex)
    : privateKeyHex;
  return secp256k1.getPublicKey(priv, false);
}

/**
 * Recover the EIP-712 signer's Ethereum address from { r, s, v } (v = 27|28).
 * @returns {string} 0x-hex address
 */
export function recoverSignerAddress(digest, sig) {
  const { r, s, v } = sig || {};
  const rBig = BigInt(typeof r === "bigint" ? r : "0x" + String(r || ""));
  const sBig = BigInt(typeof s === "bigint" ? s : "0x" + String(s || ""));
  if (rBig <= 0n || rBig >= secp256k1.CURVE.n) throw new Error("recover: r out of range");
  if (sBig <= 0n || sBig >= secp256k1.CURVE.n) throw new Error("recover: s out of range");
  const recid = Number(v) % 27;
  if (recid > 1) throw new Error("recover: v must be 27 or 28");

  const compact = concat(to32(rBig), to32(sBig));
  const sigObj = secp256k1.Signature.fromBytes(compact).addRecoveryBit(recid);
  const pub = sigObj.recoverPublicKey(asBytes(digest));
  return addressFromPublicKey(pub.toRawBytes(false));
}

/**
 * Sign a message digest with a raw 32-byte secp256k1 private key.
 * Returns { r, s, v } (Ethereum ECDSA form, v = 27 + recid).
 * @returns {Promise<{r:string,s:string,v:number}>}
 */
export async function signDigest(digestBytes, privateKeyHex) {
  const priv = typeof privateKeyHex === "string"
    ? hexToBytes(privateKeyHex)
    : privateKeyHex;
  const sig = secp256k1.sign(asBytes(digestBytes), priv, { prehash: false });
  const recid = sig.recovery;
  const compact = sig.toCompactRawBytes();
  const r = bytesToHex(compact.slice(0, 32));
  const s = bytesToHex(compact.slice(32));
  return { r, s, v: 27 + recid };
}

export { keccak };