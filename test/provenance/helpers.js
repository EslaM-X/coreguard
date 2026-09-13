/**
 * CoreGuard AgentProof — test fixtures & sign helpers (Phase A verification)
 *
 * Deterministic secp256k1 keys derived from a counter so tests are stable:
 *   seedKey(i)    => { priv (0x hex), address }
 *   signManifest(manifest, priv, chainId) => manifest + signature envelope
 *   signDelegation(link, priv, chainId)   => link + signature
 */

import { signDigest, typedDataDigest, publicKeyFromPrivateKey, addressFromPublicKey, keccak } from "../../packages/evm/index.js";

const pad = (n, len) => String(n).padStart(len, "0");

/** Deterministic 32-byte private key for index i: keccak256("CGEP test key <i>") */
export function seedKey(i) {
  const digest = keccak(`CGEP test key ${i}`);
  const privHex = Buffer.from(digest).toString("hex");
  const pub = publicKeyFromPrivateKey(privHex);
  const address = addressFromPublicKey(pub);
  return { priv: privHex, address, i };
}

export function makeAddress(seed) {
  return "0x" + pad(seed.toString(16), 40);
}

export function makeTxHash(seed) {
  return "0x" + pad(seed.toString(16), 64);
}

/**
 * Build a deterministic STAMP manifest for a given execution.
 * `kind` = "REGISTRATION" | "STAMP".
 */
export function makeManifest({ kind = "STAMP", signerAddress, chainId = "1116", nonce = "1", executorType = "AI_AGENT", executionRef, extra = null }) {
  const declared = {
    signerBinding: { address: signerAddress },
    executorType,
    ...(extra || {}),
  };
  if (kind === "REGISTRATION") {
    return {
      version: "CGEP/1",
      manifestKind: kind,
      nonce,
      declared,
      executionRef: null,
    };
  }
  if (!executionRef) throw new Error("STAMP requires executionRef");
  return {
    version: "CGEP/1",
    manifestKind: kind,
    nonce,
    declared,
    executionRef,
  };
}

/** Sign a manifest (computes manifestId internally) and attach the envelope. */
export async function signManifest(manifest, priv, chainId) {
  const m = { ...manifest };
  delete m.manifestId;
  delete m.signature;
  const { computeManifestId } = await import("../../packages/provenance/canonical.js");
  m.manifestId = await computeManifestId(m);
  const digest = typedDataDigest("ManifestDeclaration", { ManifestDeclaration: [{ name: "manifestId", type: "bytes32" }] }, { manifestId: m.manifestId }, chainId);
  m.signature = {
    scheme: "EIP-712",
    signer: manifest.declared.signerBinding.address,
    ...(await signDigest(digest, priv)),
    digest: "0x" + Buffer.from(digest).toString("hex"),
  };
  return m;
}

/** Build + sign a delegation chain of `n` links as a flat array. */
export async function makeDelegationChain({ head, grantees, scopeActionHash = "0", maxValue = "0", validAfter = "0", expiresAt = "0", chainId = "1116", sigs = null }) {
  const links = [];
  let authority = head;
  for (let i = 0; i < grantees.length; i += 1) {
    const grantedTo = grantees[i];
    const link = {
      authority,
      grantedTo,
      scopeActionHash,
      maxValue,
      validAfter,
      expiresAt,
      ...(sigs ? { signature: sigs[i] || null } : {}),
    };
    links.push(link);
    authority = grantedTo;
  }
  return links;
}