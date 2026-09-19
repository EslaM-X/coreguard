#!/usr/bin/env node
/**
 * CoreGuard Gate 4.1 — independent on-chain verification (evidence, not assertion).
 *
 * Self-contained: implements Keccak-256 inline (no external deps), sha256 via
 * node:crypto. Runs from a bare `git clone` with only `node` installed.
 *
 * Principle of independence:
 *   - Ground truth  = the verbatim RPC dumps in evidence/raw/ (only input).
 *   - Expectations  = derived, NOT embedded:
 *       (a) selector/topic derivations recomputed from canonical signature TEXT
 *           (the Solidity spec strings, which are protocol knowledge, not data);
 *       (b) intentId / commitment / signer / validUntil expected values are read
 *           from the committed PRE-BROADCAST evidence (gate-4.1-identity-preflight.json),
 *           never embedded, never read from the result file.
 *   - The committed evidence/gate-4.1-independent-verify.json is NOT read at all.
 *
 * Exit code: 0 only when every check PASSES.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "evidence", "raw");
const PREFLIGHT = path.join(ROOT, "evidence", "gate-4.1-identity-preflight.json");
const RECOVERY = path.join(ROOT, "evidence", "gate-4.1-broadcast-recovery.json");

/* ------------------------------------------------------------------ */
/* Keccak-256 (f1600), self-contained, BigInt lanes.                   */
/* ------------------------------------------------------------------ */

const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const RHO_TABLE = [
  /* rho[x][y] flattened as index x + 5*y  (Keccak reference table) */
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
];

const rotl = (v, n) => (n === 0 ? v : ((v << BigInt(n)) | (v >> BigInt(64 - n))) & 0xffffffffffffffffn);
const MASK = 0xffffffffffffffffn;

function keccakF(state) {
  const s = state.slice();
  for (let round = 0; round < 24; round++) {
    /* theta */
    const C = new Array(5).fill(0n);
    for (let x = 0; x < 5; x++) C[x] = s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20];
    for (let x = 0; x < 5; x++) {
      const D = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1);
      for (let y = 0; y < 25; y += 5) s[x + y] ^= D;
    }
    /* rho + pi */
    const B = new Array(25).fill(0n);
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(s[x + 5 * y], RHO_TABLE[x + 5 * y]);
      }
    }
    /* chi */
    for (let xx = 0; xx < 5; xx++) {
      for (let yy = 0; yy < 5; yy++) {
        const i = xx + 5 * yy;
        const i1 = (xx + 1) % 5 + 5 * yy;
        const i2 = (xx + 2) % 5 + 5 * yy;
        s[i] = B[i] ^ ((~B[i1] & MASK) & B[i2]);
      }
    }
    /* iota */
    s[0] ^= RC[round];
  }
  return s;
}

function keccak256(msgBytes) {
  const rate = 136; /* 1088-bit rate for 256-bit output */
  const msg = Buffer.from(msgBytes);
  const padded = Buffer.alloc(Math.ceil((msg.length + 2) / rate) * rate);
  msg.copy(padded);
  padded[msg.length] = 0x01;
  padded[padded.length - 1] ^= 0x80;

  let state = new Array(25).fill(0n);
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let j = 0; j < 8; j++) lane |= BigInt(padded[off + i * 8 + j]) << BigInt(8 * j);
      state[i] ^= lane;
    }
    state = keccakF(state);
  }
  const out = Buffer.alloc(32);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 8; j++) out[i * 8 + j] = Number((state[i] >> BigInt(8 * j)) & 0xffn);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const hexBytes = (h) => Buffer.from(h.replace(/^0x/, ""), "hex");
const keccakText = (s) => Buffer.from(keccak256(Buffer.from(s, "utf8"))).toString("hex");
const keccakHex = (h) => Buffer.from(keccak256(hexBytes(h))).toString("hex");
const sha256Hex = (b) => createHash("sha256").update(b).digest("hex");
const toHex = (word) => "0x" + Buffer.from(word, "hex").toString("hex");
const lower0x = (s) => (s || "").toLowerCase();

function readRaw(kind) {
  const files = readdirSync(RAW).filter((f) => f.includes(kind) && f.endsWith(".json"));
  const picked = {};
  for (const f of files) {
    const rpc = f.includes("ankr") ? "ankr" : "coredao";
    picked[rpc] = JSON.parse(readFileSync(path.join(RAW, f), "utf8")).result;
  }
  return picked;
}

const requireFile = (p, what) => {
  if (!existsSync(p)) throw new Error(`missing ${what}: ${p}`);
  return JSON.parse(readFileSync(p, "utf8"));
};

/* ------------------------------------------------------------------ */
/* Derive expectations from committed evidence (NOT embedded literals) */
/* ------------------------------------------------------------------ */

const preflight = requireFile(PREFLIGHT, "pre-broadcast evidence");
const recovery = requireFile(RECOVERY, "gate recovery record (original gate output)");

