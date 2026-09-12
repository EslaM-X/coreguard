/**
 * CoreGuard Signer Authentication (P1)
 *
 * Zero-dependency intent authentication using Node's built-in WebCrypto
 * (ECDSA, P-256, SHA-256). No external crypto libraries, no native bindings,
 * no network — fully deterministic and independently re-verifiable.
 *
 * Prover model (CGEP-native signer identity):
 *   signerAddress = "0x" + sha256(uncompressed public key).slice(0, 20 bytes)
 *
 * The signed payload is the ENTIRE canonical intent EXCEPT `signature`,
 * INCLUDING `signer` and `signerPubKey` themselves — so an attacker can never
 * recompute a valid digest under a different signer/public key identity.
 *
 * Digest (domain-separated, reuses CGEP/1 domain hashing):
 *   sha256("CGEP/1:INTENT_AUTH" || canonicalize(signableIntent))
 *
 * Signature:  ECDSA-SHA256 over that digest, encoded { r, s } (each the
 * canonical 32-byte big-endian hex). scheme = "ECDSA_P256_SHA256".
 *
 * SECP256K1 NOTE: Ethereum-style ecrecover (v/r/s, secp256k1) is intentionally
 * NOT used: Node's node:crypto exposes no secp256k1, and adding a dependency
 * contradicts the repository's zero-dependency, independently-auditable
 * verification model. The CGEP address derivation is chain-agnostic by design.
 */

import { createHash, webcrypto } from "node:crypto";

import { canonicalize, domainHash } from "../canonical/index.js";

const subtle = webcrypto.subtle;

export const ECDSA_CURVE = "P-256";
export const ECDSA_HASH = "SHA-256";
export const SIG_SCHEME = "ECDSA_P256_SHA256";
export const AUTH_DOMAIN = "CGEP/1:INTENT_AUTH";

// P-256 group order n (per FIPS 186-4 / SECG): 2^256 - 432420386565659656852420866394968145599
export const CURVE_ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

const octet = (tag, bytes) => {
  const body = bytes.length < 128 ? [bytes.length] : [0x81, bytes.length];
  return Uint8Array.from([tag, ...body, ...bytes]);
};
const oid = (dotted) => {
  const parts = dotted.split(".").map(Number);
  const bytes = [40 * parts[0] + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    const n = parts[i];
    if (n < 128) {
      bytes.push(n);
    } else if (n < 16384) {
      bytes.push(0x80 | (n >> 7), n & 0x7f);
    } else {
      bytes.push(0x80 | (n >> 14), 0x80 | ((n >> 7) & 0x7f), n & 0x7f);
    }
  }
  return octet(0x06, Uint8Array.from(bytes));
};

const BIT_STRING = 0x03;
const SEQ = 0x30;

const EC_PUBLIC_KEY_OID = oid("1.2.840.10045.2.1"); // id-ecPublicKey
const PRIME256V1_OID = oid("1.2.840.10045.3.1.7"); // prime256v1

/**
 * Build the SubjectPublicKeyInfo DER for a raw 64-byte P-256 public key
 * (X || Y, both 32 bytes big-endian, uncompressed).
 */
function buildSpkiDer(rawPubKey) {
  const spkiAlgorithm = octet(SEQ, Uint8Array.from([...EC_PUBLIC_KEY_OID, ...PRIME256V1_OID]));
  const uncompressed = Uint8Array.from([0x04, ...rawPubKey]); // 0x04 || X || Y
  const spkiPubKey = octet(BIT_STRING, Uint8Array.from([0x00, ...uncompressed]));
  return octet(SEQ, Uint8Array.from([...spkiAlgorithm, ...spkiPubKey]));
}

/**
 * Decode a WebCrypto IEEE-P1363 ECDSA signature (raw R‖S, fixed length) into
 * non-negative BigInts.
 */
function parseP1363Signature(bytes) {
  if (bytes.length !== CURVE_ORDER.toString(16).length) {
    // 64 bytes = 32-byte R + 32-byte S.
    throw new TypeError(`signature: expected 64 raw bytes, got ${bytes.length}`);
  }
  const half = bytes.length / 2;
  return {
    r: BigInt("0x" + Buffer.from(bytes.subarray(0, half)).toString("hex")),
    s: BigInt("0x" + Buffer.from(bytes.subarray(half)).toString("hex")),
  };
}

/** 32-byte big-endian (padded) hex of a non-negative BigInt. */
function toFixedHex(value) {
  let hex = value.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  return hex.padStart(64, "0");
}

/**
 * Deterministic PROVER identity: 20-byte address derived from the SHA-256 of
 * the uncompressed public key.
 *   signerAddress = "0x" + sha256(rawPubKey).slice(0, 40 hex)
 */
export function signerAddress(publicKeyHex) {
  const raw = publicKeyHex.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{128}$/.test(raw)) throw new TypeError("signerAddress: publicKeyHex must be 64 bytes");
  return "0x" + createHash("sha256").update(Buffer.from(raw, "hex")).digest("hex").slice(0, 40);
}

function jwkToRawPublicKey(jwk) {
  const x = Buffer.from(jwk.x, "base64url");
  const y = Buffer.from(jwk.y, "base64url");
  if (x.length !== 32 || y.length !== 32) throw new TypeError("jwk: invalid P-256 coordinates");
  return Buffer.concat([x, y]);
}

