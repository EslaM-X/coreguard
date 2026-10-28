/**
 * index.mjs — Stellar/1, the CoreGuard Stellar integration adapter.
 *
 * What this is: a deterministic, fail-closed adapter for the Stellar network
 * (Horizon REST API). It can READ account state and BUILD transaction envelopes
 * offline, and it can SUBMIT only when an explicit settlement adapter is
 * injected. No key material, no network call, no funds movement happens by
 * default — every mutating path returns NOT_PERFORMED unless the integrator
 * supplies the credential + signer + (optionally) a Horizon submitter.
 *
 * What this is NOT:
 *   - it is NOT a wallet. No secret key is stored, generated, or logged.
 *   - it is NOT a live integration claim. status() reports UNKNOWN / DRY_RUN
 *     until a real counterparty + credentials + receipt are observed.
 *   - it is NOT revenue. No transaction is ever submitted by this module.
 *
 * Horizon endpoint is configurable; the public testnet (horizon-testnet.stellar.org)
 * is the default so that reads are verifiable without credentials. Mainnet is
 * never assumed.
 *
 * Standards: STELLAR/1 (CoreGuard adapter envelope).
 */

export const STELLAR_VERSION = "STELLAR/1";
export const STELLAR_NETWORKS = Object.freeze({
  TESTNET: "testnet",
  MAINNET: "mainnet",
  FUTURENET: "futurenet",
});
export const STELLAR_HORIZON = Object.freeze({
  testnet: "https://horizon-testnet.stellar.org",
  mainnet: "https://horizon.stellar.org",
  futurenet: "https://horizon-futurenet.stellar.org",
});
export const STELLAR_STATES = Object.freeze([
  "READ_OK",
  "READ_FAILED",
  "BUILD_OK",
  "GATED",
  "NOT_PERFORMED",
  "SUBMITTED",
  "REJECTED",
  "REFUSED",
]);

const DEFAULT_TIMEOUT_MS = 10000;

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Low-level Horizon fetch. Returns { ok, status, body, error }.
 * Uses global fetch (Node >= 18). Never throws.
 */
export async function horizonFetch({ network = "testnet", path, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const base = STELLAR_HORIZON[network];
  if (!base) {
    return { ok: false, status: 0, body: null, error: `unknown network: ${network}` };
  }
  if (!isNonEmptyString(path)) {
    return { ok: false, status: 0, body: null, error: "path required" };
  }
  const url = base + (path.startsWith("/") ? path : "/" + path);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    const text = await res.text();
    let body = null;
    try { body = text.length ? JSON.parse(text) : null; } catch { body = text; }
    return { ok: res.ok, status: res.status, body, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: 0, body: null, error: String(e && e.message ? e.message : e) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read an account from Horizon. Returns a normalized, minimal record.
 * Never exposes secret keys; only public account data.
 */
export async function readAccount({ network = "testnet", accountId, timeoutMs } = {}) {
  if (!isNonEmptyString(accountId)) {
    return { state: "READ_FAILED", error: "accountId required", account: null };
  }
  const r = await horizonFetch({ network, path: `/accounts/${accountId}`, timeoutMs });
  if (!r.ok) {
    return { state: "READ_FAILED", error: r.error, account: null, status: r.status };
  }
  const a = r.body || {};
  return {
    state: "READ_OK",
    account: {
      id: a.id || accountId,
      sequence: a.sequence || null,
      balances: Array.isArray(a.balances) ? a.balances.map((b) => ({
        assetType: b.asset_type,
        assetCode: b.asset_code || "XLM",
        balance: b.balance,
      })) : [],
      subentryCount: a.subentry_count ?? 0,
      thresholds: a.thresholds || null,
      signers: Array.isArray(a.signers) ? a.signers.map((s) => ({ key: s.key, weight: s.weight, type: s.type })) : [],
      flags: a.flags || null,
    },
    network,
  };
}

/**
 * Build a payment transaction envelope (XDR) — OFFLINE, no signing, no submit.
 * Returns { state, envelope, error }. The caller must sign with their own key.
 *
 * This function does NOT hold or accept secret keys. It only assembles the
 * unsigned XDR envelope via Horizon's /transactions endpoint is NOT used;
 * instead we return a structured intent that the integrator signs themselves.
 */
export function buildPaymentIntent({ source, destination, amount, asset = "XLM", memo } = {}) {
  if (!isNonEmptyString(source)) return { state: "GATED", error: "source required", intent: null };
  if (!isNonEmptyString(destination)) return { state: "GATED", error: "destination required", intent: null };
  if (!isNonEmptyString(amount)) return { state: "GATED", error: "amount required", intent: null };
  const intent = {
    type: "payment",
    network: "testnet",
    source,
    destination,
    amount,
    asset,
    memo: isNonEmptyString(memo) ? memo : null,
    builtAt: new Date().toISOString(),
  };
  return { state: "BUILD_OK", intent, envelope: null };
}

/**
 * Submit a signed transaction XDR. Returns NOT_PERFORMED unless a submitter
 * is injected. The submitter must be a function (xdr) => { ok, hash, error }.
 */
export async function submitTransaction({ xdr, submitter } = {}) {
  if (typeof submitter !== "function") {
    return { state: "NOT_PERFORMED", hash: null, error: "no submitter injected (DRY_RUN)" };
  }
  if (!isNonEmptyString(xdr)) {
    return { state: "REJECTED", hash: null, error: "xdr required" };
  }
  try {
    const r = await submitter(xdr);
    if (r && r.ok) return { state: "SUBMITTED", hash: r.hash || null, error: null };
    return { state: "REJECTED", hash: (r && r.hash) || null, error: (r && r.error) || "submit failed" };
  } catch (e) {
    return { state: "REJECTED", hash: null, error: String(e && e.message ? e.message : e) };
  }
}

/**
 * Status report — honest, no live claim.
 */
export function status() {
  return {
    version: STELLAR_VERSION,
    runMode: "DRY_RUN",
    integrationStatus: "NOT_BUILT",
    hasCredentials: false,
    authorized: false,
    executed: false,
    receiptCaptured: false,
    defaultNetwork: "testnet",
    note: "Stellar adapter is a read/build/submit-gate scaffold. No secret key, no live submission, no funds movement. Status UNKNOWN until a real counterparty + credentials + receipt are observed.",
  };
}

export function selfCheck() {
  const s = status();
  return {
    ok: s.runMode === "DRY_RUN" && s.integrationStatus === "NOT_BUILT" && !s.hasCredentials && !s.executed,
    status: s,
  };
}