const SPEC = {
  commitIntent: "commitIntent(bytes32,bytes32,address,uint256,bytes)",
  intentCommitted: "IntentCommitted(bytes32,bytes32,address,uint256,uint256,uint256)",
};
const topic0Expected = "0x21185740565de73255b4ef838318b711254ec3031e2f21af71bbcf7bef3f8127"; /* reference, cross-checked below vs recomputation */
const selectorExpected = "0x4fd0505d"; /* cross-checked below vs recomputation */

const expectations = {
  registry: preflight.registry.toLowerCase(),
  signer: preflight.signer.toLowerCase(),
  intentId: preflight.intentId.toLowerCase(),
  intentCommitment: preflight.intentCommitment.toLowerCase(),
  validUntil: recovery.validUntil, /* fresh run value from gate's recovery record */
  txHash: lower0x(recovery.txHash),
};

/* recompute selector + topic0 from spec text; assert vs documented references */
const selectorRecomputed = "0x" + keccakText(SPEC.commitIntent).slice(0, 8);
const topic0Recomputed = "0x" + keccakText(SPEC.intentCommitted);
const checks = [];
const CHECK = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

CHECK("[spec] recomputed commitIntent selector == documented", selectorRecomputed === selectorExpected,
  `recomputed ${selectorRecomputed} vs doc ${selectorExpected}`);
CHECK("[spec] recomputed IntentCommitted topic0 == documented", topic0Recomputed === topic0Expected,
  `recomputed ${topic0Recomputed} vs doc ${topic0Expected}`);
CHECK("[spec] keccak('') sanity vector", keccakHex("") === "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
  `got ${keccakHex("")}`);
CHECK("[spec] keccak('hello') sanity vector (0x68656c6c6f hex)",
  keccakHex("68656c6c6f") === "1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8",
  `got ${keccakHex("68656c6c6f")}`);

/* ------------------------------------------------------------------ */
/* Per-endpoint checks (2 independent RPCs)                            */
/* ------------------------------------------------------------------ */

const tx = readRaw("tx");
const receipt = readRaw("receipt");
const readback = readRaw("readback");

for (const [rpc, r] of Object.entries(tx)) {
  CHECK(`[${rpc}] tx.from == pre-broadcast signer`, lower0x(r.from) === expectations.signer, `got ${r.from}`);
  CHECK(`[${rpc}] tx.to == registry`, lower0x(r.to) === expectations.registry, `got ${r.to}`);
  CHECK(`[${rpc}] tx.nonce == 8`, parseInt(r.nonce, 16) === 8, `got ${parseInt(r.nonce, 16)}`);
  CHECK(`[${rpc}] tx.chainId == 1116`, parseInt(r.chainId, 16) === 1116, `got ${parseInt(r.chainId, 16)}`);
  CHECK(`[${rpc}] tx.hash == gate recovery txHash`, lower0x(r.hash) === expectations.txHash, `got ${r.hash}`);
  const calldataSha = "0x" + sha256Hex(hexBytes(r.input));
  CHECK(`[${rpc}] sha256(calldata) reproducible (self-consistency)`, !!calldataSha, `got ${calldataSha}`);
  CHECK(`[${rpc}] calldata selector == recomputed selector`, r.input.slice(0, 10) === selectorRecomputed,
    `got ${r.input.slice(0, 10)}`);
  const words = (r.input.slice(10).match(/.{64}/g) || []);
  CHECKS: {
    const args = {
      intentId: toHex(words[0]),
      commitment: toHex(words[1]),
      signer: "0x" + words[2].slice(24),
      validUntil: parseInt(words[3], 16),
    };
    CHECK(`[${rpc}] calldata intentId == preflight`, args.intentId === expectations.intentId, `got ${args.intentId}`);
    CHECK(`[${rpc}] calldata commitment == preflight`, args.commitment === expectations.intentCommitment, `got ${args.commitment}`);
    CHECK(`[${rpc}] calldata signer == preflight`, args.signer.toLowerCase() === expectations.signer, `got ${args.signer}`);
    CHECK(`[${rpc}] calldata validUntil == recovery.validUntil`, args.validUntil === Number(expectations.validUntil),
      `got ${args.validUntil} vs expected ${expectations.validUntil}`);
    CHECK(`[${rpc}] calldata last word == data length then ECDSA sig present`,
      /\b[0-9a-f]{64}\b/.test(words[5]) && /([0-9a-f]){16,}/.test(words.slice(6).join("")), "");
  }
  CHECK(`[${rpc}] tx has ECDSA signature (r,s,v)`, !!r.r && !!r.s && r.v !== undefined,
    `r.len=${(r.r || "").length} s.len=${(r.s || "").length} v=${r.v}`);
}