async function importPrivateJwk(jwk) {
  return subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: ECDSA_CURVE }, true, ["sign"]);
}

async function importPublicKeyForVerify(publicKeyHex) {
  const raw = publicKeyHex.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{128}$/.test(raw)) throw new TypeError("publicKeyHex must be 64 bytes");
  const der = buildSpkiDer(Buffer.from(raw, "hex"));
  return subtle.importKey(
    "spki",
    der,
    { name: "ECDSA", namedCurve: ECDSA_CURVE },
    true,
    ["verify"]
  );
}

/**
 * Generate a fresh P-256 signer keypair.
 * Returns { privateKeyJwk, publicKeyHex }.
 */
export async function generateSignerKeyPair() {
  const pair = await subtle.generateKey(
    { name: "ECDSA", namedCurve: ECDSA_CURVE },
    true,
    ["sign", "verify"]
  );
  const jwk = await subtle.exportKey("jwk", pair.privateKey);
  return {
    privateKeyJwk: jwk,
    publicKeyHex: "0x" + jwkToRawPublicKey(jwk).toString("hex"),
  };
}

/**
 * The domain-separated digest a signer commits to:
 *   sha256("CGEP/1:INTENT_AUTH" || canonicalize(signableIntent))
 * where signableIntent excludes `signature` but INCLUDES signer + signerPubKey.
 */
export async function intentAuthDigest(intent) {
  const { signature: _ignored, ...signable } = intent;
  return domainHash(AUTH_DOMAIN, signable);
}

/**
 * Sign a complete intent. Overwrites `signer` with the identity derived from
 * the public key and appends `signerPubKey` + `signature` so the whole
 * authorization is self-contained and canonically hashable.
 */
export async function signIntent(intent, privateKeyJwk) {
  const { signature: _drop, ...rest } = intent || {};
  const publicKeyHex = jwkToRawPublicKey(privateKeyJwk).toString("hex");
  const signed = {
    ...rest,
    signer: signerAddress("0x" + publicKeyHex),
    signerPubKey: "0x" + publicKeyHex,
  };
  const digest = await intentAuthDigest(signed);
  const digestBytes = Uint8Array.from(Buffer.from(digest.slice(2), "hex"));

  const privateKey = await importPrivateJwk(privateKeyJwk);
  const raw = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: ECDSA_HASH }, privateKey, digestBytes));
  const { r, s } = parseP1363Signature(raw);

  if (r <= 0n || r >= CURVE_ORDER || s <= 0n || s >= CURVE_ORDER) {
    throw new Error("signIntent: signature scalar out of range");
  }

  return {
    ...signed,
    signature: { scheme: SIG_SCHEME, r: toFixedHex(r), s: toFixedHex(s) },
  };
}

/**
 * Verify a signed intent end-to-end, WITHOUT trusting anything but the intent
 * object itself. Fail-closed: any malformed or non-conformant field yields
 * { valid:false, reason }.
 *
 * Returns { valid, reason? , recovered?, digest? }
 */
export async function verifyIntentSignature(intent) {
  if (!intent || typeof intent !== "object") return { valid: false, reason: "intent missing" };

  const sig = intent.signature;
  if (!sig) return { valid: false, reason: "no signature present" };
  if (sig.scheme !== SIG_SCHEME) {
    return { valid: false, reason: `unknown signature scheme "${sig.scheme}"` };
  }
  if (!/^[0-9a-f]{64}$/.test(sig.r || "") || !/^[0-9a-f]{64}$/.test(sig.s || "")) {
    return { valid: false, reason: "signature r/s must each be 32 bytes of hex" };
  }
  const r = BigInt("0x" + sig.r);
  const s = BigInt("0x" + sig.s);
  if (r <= 0n || r >= CURVE_ORDER || s <= 0n || s >= CURVE_ORDER) {
    return { valid: false, reason: "signature scalar out of curve order (malleability guard)" };
  }

  const pub = intent.signerPubKey;
  if (!pub || !/^[0-9a-f]{128}$/i.test(pub.replace(/^0x/, ""))) {
    return { valid: false, reason: "signerPubKey must be 64 bytes of hex" };
  }

  // Identity binding: the committed signer address MUST derive from the key.
  const recovered = signerAddress(pub);
  if (recovered !== intent.signer.toLowerCase()) {
    return { valid: false, reason: `signer is not derived from signerPubKey (recovered ${recovered})` };
  }

  const digest = await intentAuthDigest(intent);
  const digestBytes = Buffer.from(digest.slice(2), "hex");
  const publicKey = await importPublicKeyForVerify(pub);

  // WebCrypto ECDSA verifies against the raw IEEE-P1363 R‖S signature.
  const raw = Buffer.from([...toFixedHex(r), ...toFixedHex(s)].join(""), "hex");
  let ok = false;
  try {
    ok = await subtle.verify({ name: "ECDSA", hash: ECDSA_HASH }, publicKey, raw, digestBytes);
  } catch {
    ok = false;
  }

  if (!ok) return { valid: false, reason: "ECDSA signature does not verify against signerPubKey" };
  return { valid: true, recovered, digest };
}

/**
 * Convenience: recover the signer address for a signed intent (== intent.signer
 * when the signature + key are self-consistent), else null.
 */
export async function recoverSigner(intent) {
  const result = await verifyIntentSignature(intent);
  return result.valid ? result.recovered : null;
}