/**
 * CoreGuard AgentProof — EIP-712 primitives (CGEP/1:AGENT-PROVENANCE §5a)
 *
 * Deterministic typed-data encoding, digest computation, and signer recovery
 * for the AgentProof manifest, delegation links, and attestations.
 *
 * Conformance:
 *   - Standard EIP-712 digest:
 *       digest = keccak256(0x1901 || domainSeparator || structHash)
 *       domainSeparator = keccak256(encode(EIP712Domain...))
 *       structHash      = keccak256(encodeTypeHash || ...encoded fields)
 *   - Ethereum address derivation (matches Core/EVM wallets):
 *       address = keccak256(uncompressedPubKey[1:]).slice(12)
 *   - Deterministic encodeType: referenced struct types appended sorted
 *     alphabetically (EIP-712 required ordering).
 *
 * The one intentional deviation from the crypto package's CGEP-native signer
 * (sha256-derived address, P-256 WebCrypto) is cryptographic necessity:
 * EIP-712 wallet signatures are secp256k1 + keccak256. This module therefore
 * depends on @noble/curves + @noble/hashes (pure JS, audited, no native
 * bindings). This is a deliberate, CAP-1-approved decision.
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex } from "@noble/hashes/utils";

export const EIP712_DOMAIN_NAME = "CoreGuard AgentProof";
export const EIP712_DOMAIN_VERSION = "1";

const hexToBytes = (hex) => {
  if (hex instanceof Uint8Array) return hex;
  if (Buffer.isBuffer(hex)) return Uint8Array.from(hex);
  return Uint8Array.from(Buffer.from(hex.replace(/^0x/, ""), "hex"));
};

const asBytes = (u) => (u instanceof Uint8Array ? u : hexToBytes(u));

function concat(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** keccak256 of a message (Uint8Array, hex string, or UTF-8 string). */
export function keccak(msg) {
  const bytes =
    typeof msg === "string"
      ? Buffer.from(msg, "utf8")
      : asBytes(msg);
  return asBytes(keccak_256(bytes));
}

/** 32-byte big-endian encoding of a value. */
export function encodeUint256(n, bits = 256) {
  let hex = (BigInt(n) < 0n ? 0n : BigInt(n)).toString(16);
  if (hex.length % 2) hex = "0" + hex;
  return hexToBytes(Buffer.from(hex.padStart(bits / 4, "0"), "hex"));
}

/** Ethereum-style address encoding: right-pad a 20-byte address to 32 bytes. */
export function encodeAddress(addr) {
  const clean = String(addr).toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(clean)) throw new Error(`invalid address: ${addr}`);
  return encodeUint256(BigInt("0x" + clean));
}

/** keccak256 of a UTF-8 string, padded to 32 bytes (EIP-712 string field). */
export function encodeString(str) {
  return keccak(Buffer.from(String(str), "utf8"));
}

/**
 * EIP-712 encodeType. Deterministic per the standard's dependency reordering:
 * `TypeName(type1 t1,type2 t2[...])` followed by each referenced custom type,
 * sorted alphabetically by name (primary type itself is not included in the
 * sorted suffix; EIP712Domain handling is delegated by callers).
 */
export function encodeType(primaryType, types) {
  const names = [primaryType];
  const seen = new Set(names);
  const queue = [primaryType];
  while (queue.length) {
    const name = queue.shift();
    if (name === "EIP712Domain") continue;
    const fields = types[name] || [];
    for (const f of fields) {
      const t = f.type;
      const base = t.replace(/\[\]$/, "");
      if (types[base] && !seen.has(base)) {
        seen.add(base);
        queue.push(base);
      }
    }
  }
  const dependencies = names.concat(
    [...seen].filter((n) => n !== primaryType).sort()
  );
  let out = primaryType + "(" + (types[primaryType] || []).map(
    (f) => `${f.type} ${f.name}`
  ).join(",") + ")";
  for (const name of dependencies) {
    if (name === primaryType) continue;
    out += name + "(" + (types[name] || []).map((f) => `${f.type} ${f.name}`).join(",") + ")";
  }
  return out;
}

/** EIP-712 encodeData for one primary type/message. Returns raw bytes hashable. */
export function encodeData(primaryType, types, data) {
  const typeHash = keccak(encodeType(primaryType, types));
  const parts = [typeHash];
  for (const field of types[primaryType] || []) {
    parts.push(encodeField(field.type, data[field.name], types));
  }
  return concat(...parts);
}

function encodeField(t, value, types) {
  const isArray = t.endsWith("[]");
  const base = t.replace(/\[\]$/, "");
  if (isArray) {
    const arr = Array.isArray(value) ? value : [];
    const elems = arr.map((v) => encodeField(base, v, types));
    return keccak(concat(...elems.map((e) => asBytes(e))));
  }
  switch (base) {
    case "uint256":
      return encodeUint256(value);
    case "address":
      return encodeAddress(value);
    case "bytes32":
      return asBytes(value).length === 32 ? asBytes(value) : encodeUint256(BigInt("0x" + String(value).replace(/^0x/, "").padStart(64, "0")));
    case "string":
      return encodeString(value);
    case "bool":
      return encodeUint256(value ? 1 : 0);
    default:
      if (types[base]) return keccak(encodeData(base, types, value));
      throw new Error(`encodeField: unknown type ${base}`);
  }
}

