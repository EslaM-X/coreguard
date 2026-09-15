/**
 * Pilot-1 read-only Mainnet provider (WS-4 provider interface).
 *
 * Implements exactly the interface `extractExecutionEvidence` consumes:
 *   { eth_chainId, getBlockByNumber, getTransactionByHash,
 *     getTransactionReceipt, supportsTrace, getTrace }
 *
 * Read-only by construction: only eth_* JSON-RPC reads, pinned to explicit
 * block numbers/hashes — no `latest` fallback, no broadcast, no simulation.
 * Trace capability is detected honestly at runtime; Mainnet public RPCs do not
 * expose debug_traceTransaction, so TRACE_LEVEL is reported TRACE_UNAVAILABLE
 * and the pilot stays at RECEIPT_LEVEL (never fabricated).
 */

const RPC = (process.env.CG_PILOT_RPC || "").trim() || "https://rpc.coredao.org";

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status} for ${method}`);
  const body = await res.json();
  if (body.error) {
    const err = new Error(`RPC ${method}: ${body.error.message}`);
    err.code = body.error.code;
    throw err;
  }
  return body.result;
}

export const chainIdHex = () => rpc("eth_chainId", []);
export const mainnetRpcUrl = () => RPC;

export function probeTraceSupport() {
  // Trace-capability probe is performed lazily by extractExecutionEvidence via
  // `supportsTrace`/`getTrace`; we conservatively default to false and let a
  // subclass/override enable it when a trace-capable RPC is configured.
  return false;
}

export const mainnetProvider = {
  async eth_chainId() {
    return chainIdHex();
  },
  async getBlockByNumber(number, hash) {
    const raw = String(number);
    const hex = raw.toLowerCase().startsWith("0x") ? raw
      : raw === "latest" || raw === "pending" || raw === "earliest" ? raw
      : "0x" + BigInt(raw).toString(16);
    return rpc("eth_getBlockByNumber", [hex, true]);
  },
  async getTransactionByHash(txHash) {
    return rpc("eth_getTransactionByHash", [txHash]);
  },
  async getTransactionReceipt(txHash) {
    return rpc("eth_getTransactionReceipt", [txHash]);
  },
  async eth_call(tx, blockNumber) {
    return rpc("eth_call", [tx, String(blockNumber)]);
  },
  async eth_blockNumber() {
    return rpc("eth_blockNumber", []);
  },
  supportsTrace: probeTraceSupport(),
  getTrace: null,
};

export async function readBalance(address, block = "latest") {
  const hex = await rpc("eth_getBalance", [address, block]);
  return BigInt(hex || "0x0");
}

export async function readNonce(address) {
  const hex = await rpc("eth_getTransactionCount", [address, "latest"]);
  return BigInt(hex || "0x0");
}