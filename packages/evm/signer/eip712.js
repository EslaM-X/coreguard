/**
 * CoreGuard EVM signer adapter — True EIP-712 (CGEP/1:AGENT-PROVENANCE §5a).
 *
 * Deterministic typed-data encoding, digest computation, and domain
 * separation. Standard EIP-712 digest:
 *
 *   digest           = keccak256(0x1901 || domainSeparator || structHash)
 *   domainSeparator  = keccak256(encode(EIP712Domain...))
 *   structHash       = keccak256(encodeTypeHash || ...encoded fields)
 *
 * Domain fields match the AgentProof spec exactly: name, version, chainId
 * ONLY — `verifyingContract` stays ABSENT until an official verifier
 * contract exists. chainId is the chain the manifest anchors on
 * (1116 Mainnet / 1114 Testnet2), and guards cross-chain replay.
 *
 * ARCHITECTURE NOTE: this module is the ONLY place where EIP-712 is "real".
 * The zero-dependency core (`@coreguard/canonical`, `@coreguard/provenance`
 * model) remains intact; secp256k1/Keccak are introduced here — behind an
 * isolated EVM signer adapter — and nowhere else.
 */

import { asBytes, concat, hexToBytes, bytesToHex } from "../bytes.js";
import { keccak } from "../keccak256.js";

export const EIP712_DOMAIN_NAME = "CoreGuard AgentProof";
export const EIP712_DOMAIN_VERSION = "1";

const EIP712_DOMAIN_TYPE = "EIP712Domain(string name,string version,uint256 chainId)";

/** 32-byte big-endian encoding of a value. */
export function encodeUint256(n, bits = 256) {
  const value = BigInt(n) < 0n ? 0n : BigInt(n);
  let hex = value.toString(16);
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
 * sorted alphabetically by name (EIP712Domain handling is delegated by callers).
 */
export function encodeType(primaryType, types) {
  const seen = new Set([primaryType]);
  const queue = [primaryType];
  while (queue.length) {
    const name = queue.shift();
    if (name === "EIP712Domain") continue;
    const fields = types[name] || [];
    for (const f of fields) {
      const base = f.type.replace(/\[\]$/, "");
      if (types[base] && !seen.has(base)) {
        seen.add(base);
        queue.push(base);
      }
    }
  }
  const dependencies = [primaryType].concat(
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
    case "bytes32": {
      const b = asBytes(value);
      if (b.length === 32) return b;
      return encodeUint256(BigInt("0x" + String(value).replace(/^0x/, "").padStart(64, "0")));
    }
    case "string":
      return encodeString(value);
    case "bool":
      return encodeUint256(value ? 1 : 0);
    default: {
      if (/^(u?int)\d+$/.test(t)) return encodeUint256(value);
      if (types[t]) return keccak(encodeData(t, types, value));
      throw new Error(`encodeField: unknown type ${t}`);
    }
  }
}

/** EIP-712 encodeData for one primary type/message. Returns raw bytes. */
export function encodeData(primaryType, types, data) {
  const typeHash = keccak(encodeType(primaryType, types));
  const parts = [typeHash];
  for (const field of types[primaryType] || []) {
    parts.push(encodeField(field.type, data[field.name], types));
  }
  return concat(...parts);
}

/**
 * Compute the EIP-712 domain separator for the AgentProof manifest
 * (name, version, chainId ONLY).
 */
export function domainSeparator(chainId) {
  const nameHash = keccak(Buffer.from(EIP712_DOMAIN_NAME, "utf8"));
  const versionHash = keccak(Buffer.from(EIP712_DOMAIN_VERSION, "utf8"));
  return keccak(concat(
    keccak(Buffer.from(EIP712_DOMAIN_TYPE, "utf8")),
    nameHash,
    versionHash,
    encodeUint256(chainId),
  ));
}

const FIELD_OF = (type, name) => ({ name, type });

/**
 * Deterministic EIP-712 domain separator from an arbitrary domain object.
 * Standard field order: name, version, chainId, verifyingContract, salt.
 * Only fields present (non-undefined) are included, in canonical order.
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
  return keccak(encodeData("EIP712Domain", { EIP712Domain: fields }, domain));
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
    structHash,
  ));
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
    structHash,
  ));
}

export { bytesToHex, hexToBytes };