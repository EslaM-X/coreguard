/**
 * WS-5 — raw-wire replay of the frozen live-envelope fixtures.
 *
 * Turns the captured raw JSON-RPC envelopes (test/conformance/live/fixtures/*)
 * into a provider-shaped surface for the WS-4 boundary (`extractExecutionEvidence` /
 * `verifyExecutionEvidence`). Read-only by construction: the only methods exposed
 * are the five capture allowlist reads; anything else is impossible to invoke here.
 *
 * Tamper modes (adversarial corpus, §6) mutate ONE dimension of a frozen payload:
 *   chainIdOverride — replay eth_chainId with a different value
 *   blockHash       — rewrite the BLOCK result hash
 *   tx              — rewrite fields of the TRANSACTION result (from/to/input/value/blockHash)
 *   receipt         — rewrite fields of the RECEIPT result (blockHash/status/logs)
 *   missingState    — getBlockByNumber throws (historical state unavailable)
 *
 * IN-W4-3 is enforced inside the replay: `latest`/`earliest`/`pending`/unpinned
 * reads throw; a getBlockByNumber for a non-pinned block number throws.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FIX_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadResult(prefix) {
  const file = readdirSync(FIX_DIR).find((f) => f.startsWith(prefix));
  if (!file) throw new Error(`fixture "${prefix}*" not found in ${FIX_DIR}`);
  return JSON.parse(readFileSync(join(FIX_DIR, file), "utf8")).result;
}

export const MANIFEST = JSON.parse(readFileSync(join(FIX_DIR, "provenance-manifest.json"), "utf8"));
export const CHAIN_ID_HEX = MANIFEST.chainId;
export const PIN_BLOCK_NUMBER_HEX = MANIFEST.pinnedBlockNumber;
export const PIN_BLOCK_HASH = MANIFEST.pinnedBlockHash;
export const PIN_BLOCK_NUMBER_DEC = String(BigInt(PIN_BLOCK_NUMBER_HEX));

export const rawBlock = loadResult("rpc-block-");
export const rawTx = loadResult("rpc-tx-");
export const rawReceipt = loadResult("rpc-receipt-");
export const TX_HASH = rawTx.hash;

const clone = (o) => JSON.parse(JSON.stringify(o));

const FORBIDDEN = /^(eth_send|eth_sign|personal_|eth_call\b|eth_estimateGas|eth_newFilter|db_|admin_|debug_|miner_)/i;
const WRITE_TRACE = ["eth_sendRawTransaction", "eth_sendTransaction", "eth_sign", "personal_sign", "personal_sendTransaction", "eth_deploy"];

/**
 * @param {object} [tamper]  adversarial mutations (see header)
 * @returns provider-shaped object with .calls log (read-only proof)
 */
export function makeReplay(tamper = {}) {
  const calls = [];
  const provider = {
    calls,
    tamper,
    supportsTrace: Boolean(tamper.supportsTrace),
    async eth_chainId() {
      calls.push("eth_chainId");
      return tamper.chainIdOverride ?? CHAIN_ID_HEX;
    },
    async getBlockByNumber(num, hash) {
      calls.push("getBlockByNumber");
      const n = num === null || num === undefined ? "" : String(num).toLowerCase();
      if (n === "" || n === "latest" || n === "earliest" || n === "pending") {
        throw new Error("IN-W4-3: unpinned (latest/earliest/pending) block read attempted");
      }
      if (tamper.missingState) {
        throw new Error("STATE_UNAVAILABLE: historical state missing at pinned ref");
      }
      if (n !== "0x" + PIN_BLOCK_NUMBER_HEX.toLowerCase().slice(2) && n !== PIN_BLOCK_NUMBER_DEC) {
        throw new Error("IN-W4-3: block read at non-pinned number");
      }
      if (hash && String(hash).toLowerCase() !== PIN_BLOCK_HASH.toLowerCase()) {
        throw new Error("IN-W4-3: block read at non-pinned hash");
      }
      const b = clone(rawBlock);
      if (tamper.blockHash) b.hash = tamper.blockHash;
      return b;
    },
    async getTransactionByHash(txHash) {
      calls.push("getTransactionByHash");
      if (String(txHash).toLowerCase() !== rawTx.hash) {
        throw new Error(`tx ${txHash} not found in frozen corpus`);
      }
      const t = clone(rawTx);
      if (tamper.tx) Object.assign(t, tamper.tx);
      return t;
    },
    async getTransactionReceipt(txHash) {
      calls.push("getTransactionReceipt");
      if (String(txHash).toLowerCase() !== rawReceipt.transactionHash) {
        throw new Error(`receipt ${txHash} not found in frozen corpus`);
      }
      const r = clone(rawReceipt);
      if (tamper.receipt) Object.assign(r, tamper.receipt);
      return r;
    },
    async getTrace() {
      calls.push("getTrace");
      throw new Error("TRACE_UNAVAILABLE: provider has no trace capability (WS-5 gate)");
    },
  };

  /** Read-only guard (C-L-8 / §6): structurally impossible to issue writes here,
   * but the call log is also scanned for any forbidden method name. */
  Object.defineProperty(provider, "readOnlyProof", {
    enumerable: true,
    get() {
      const all = calls.map((c) => String(c));
      return {
        calls: all,
        onlyReads: all.every((c) => !FORBIDDEN.test(c)),
        noWrites: WRITE_TRACE.every((w) => !all.includes(w)),
      };
    },
  });

  return provider;
}