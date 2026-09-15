/**
 * Pilot-1 minimal legacy EIP-155 transaction signer (Core uses type-0 txs).
 *
 * Hand-rolled RLP (no dependency) + @coreguard/evm signDigest. Only used to
 * STAGE the agent's execution transaction; nothing is ever broadcast except by
 * the explicit `--allow-broadcast` path behind the funding gate. Every signed
 * payload is re-validated by public-key recovery before it can be returned.
 */

import {
  keccak,
  hexToBytes,
  bytesToHex,
  signDigest,
  publicKeyFromPrivateKey,
  addressFromPublicKey,
  recoverSignerAddress,
} from "@coreguard/evm";

function toMinimalBytes(value) {
  let hex = BigInt(value).toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const bytes = hexToBytes(hex);
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  return bytes.slice(i);
}

function rlpItem(value) {
  if (value === null || value === undefined || value === 0 || value === 0n) {
    return new Uint8Array([0x80]);
  }
  const bytes =
    typeof value === "bigint" || typeof value === "number" || typeof value === "string"
      ? toMinimalBytes(value)
      : value;
  if (bytes.length === 1 && bytes[0] < 0x80) return bytes;
  if (bytes.length <= 55) {
    const out = new Uint8Array(bytes.length + 1);
    out[0] = 0x80 + bytes.length;
    out.set(bytes, 1);
    return out;
  }
  const lenBytes = toMinimalBytes(bytes.length);
  const out = new Uint8Array(1 + lenBytes.length + bytes.length);
  out[0] = 0xb7 + lenBytes.length;
  out.set(lenBytes, 1);
  out.set(bytes, 1 + lenBytes.length);
  return out;
}

function rlpList(items) {
  const body = items.map(rlpItem);
  const bodyLen = body.reduce((n, b) => n + b.length, 0);
  const head = bodyLen <= 55 ? new Uint8Array([0xc0 + bodyLen]) : (() => {
    const lenBytes = toMinimalBytes(bodyLen);
    const out = new Uint8Array(1 + lenBytes.length);
    out[0] = 0xf7 + lenBytes.length;
    out.set(lenBytes, 1);
    return out;
  })();
  const out = new Uint8Array(head.length + bodyLen);
  out.set(head, 0);
  let off = head.length;
  for (const b of body) {
    out.set(b, off);
    off += b.length;
  }
  return out;
}

function trimHex(hex) {
  const h = hex.replace(/^0x/, "");
  return h.length % 2 ? "0" + h : h;
}

export async function signLegacyTransaction({
  privateKey,
  nonce,
  gasPrice,
  gasLimit,
  to,
  value,
  data = "0x",
  chainId,
}) {
  const toBytes = to ? hexToBytes(to.toLowerCase().replace(/^0x/, "")) : new Uint8Array();
  const dataBytes = hexToBytes(trimHex(data));
  const fields = [nonce, gasPrice, gasLimit, toBytes, value, dataBytes];

  const signing = rlpList([...fields, BigInt(chainId), 0n, 0n]);
  const digest = keccak(signing);

  const sig = await signDigest(digest, privateKey);
  const recid = sig.v - 27;
  const rawV = BigInt(chainId) * 2n + 35n + BigInt(recid);
  const rBytes = hexToBytes(sig.r);
  const sBytes = hexToBytes(sig.s);
  const rawResult = rlpList([...fields, rawV, rBytes, sBytes]);
  const rawHex = "0x" + bytesToHex(rawResult);
  const txHash = "0x" + bytesToHex(keccak(rawResult));

  const pub = publicKeyFromPrivateKey(privateKey);
  const from = addressFromPublicKey(pub).toLowerCase();
  const recovered = recoverSignerAddress(digest, { r: sig.r, s: sig.s, v: sig.v }).toLowerCase();
  if (recovered !== from) {
    throw new Error("signLegacyTransaction: self-recovery mismatch — refusing a payload that does not recover to the agent sender.");
  }

  return {
    rawHex,
    txHash,
    from,
    nonce: BigInt(nonce).toString(),
    gasPrice: BigInt(gasPrice).toString(),
    gasLimit: BigInt(gasLimit).toString(),
    to: to.toLowerCase(),
    value: BigInt(value).toString(),
    data: (data || "0x").toLowerCase(),
    v: rawV.toString(),
    r: sig.r,
    s: sig.s,
    recid,
  };
}