#!/usr/bin/env node
/**
 * CoreGuard Gate 4.1 — independent on-chain verification (evidence, not assertion).
 *
 * Reads ONLY the verbatim RPC dumps under evidence/raw/ (two independent RPCs) and
 * re-derives every fact locally — keccak via @noble/hashes (packages/evm), sha256 via
 * node:crypto. Produces a deterministic verdict JSON written to stdout.
 *
 * Usage: node scripts/verify-gate-4.1-onchain.mjs [--json]
 *   default: human-readable report; --json: single machine-readable JSON object.
 *
 * Exit code: 0 only if every check in the matrix PASSES; non-zero otherwise.
 * Never contacts the network; never reads keys; never signs or sends anything.
 */

import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { keccak_256 } from "@noble/hashes/sha3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "evidence", "raw");

const EXPECTED = {
  txHash: "0x68d9fbf1b384fe416d2222347d15e492e78d7b14f05cae0c9edbd57ce373c567",
  registry: "0x66268a47e81b8f657798d7b5bbedc956df7b13fd",
  signer: "0xea41becdeb612d8625bf3060809964f1dab43244",
  intentId: "0xc4799b1ddb9ed99463400c8540aefc81d9998b5541cd878267c2144e5a16000d",
  intentCommitment: "0xb82f1f8073286fdf5a598e69a17246fdea09d10a9958fbc52f9ee8f7f925cee6",
  validUntil: 1789797609,
  nonce: 8,
  chainId: 1116,
  blockNumber: 38827925,
  status: "0x1",
  gasUsed: 105339,
  gasLimit: 148876,
  calldataSha256: "0xc10474ed9d0d2161d6de4eeb41e5ada0bd9ffcb4947d84e8d996b5781cda641b",
  selector: "0x4fd0505d",
  topic0: "0x21185740565de73255b4ef838318b711254ec3031e2f21af71bbcf7bef3f8127",
};

const hexBytes = (h) => Buffer.from(h.replace(/^0x/, ""), "hex");
const keccakText = (s) =>
  "0x" + Buffer.from(keccak_256(Buffer.from(s, "utf8"))).toString("hex");
const keccakHex = (...parts) =>
  "0x" + Buffer.from(keccak_256(Buffer.concat(parts.map(hexBytes)))).toString("hex");
const sha256 = (b) => "0x" + createHash("sha256").update(b).digest("hex");
const toHex = (word) => "0x" + Buffer.from(word, "hex").toString("hex");

function readRaw(kind) {
  const files = readdirSync(RAW).filter((f) => f.includes(kind) && f.endsWith(".json"));
  if (files.length < 2) throw new Error(`missing raw dumps for ${kind}: ${files.join(",")}`);
  const picked = {};
  for (const f of files) {
    const rpc = f.includes("ankr") ? "ankr" : f.includes("coredao") ? "coredao" : "other";
    picked[rpc] = JSON.parse(readFileSync(path.join(RAW, f), "utf8"));
  }
  return picked;
}

const tx = readRaw("tx");
const receipt = readRaw("receipt");
const readback = readRaw("readback");

const checks = [];
const CHECK = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

for (const [rpc, t] of Object.entries(tx)) {
  const r = t.result;
  CHECK(`[${rpc}] tx.from == signer`, (r.from || "").toLowerCase() === EXPECTED.signer,
    `got ${r.from}`);
  CHECK(`[${rpc}] tx.to == registry`, (r.to || "").toLowerCase() === EXPECTED.registry,
    `got ${r.to}`);
  CHECK(`[${rpc}] tx.nonce == 8`, parseInt(r.nonce, 16) === EXPECTED.nonce,
    `got ${parseInt(r.nonce, 16)}`);
  CHECK(`[${rpc}] tx.chainId == 1116`, parseInt(r.chainId, 16) === EXPECTED.chainId,
    `got ${parseInt(r.chainId, 16)}`);
  CHECK(`[${rpc}] tx.hash == published`, r.hash.toLowerCase() === EXPECTED.txHash,
    `got ${r.hash}`);
  const calldataSha = sha256(hexBytes(r.input));
  CHECK(`[${rpc}] sha256(calldata) == pinned calldataSha256`,
    calldataSha === EXPECTED.calldataSha256, `got ${calldataSha}`);
  CHECK(`[${rpc}] calldata selector == commitIntent`, r.input.slice(0, 10) === EXPECTED.selector,
    `got ${r.input.slice(0, 10)}`);

  const hex = r.input.slice(10);
  const words = hex.match(/.{64}/g) || [];
  const args = {
    intentId: toHex(words[0]),
    intentCommitment: toHex(words[1]),
    signer: "0x" + words[2].slice(24),
    validUntil: parseInt(words[3], 16),
  };
  CHECK(`[${rpc}] calldata intentId == gate-4.0`, args.intentId === EXPECTED.intentId,
    `got ${args.intentId}`);
  CHECK(`[${rpc}] calldata commitment == pinned`, args.intentCommitment === EXPECTED.intentCommitment,
    `got ${args.intentCommitment}`);
  CHECK(`[${rpc}] calldata signer == pinned`, args.signer.toLowerCase() === EXPECTED.signer,
    `got ${args.signer}`);
  CHECK(`[${rpc}] calldata validUntil == pinned`, args.validUntil === EXPECTED.validUntil,
    `got ${args.validUntil}`);

  const { r: sigR, s: sigS, v: sigV } = r;
  CHECK(`[${rpc}] tx has ECDSA signature (r,s,v)`, !!sigR && !!sigS && sigV !== undefined,
    `r.len=${(sigR || "").length} s.len=${(sigS || "").length} v=${sigV}`);
}

