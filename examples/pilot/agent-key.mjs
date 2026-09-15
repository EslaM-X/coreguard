/**
 * Pilot-1 agent identity (Core EOA).
 *
 * The agent is a Core Mainnet EOA. Only `PRIVATE_KEY` from `.env` (or
 * CG_PILOT_PRIVATE_KEY) is used. The key itself is NEVER printed, logged, or
 * written to any artifact — this module only derives the public address and
 * returns an EIP-712 signer closure for WS-1 authorization.
 *
 * Fail-closed: missing/unparseable key -> throws; no key material in output.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { publicKeyFromPrivateKey, addressFromPublicKey } from "@coreguard/evm";
import { signDigest, typedDataDigest } from "@coreguard/evm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadPrivateKey() {
  const explicit = (process.env.CG_PILOT_PRIVATE_KEY || "").trim();
  if (explicit) return explicit;
  const envFile = resolve(ROOT, ".env");
  let content = "";
  try {
    content = readFileSync(envFile, "utf8");
  } catch {
    throw new Error("Pilot-1 gate: PRIVATE_KEY unavailable (no .env + no CG_PILOT_PRIVATE_KEY). No key material is ever read from anywhere else.");
  }
  // Precedence: the funded Core Mainnet wallet that performed the historical
  // Mainnet anchor (MAINNET_PRIVATE_KEY) is the pilot agent; PRIVATE_KEY is a
  // fallback. Keys are never printed, logged, or written to artifacts.
  for (const varName of ["CG_PILOT_PRIVATE_KEY", "MAINNET_PRIVATE_KEY", "PRIVATE_KEY"]) {
    const match = content.match(new RegExp(`^${varName}=(0x[0-9a-fA-F]{64})$`, "m"));
    if (match) return match[1];
  }
  throw new Error("Pilot-1 gate: .env has no MAINNET_PRIVATE_KEY=0x<64 hex> or PRIVATE_KEY=0x<64 hex>. The pilot refuses to fabricate an agent identity.");
}

export function agentFromEnv() {
  const pk = loadPrivateKey();
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error("Pilot-1 gate: PRIVATE_KEY must be 0x<64 hex>.");
  }
  const pub = publicKeyFromPrivateKey(pk);
  const address = addressFromPublicKey(pub).toLowerCase();
  return {
    address,
    publicKeyHex: pub,
    // Returns the raw private key ONLY to the broadcast/staging path.
    // Never logged, never written to artifacts, never returned by plan/capture.
    privateKeyForBroadcast: () => pk,
    async signManifest(manifestId, chainId) {
      const digest = typedDataDigest(
        "ManifestDeclaration",
        { ManifestDeclaration: [{ name: "manifestId", type: "bytes32" }] },
        { manifestId },
        chainId
      );
      const sig = await signDigest(digest, pk);
      return {
        scheme: "EIP-712",
        signer: address,
        r: sig.r,
        s: sig.s,
        v: sig.v,
      };
    },
  };
}