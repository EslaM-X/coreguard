#!/usr/bin/env node
/**
 * WS-5 GATE-2 — read-only live capture from a real Core endpoint (Testnet2, 1114).
 *
 * STRICTLY READ-ONLY. No eth_send*, no eth_sign*, no deployment, no mutation.
 * Every HTTP request is recorded in calls.log. Only an explicit allowlist of
 * methods can ever be issued; attempting anything else throws.
 *
 * Outputs (frozen verbatim, raw response body text — NO normalization):
 *   test/conformance/live/fixtures/rpc-chainId.json
 *   test/conformance/live/fixtures/rpc-block-<pinnedHex>.json
 *   test/conformance/live/fixtures/rpc-tx-<hash>.json
 *   test/conformance/live/fixtures/rpc-receipt-<hash>.json
 *   test/conformance/live/fixtures/calls.log
 *   test/conformance/live/fixtures/provenance-manifest.json
 *
 * If a pin or read fails → writes provenance-manifest.json with
 * status:"NOT_RUN" and exits 1. No `latest` is ever used as a pinned state.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ENDPOINT = process.env.CORE_LIVE_RPC ?? "https://rpc.test2.btcs.network";
const EXPECTED_CHAIN_ID = process.env.CORE_LIVE_CHAIN_ID ?? "0x45a"; // 1114 Testnet2
const PIN_OFFSET = Number(process.env.CORE_LIVE_PIN_OFFSET ?? "150");
const HEAD_ROOM_WALK = Number(process.env.CORE_LIVE_WALK ?? "40");

const ALLOWLIST = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
]);

const calls = [];
let callId = 100;

async function rpc(method, params) {
  if (!ALLOWLIST.has(method)) {
    throw new Error(`READ-ONLY VIOLATION — method not in allowlist: ${method}`);
  }
  const id = callId++;
  const started = Date.now();
  const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30000);
  let status = null;
  let text = null;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: ac.signal,
    });
    status = res.status;
    text = await res.text();
  } finally {
    clearTimeout(timer);
  }
  const entry = { id, method, params, status, ms: Date.now() - started, note: "READ-ONLY" };
  calls.push(entry);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${method} — non-JSON response (status ${status})`);
  }
  if (parsed.error) {
    throw new Error(`${method} — RPC error: ${JSON.stringify(parsed.error)}`);
  }
  return { text, parsed, entry };
}

const sha256 = (text) => createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "..", "test", "conformance", "live", "fixtures");

async function main() {
  mkdirSync(outDir, { recursive: true });

  const artifacts = {}; // filename -> sha256
  const writeArtifact = (file, text) => {
    const target = join(outDir, file);
    writeFileSync(target, Buffer.from(text, "utf8"));
    artifacts[file] = sha256(text);
    return target;
  };

  const captureTimeUtc = new Date().toISOString();
  const methods = [];

  try {
    const chainId = await rpc("eth_chainId", []);
    methods.push("eth_chainId");
    const chainIdRaw = chainId.text;
    const chainIdValue = chainId.parsed.result;
    if (String(chainIdValue).toLowerCase() !== EXPECTED_CHAIN_ID) {
      throw new Error(`chainId mismatch: expected ${EXPECTED_CHAIN_ID}, got ${chainIdValue}`);
    }
    writeArtifact("rpc-chainId.json", chainIdRaw + "\n");

    const head = await rpc("eth_blockNumber", []);
    methods.push("eth_blockNumber");
    const headNum = BigInt(head.parsed.result);

    // Pin: a HISTORICAL numbered block (never `latest`). Walk backward only
    // while the pinned block is empty; every candidate is still a pinned
    // numeric block with its own hash.
    let pinNum = headNum - BigInt(PIN_OFFSET);
    let block = null;
    for (let walk = 0; walk < HEAD_ROOM_WALK; walk++) {
      const hex = "0x" + pinNum.toString(16);
      block = await rpc("eth_getBlockByNumber", [hex, false]);
      methods.push("eth_getBlockByNumber");
      const rows = block.parsed.result?.transactions ?? [];
      if (rows.length > 0) break;
      pinNum -= 1n;
      block = null;
    }
    if (!block) {
      throw new Error(`no populated historical block found within ${HEAD_ROOM_WALK} walks (NOT_RUN — no latest fallback)`);
    }
    const blk = block.parsed.result;
    const pinnedHex = "0x" + pinNum.toString(16);
    const pinnedBlockHash = blk.hash;
    const txHashRaw = blk.transactions[0];
    writeArtifact(`rpc-block-${pinnedHex}.json`, block.text + "\n");

    const tx = await rpc("eth_getTransactionByHash", [txHashRaw]);
    methods.push("eth_getTransactionByHash");
    const txObj = tx.parsed.result;
    if (!txObj) throw new Error(`tx ${txHashRaw} not found`);
    writeArtifact(`rpc-tx-${txHashRaw}.json`, tx.text + "\n");

    const receipt = await rpc("eth_getTransactionReceipt", [txHashRaw]);
    methods.push("eth_getTransactionReceipt");
    const rcObj = receipt.parsed.result;
    if (!rcObj) throw new Error(`receipt ${txHashRaw} not found`);
    writeArtifact(`rpc-receipt-${txHashRaw}.json`, receipt.text + "\n");

    writeFileSync(join(outDir, "calls.log"), calls.map((c) => JSON.stringify(c)).join("\n") + "\n", "utf8");

    const manifest = {
      status: "OK",
      chainId: String(chainIdValue),
      rpcEndpointClass: "official-core-testnet2-readonly",
      rpcEndpoint: ENDPOINT,
      note: "READ_ONLY_CAPTURE — allowlist enforced; no eth_send*/eth_sign*/deploy/broadcast ever issued",
      methods,
      pinnedBlockNumber: pinnedHex,
      pinnedBlockHash,
      captureTimeUtc,
      crossBackReferences: {
        txBlockHash: txObj.blockHash,
        receiptBlockHash: rcObj.blockHash,
      },
      artifacts,
    };
    writeFileSync(join(outDir, "provenance-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

    console.log(JSON.stringify(manifest, null, 2));
    console.log(`READ-ONLY CALLS=${calls.length}; allowlist locked; pinned=${pinnedHex}; hash=${pinnedBlockHash}`);
  } catch (err) {
    const manifest = {
      status: "NOT_RUN",
      reason: String(err.message || err),
      methods,
      captureTimeUtc,
      artifacts,
    };
    writeFileSync(join(outDir, "provenance-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
    writeFileSync(join(outDir, "calls.log"), calls.map((c) => JSON.stringify(c)).join("\n") + "\n", "utf8");
    console.error(`NOT_RUN: ${manifest.reason}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(2);
});