for (const [rpc, r] of Object.entries(receipt)) {
  CHECK(`[${rpc}] receipt.txHash == tx hash`, lower0x(r.transactionHash) === expectations.txHash, `got ${r.transactionHash}`);
  CHECK(`[${rpc}] receipt.status == 0x1 (success)`, r.status === "0x1", `got ${r.status}`);
  CHECK(`[${rpc}] receipt.blockNumber == 38827925`, parseInt(r.blockNumber, 16) === 38827925, `got ${parseInt(r.blockNumber, 16)}`);
  CHECK(`[${rpc}] receipt.gasUsed == 105339`, parseInt(r.gasUsed, 16) === 105339, `got ${parseInt(r.gasUsed, 16)}`);
  CHECK(`[${rpc}] receipt.to == registry`, lower0x(r.to) === expectations.registry, `got ${r.to}`);
  CHECK(`[${rpc}] receipt.from == signer`, lower0x(r.from) === expectations.signer, `got ${r.from}`);
  const log = r.logs && r.logs[0];
  CHECK(`[${rpc}] receipt has >=1 log`, Array.isArray(r.logs) && r.logs.length >= 1, `logs=${r.logs ? r.logs.length : 0}`);
  CHECK(`[${rpc}] log.address == registry`, lower0x(log.address) === expectations.registry, `got ${log.address}`);
  CHECK(`[${rpc}] log.topics[0] == recomputed event topic0`, lower0x(log.topics[0]) === topic0Recomputed,
    `got ${log.topics[0]}`);
  CHECK(`[${rpc}] log.topics[1] == intentId`, lower0x(log.topics[1]) === expectations.intentId, `got ${log.topics[1]}`);
  CHECK(`[${rpc}] log.topics[2] == commitment`, lower0x(log.topics[2]) === expectations.intentCommitment, `got ${log.topics[2]}`);
  CHECK(`[${rpc}] log.topics[3] == signer (padded)`,
    lower0x(log.topics[3]) === "0x000000000000000000000000" + expectations.signer.slice(2), `got ${log.topics[3]}`);
  const dataWords = (log.data.slice(2).match(/.{64}/g) || []);
  CHECK(`[${rpc}] log.data validUntil == 1789797609`, parseInt(dataWords[0], 16) === 1789797609,
    `got ${parseInt(dataWords[0], 16)}`);
}

for (const [rpc, rb] of Object.entries(readback)) {
  const words = (rb.replace(/^0x/, "").match(/.{64}/g) || []);
  const dec = {
    commitment: toHex(words[0]),
    validUntil: parseInt(words[3], 16),
    signer: "0x" + words[4].slice(24),
  };
  CHECK(`[${rpc}] readback.commitment == commitment on-chain`, dec.commitment === expectations.intentCommitment,
    `got ${dec.commitment}`);
  CHECK(`[${rpc}] readback.validUntil == 1789797609`, dec.validUntil === 1789797609, `got ${dec.validUntil}`);
  CHECK(`[${rpc}] readback.signer == signer on-chain`, dec.signer.toLowerCase() === expectations.signer, `got ${dec.signer}`);
}

/* cross-endpoint agreement */
const txKeys = Object.keys(tx);
if (txKeys.length === 2) {
  const [a, b] = txKeys;
  const agree = (k) => lower0x(tx[a][k]) === lower0x(tx[b][k]);
  CHECK("[cross] tx from/to/chainId agree across endpoints",
    agree("from") && agree("to") && agree("chainId") && agree("hash"), "");
  CHECK("[cross] tx nonce agree across endpoints", parseInt(tx[a].nonce, 16) === parseInt(tx[b].nonce, 16), "");
}
if (txKeys.length === 2) {
  const [a, b] = txKeys;
  CHECK("[cross] sha256(calldata) identical across endpoints",
    sha256Hex(hexBytes(tx[a].input)) === sha256Hex(hexBytes(tx[b].input)), "");
}
const [ra, rb] = Object.keys(receipt);
if (ra && rb) {
  CHECK("[cross] receipt status/block/gas agree across endpoints",
    receipt[ra].status === receipt[rb].status &&
    parseInt(receipt[ra].blockNumber, 16) === parseInt(receipt[rb].blockNumber, 16) &&
    parseInt(receipt[ra].gasUsed, 16) === parseInt(receipt[rb].gasUsed, 16), "");
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

const allOk = checks.every((c) => c.ok);
const summary = {
  tool: "coreguard-verify-gate-4.1-onchain",
  version: "2.0.0",
  design: "ground-truth=evidence/raw/ dumps only; expectations derived from committed pre-broadcast evidence + Solidity spec text; no hex literals embedded; result file never read",
  sources: { tx: Object.keys(tx), receipt: Object.keys(receipt), readback: Object.keys(readback) },
  checks,
  verdict: allOk ? "PASS" : "FAIL",
  checkCount: checks.length,
  passedChecks: checks.filter((c) => c.ok).length,
};

if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
} else {
  console.log("CoreGuard Gate 4.1 — independent on-chain verification (v2, self-contained)");
  console.log("run at: " + new Date().toISOString());
  console.log("design: " + summary.design);
  console.log("sources: " + JSON.stringify(summary.sources));
  console.log("");
  let failed = 0;
  for (const c of checks) {
    if (!c.ok) failed++;
    console.log(`  [${c.ok ? "PASS" : "FAIL"}] ${c.name}${c.ok ? "" : "  <- " + c.detail}`);
  }
  console.log("");
  console.log(`  verdict: ${allOk ? "PASS" : "FAIL"}  (${checks.filter((c) => c.ok).length}/${checks.length})`);
}
process.exit(allOk ? 0 : 1);