/**
 * WS-5 §7 — Path B: consumer-side INDEPENDENT recomputation.
 *
 * Re-derives `executionEvidenceRef`, `evidenceHash`, and `attestationRef`
 * from the RAW frozen payloads + frozen PRE records through its OWN
 * canonicalizer and domain-hash fold. It shares NO code with
 * `packages/canonical/*`, `packages/evidence/*`, or `packages/execution/*`.
 * Domain constants appear only as documented literals (the CGEP/1 scheme).
 * Equality with Path A is the determinism proof (C-L-6).
 */

import { createHash } from "node:crypto";

const EVIDENCE_DOMAIN = "CGEP/1:EXECUTION-EVIDENCE";
const INTENT_DOMAIN = "CGEP/1:INTENT";
const EVIDENCE_BUNDLE_DOMAIN = "CGEP/1:EVIDENCE";
const ATTESTATION_DOMAIN = "CGEP/1:EXECUTION-ATTESTATION";

/* ---------- independent canonicalizer (mirrors the CGEP/1 rules) ---------- */

export function canon(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isInteger(v)) throw new Error("non-integer number");
    if (!Number.isSafeInteger(v)) throw new Error("unsafe JS Number");
    return String(v);
  }
  if (typeof v === "string") {
    return JSON.stringify(v.startsWith("0x") ? v.toLowerCase() : v);
  }
  if (Array.isArray(v)) return "[" + v.map((e) => canon(e)).join(",") + "]";
  if (typeof v === "object") {
    const keys = Object.keys(v).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  }
  throw new Error(`unsupported type ${typeof v}`);
}

/** sha256(domain || canonicalize(data)) → "0x" + hex. */
export async function dh(domain, data) {
  const enc = new TextEncoder();
  const combined = new Uint8Array(enc.encode(domain).length + enc.encode(canon(data)).length);
  combined.set(enc.encode(domain));
  combined.set(enc.encode(canon(data)), enc.encode(domain).length);
  return "0x" + createHash("sha256").update(combined).digest("hex");
}

/* ---------- raw heuristic helpers (CGEP/1 uint + lowercase hex) ---------- */

export function hexDec(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === "number") return String(v);
  const s = String(v).trim();
  return String(BigInt(/^0x/i.test(s) ? s : s));
}

export const lower = (v) => (v === undefined || v === null ? null : String(v).toLowerCase());

export const normLog = (log) => ({
  address: lower(log.address) || "",
  topics: (log.topics || []).map((t) => lower(t)),
  data: lower(log.data) || "0x",
  logIndex: hexDec(log.logIndex),
});

/* ---------- item derivation from RAW payloads (spec §3.3 vocabulary) ---------- */

/**
 * Build the WS-4 evidence item set + executionRef directly from raw payloads
 * (reimplementation of the documented adapter, no shared code).
 * @param {{chainIdValue:string, block:object, tx:object, receipt:object, txHash:string}} p
 * @returns {{items: object[], executionRef: object}}
 */
function canonicalChainId(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  try {
    if (/^0[xX][0-9a-fA-F]+$/.test(s)) return BigInt(s).toString();
    if (/^\d+$/.test(s)) return BigInt(s).toString();
    return null;
  } catch (e) {
    return null;
  }
}

export function deriveItems({ chainIdValue, block, tx, receipt, txHash }) {
  const t = tx;
  const r = receipt;
  const pinT = { txHash: lower(txHash) };
  const txPin = pinT;
  const items = [];

  const chainIdCanon = canonicalChainId(chainIdValue);
  if (chainIdCanon !== null) {
    items.push({ kind: "CHAIN_ID", source: "provider.eth_chainId", value: chainIdCanon, blockPin: null, txPin: null });
  }

  const txValue = {
    txHash: lower(t.hash),
    from: lower(t.from) || "",
    to: lower(t.to) || "",
    value: hexDec(t.value),
    input: lower(t.input) || "0x",
    nonce: hexDec(t.nonce),
    blockNumber: hexDec(t.blockNumber),
    blockHash: lower(t.blockHash) || "",
  };
  items.push({ kind: "TRANSACTION", source: "provider.getTransactionByHash", value: txValue, blockPin: { blockNumber: hexDec(t.blockNumber), blockHash: lower(t.blockHash) || "" }, txPin });
  // blockPin null in WS-4 when tx absent; here it is present.

const logs = (r.logs || []).map(normLog);
  const receiptValue = {
    txHash: lower(r.transactionHash),
    status: hexDec(r.status),
    gasUsed: hexDec(r.gasUsed),
    transactionIndex: hexDec(r.transactionIndex),
    blockNumber: hexDec(r.blockNumber),
    blockHash: lower(r.blockHash) || "",
    logs,
  };
  items.push({ kind: "RECEIPT", source: "provider.getTransactionReceipt", value: receiptValue, blockPin: { blockNumber: receiptValue.blockNumber, blockHash: receiptValue.blockHash }, txPin });

  for (const log of logs) {
    items.push({ kind: "LOG", source: "receipt.logs", value: log, blockPin: { blockNumber: receiptValue.blockNumber, blockHash: receiptValue.blockHash }, txPin });
  }

  let blockPin = null;
  if (block && (block.number !== undefined || block.hash)) {
    blockPin = { blockNumber: hexDec(block.number), blockHash: lower(block.hash) };
    items.push({ kind: "BLOCK", source: "provider.getBlockByNumber", value: { blockNumber: blockPin.blockNumber, blockHash: blockPin.blockHash }, blockPin, txPin: null });
  }

  const executionRef = {
    txHash: lower(txHash),
    blockNumber: blockPin ? blockPin.blockNumber : txValue.blockNumber,
    blockHash: blockPin ? blockPin.blockHash : txValue.blockHash,
  };
  items.push({ kind: "EXECUTION_REF", source: "derived", value: executionRef, blockPin, txPin });

  return { items, executionRef };
}

/* ---------- fold composition (spec §4/§7) ---------- */

export async function executionEvidenceRefOf(p) {
  const derived = deriveItems(p);
  return dh(EVIDENCE_DOMAIN, { executionRef: derived.executionRef, items: derived.items });
}

export const intentRefOf = (intent) => dh(INTENT_DOMAIN, intent);

/** evidenceHash = H(CGEP/1:EVIDENCE, bundle) — bundle shape mirrors
 * createEvidenceBundle (verifications = the committed profile bytes). */
export const evidenceHashOf = (bundle) => dh(EVIDENCE_BUNDLE_DOMAIN, bundle);

/** attestationRef = H(CGEP/1:EXECUTION-ATTESTATION, record without its ref). */
export const attestationRefOf = async (record) => {
  const { attestationRef: _drop, ...body } = record;
  return dh(ATTESTATION_DOMAIN, body);
};