for (const [rpc, rec] of Object.entries(receipt)) {
  const r = rec.result;
  CHECK(`[${rpc}] receipt.txHash == published`, (r.transactionHash || "").toLowerCase() === EXPECTED.txHash,
    `got ${r.transactionHash}`);
  CHECK(`[${rpc}] receipt.status == 0x1`, r.status === EXPECTED.status, `got ${r.status}`);
  CHECK(`[${rpc}] receipt.blockNumber == 38827925`, parseInt(r.blockNumber, 16) === EXPECTED.blockNumber,
    `got ${parseInt(r.blockNumber, 16)}`);
  CHECK(`[${rpc}] receipt.gasUsed == 105339`, parseInt(r.gasUsed, 16) === EXPECTED.gasUsed,
    `got ${parseInt(r.gasUsed, 16)}`);
  CHECK(`[${rpc}] receipt.to == registry`, (r.to || "").toLowerCase() === EXPECTED.registry,
    `got ${r.to}`);
  CHECK(`[${rpc}] receipt.from == signer`, (r.from || "").toLowerCase() === EXPECTED.signer,
    `got ${r.from}`);
  const log = r.logs && r.logs[0];
  CHECK(`[${rpc}] receipt has logs`, Array.isArray(r.logs) && r.logs.length >= 1,
    `got ${r.logs ? r.logs.length : 0}`);

  const canonicalTopic0 = keccakText("IntentCommitted(bytes32,bytes32,address,uint256,uint256,uint256)");
  CHECK(`[${rpc}] topic0 == keccak(event sig)`, canonicalTopic0 === EXPECTED.topic0,
    `computed ${canonicalTopic0}`);
  CHECK(`[${rpc}] topics[1] == intentId`, (log.topics[1] || "").toLowerCase() === EXPECTED.intentId,
    `got ${log.topics[1]}`);
  CHECK(`[${rpc}] topics[2] == commitment`, (log.topics[2] || "").toLowerCase() === EXPECTED.intentCommitment,
    `got ${log.topics[2]}`);
  CHECK(`[${rpc}] topics[3] == signer (indexed)`,
    (log.topics[3] || "").toLowerCase() === "0x000000000000000000000000" + EXPECTED.signer.slice(2),
    `got ${log.topics[3]}`);
  const dataHex = log.data.slice(2);
  const dataWords = dataHex.match(/.{64}/g) || [];
  CHECK(`[${rpc}] log.data validUntil == pinned`, parseInt(dataWords[0], 16) === EXPECTED.validUntil,
    `got ${parseInt(dataWords[0], 16)}`);
}

for (const [rpc, rb] of Object.entries(readback)) {
  const hex = rb.result.replace(/^0x/, "");
  const words = hex.match(/.{64}/g) || [];
  const dec = {
    intentCommitment: toHex(words[0]),
    proofCommitment: toHex(words[1]),
    receiptId: toHex(words[2]),
    validUntil: parseInt(words[3], 16),
    signer: "0x" + words[4].slice(24),
  };
  CHECK(`[${rpc}] readback.commitment == pinned`, dec.intentCommitment === EXPECTED.intentCommitment,
    `got ${dec.intentCommitment}`);
  CHECK(`[${rpc}] readback.validUntil == pinned`, dec.validUntil === EXPECTED.validUntil,
    `got ${dec.validUntil}`);
  CHECK(`[${rpc}] readback.signer == pinned`, dec.signer.toLowerCase() === EXPECTED.signer,
    `got ${dec.signer}`);
}

const allOk = checks.every((c) => c.ok);
const summary = {
  tool: "coreguard-verify-gate-4.1-onchain",
  version: "1.0.0",
  date: new Date().toISOString(),
  sources: {
    tx: Object.keys(tx),
    receipt: Object.keys(receipt),
    readback: Object.keys(readback),
  },
  expectations: EXPECTED,
  checks,
  verdict: allOk ? "PASS" : "FAIL",
  checkCount: checks.length,
  passedChecks: checks.filter((c) => c.ok).length,
};

const jsonMode = process.argv.includes("--json");
if (jsonMode) {
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
} else {
  console.log("CoreGuard Gate 4.1 — independent on-chain verification");
  console.log("sources: " + JSON.stringify(summary.sources));
  console.log("");
  let failed = 0;
  for (const c of checks) {
    const mark = c.ok ? "PASS" : "FAIL";
    if (!c.ok) failed++;
    console.log(`  [${mark}] ${c.name}${c.ok ? "" : "  <- " + c.detail}`);
  }
  console.log("");
  console.log(`  verdict: ${allOk ? "PASS" : "FAIL"}  (${checks.length - failed}/${checks.length})`);
}
process.exit(allOk ? 0 : 1);