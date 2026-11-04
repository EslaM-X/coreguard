/**
 * packages/stellar/freighter.mjs
 * CoreGuard Stellar Freighter Wallet Integration — FREIGHTER/1
 *
 * Real Freighter wallet integration for signing Stellar transactions.
 * Supports: sign transaction, sign auth entry, get public key, get network.
 */

export const FREIGHTER_VERSION = "FREIGHTER/1";

export const FREIGHTER_NETWORKS = Object.freeze({
  TESTNET: "TESTNET",
  PUBLIC: "PUBLIC",
  FUTURENET: "FUTURENET",
  SANDBOX: "SANDBOX",
});

/**
 * Check if Freighter is installed
 */
export function isFreighterInstalled() {
  if (typeof window === "undefined") return false;
  return !!(window.freighterApi || window.stellar?.freighter);
}

/**
 * Get Freighter API (with fallback)
 */
export function getFreighterApi() {
  if (typeof window === "undefined") return null;
  return window.freighterApi || window.stellar?.freighter || null;
}

/**
 * Get public key from Freighter
 */
export async function getPublicKey(network = "TESTNET") {
  const api = getFreighterApi();
  if (!api) return { ok: false, error: "Freighter not installed" };

  try {
    const publicKey = await api.getPublicKey();
    if (!publicKey) return { ok: false, error: "No public key returned" };
    return { ok: true, publicKey, network };
  } catch (e) {
    return { ok: false, error: e.message || "Failed to get public key" };
  }
}

/**
 * Get network from Freighter
 */
export async function getNetwork() {
  const api = getFreighterApi();
  if (!api) return { ok: false, error: "Freighter not installed" };

  try {
    const network = await api.getNetwork();
    return { ok: true, network: network || "TESTNET" };
  } catch (e) {
    return { ok: false, error: e.message || "Failed to get network" };
  }
}

/**
 * Sign transaction with Freighter
 */
export async function signTransaction(xdr, network = "TESTNET", opts = {}) {
  const api = getFreighterApi();
  if (!api) return { ok: false, error: "Freighter not installed" };

  try {
    const signedXdr = await api.signTransaction(xdr, {
      network,
      accountToSign: opts.accountToSign,
    });
    if (!signedXdr) return { ok: false, error: "No signed transaction returned" };
    return { ok: true, signedXdr, network };
  } catch (e) {
    return { ok: false, error: e.message || "Failed to sign transaction" };
  }
}

/**
 * Sign auth entry with Freighter (for Soroban)
 */
export async function signAuthEntry(entryXdr, network = "TESTNET", opts = {}) {
  const api = getFreighterApi();
  if (!api) return { ok: false, error: "Freighter not installed" };

  try {
    if (typeof api.signAuthEntry !== "function") {
      return { ok: false, error: "Freighter does not support signAuthEntry" };
    }
    const signedEntry = await api.signAuthEntry(entryXdr, {
      network,
      accountToSign: opts.accountToSign,
    });
    if (!signedEntry) return { ok: false, error: "No signed auth entry returned" };
    return { ok: true, signedEntry, network };
  } catch (e) {
    return { ok: false, error: e.message || "Failed to sign auth entry" };
  }
}

/**
 * Freighter status
 */
export function status() {
  return {
    version: FREIGHTER_VERSION,
    installed: isFreighterInstalled(),
    networks: Object.keys(FREIGHTER_NETWORKS),
    features: ["getPublicKey", "getNetwork", "signTransaction", "signAuthEntry"],
  };
}

export default {
  FREIGHTER_VERSION,
  FREIGHTER_NETWORKS,
  isFreighterInstalled,
  getFreighterApi,
  getPublicKey,
  getNetwork,
  signTransaction,
  signAuthEntry,
  status,
};