const EIP712_DOMAIN_TYPE = "EIP712Domain(string name,string version,uint256 chainId)";

/**
 * Compute the EIP-712 domain separator for the AgentProof manifest.
 * Domain fields match the spec exactly: name, version, chainId ONLY —
 * `verifyingContract` stays ABSENT until an official verifier contract exists.
 * chainId is the chain the manifest anchors on (1116 Mainnet / 1114 Testnet2).
 */
export function domainSeparator(chainId) {
  const nameHash = keccak(Buffer.from(EIP712_DOMAIN_NAME, "utf8"));
  const versionHash = keccak(Buffer.from(EIP712_DOMAIN_VERSION, "utf8"));
  const types = {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
    ],
  };
  const data = encodeData("EIP712Domain", types, {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId: BigInt(chainId),
  });
  const domainHash = keccak(concat(
    keccak(Buffer.from(EIP712_DOMAIN_TYPE, "utf8")),
    nameHash,
    versionHash,
    encodeUint256(chainId)
  ));
  return domainHash;
}

/**
 * EIP-712 TypedData digest for a message of `primaryType` under `types`, on
 * chain `chainId`:
 *   digest = keccak256(0x1901 || domainSeparator(chainId) || structHash)
 */
export function typedDataDigest(primaryType, types, message, chainId) {
  const structHash = keccak(encodeData(primaryType, types, message));
  return keccak(concat(
    Uint8Array.from([0x19, 0x01]),
    domainSeparator(chainId),
    structHash
  ));
}

const FIELD_OF = (type, name) => ({ name, type });

/**
 * Deterministic EIP-712 domain separator from an arbitrary domain object.
 * Standard field order: name, version, chainId, verifyingContract, salt.
 * Only fields present (non-undefined) are included, in EIP-712 canonical order.
 */
export function domainSeparatorOf(domain) {
  const fields = [
    ...(domain.name !== undefined ? [FIELD_OF("string", "name")] : []),
    ...(domain.version !== undefined ? [FIELD_OF("string", "version")] : []),
    ...(domain.chainId !== undefined ? [FIELD_OF("uint256", "chainId")] : []),
    ...(domain.verifyingContract !== undefined ? [FIELD_OF("address", "verifyingContract")] : []),
    ...(domain.salt !== undefined ? [FIELD_OF("bytes32", "salt")] : []),
  ];
  if (fields.length === 0) throw new Error("domainSeparatorOf: domain has no fields");
  const types = { EIP712Domain: fields };
  // encodeData includes the typeHash already; keccak of it == the separator.
  return keccak(encodeData("EIP712Domain", types, domain));
}

/**
 * Generic EIP-712 digest for any domain and primary type. Keeps the AgentProof
 * fixed-domain `typedDataDigest` as the primary manifest API while this covers
 * the general case (e.g. conformance vectors, future verifier contracts).
 */
export function typedDataDigestWithDomain(primaryType, types, message, domain) {
  const domainHash = domainSeparatorOf(domain);
  const structHash = keccak(encodeData(primaryType, types, message));
  return keccak(concat(
    Uint8Array.from([0x19, 0x01]),
    domainHash,
    structHash
  ));
}

/**
 * Recover the EIP-712 signer's Ethereum address from
 * { r, s, v } (v = 27 | 28). Returns 0x-hex address.
 */
export function recoverSignerAddress(digest, sig) {
  const { r, s, v } = sig || {};
  const rBig = BigInt(typeof r === "bigint" ? r : "0x" + String(r || ""));
  const sBig = BigInt(typeof s === "bigint" ? s : "0x" + String(s || ""));
  if (rBig <= 0n || rBig >= secp256k1.CURVE.n) throw new Error("recover: r out of range");
  if (sBig <= 0n || sBig >= secp256k1.CURVE.n) throw new Error("recover: s out of range");
  const recid = Number(v) % 27;
  if (recid > 1) throw new Error("recover: v must be 27 or 28");

  const r32 = to32(rBig);
  const s32 = to32(sBig);
  const compact = concat(r32, s32);

  const sigObj = secp256k1.Signature.fromBytes(compact).addRecoveryBit(recid);
  const pub = sigObj.recoverPublicKey(asBytes(digest));
  return addressFromPublicKey(pub.toRawBytes(false));
}

/** Exactly 32 bytes big-endian for a positive BigInt (internal helper). */
function to32(value) {
  const out = encodeUint256(value);
  if (out.length === 32) return out;
  if (out.length < 32) {
    const padded = new Uint8Array(32);
    padded.set(out, 32 - out.length);
    return padded;
  }
  return out.slice(out.length - 32);
}

/** Ethereum address from an uncompressed (0x04‖X‖Y) 65-byte public key. */
export function addressFromPublicKey(uncompressed) {
  const raw = uncompressed.length === 65 ? uncompressed.slice(1) : uncompressed;
  if (raw.length !== 64) throw new Error("addressFromPublicKey: expected 64-byte key");
  return "0x" + bytesToHex(keccak(raw).slice(12));
}

/** Uncompressed public key (65 bytes, 0x04‖X‖Y) for a raw 32-byte private key. */
export function publicKeyFromPrivateKey(privateKeyHex) {
  const priv = typeof privateKeyHex === "string"
    ? hexToBytes(privateKeyHex)
    : privateKeyHex;
  return secp256k1.getPublicKey(priv, false);
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