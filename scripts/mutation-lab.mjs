/**
 * Mutation Laboratory (Phase 0 P0.7)
 *
 * Start from ONE original valid execution (VERIFIED → baseline gate). Then
 * generate 1,000 deterministic mutations across 10 integrity dimensions
 * (100 each): target · recipient · amount · nonce · validity window · trace
 * hash · receipt hashes · receipt id · trace structure · state pinning.
 *
 * Rule: the original verifies; EVERY mutation must be refused by the verifier
 * (anything != VERIFIED is a refusal). Any mutation that still verifies is a
 * MUTANT ESCAPED → the gate FAILs.
 *
 * Deterministic: fixed seed, no randomness/network. CI runnable:
 * `npm run mutation`. Exit 0 only when escaped === 0.
 */

import { createHash } from "node:crypto";

import { hashIntent, hashPolicy, hashTrace } from "@coreguard/canonical";
import { createPolicy } from "@coreguard/policy";
import { normalizeExecution } from "@coreguard/trace";
import { createReceipt } from "@coreguard/evidence";
import { verifyReceipt } from "@coreguard/verifier";

const SEED = 0x600dface;
const MUTATIONS = 1000;
const HEX = "0123456789abcdef";

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sha256Hex(...parts) {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest("hex");
}

const pad32 = (hex) => "0x" + hex.slice(2).padStart(64, "0");
const S1 = "0xa9059cbb";

const SIGNER = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x3333333333333333333333333333333333333333";
const RCP = "0x2222222222222222222222222222222222222222";
const ATTACKER = "0x4444444444444444444444444444444444444444";

const intent = {
  version: "CGEP/1",
  chainId: "1116",
  signer: SIGNER,
  nonce: "1",
  validAfter: "0",
  validUntil: "9999999999",
  action: "TRANSFER",
  target: TOKEN,
  selector: S1,
  asset: TOKEN,
  amount: "1000",
  recipient: RCP,
  constraints: [],
};

function baselinePolicy() {
  return createPolicy({
    policyId: "ml",
    name: "mutation-lab baseline",
    rules: [
      { ruleId: "v", type: "VALUE_LIMIT", severity: "CRITICAL", params: { max: "1000" } },
      { ruleId: "t", type: "TARGET_ALLOWLIST", severity: "CRITICAL", params: { targets: [TOKEN] } },
      { ruleId: "r", type: "RECIPIENT_ALLOWLIST", severity: "CRITICAL", params: { addresses: [RCP] } },
      { ruleId: "s", type: "SELECTOR_ALLOWLIST", severity: "CRITICAL", params: { selectors: [S1] } },
    ],
  });
}

const policy = baselinePolicy();

function transferCalldata(to, amount) {
  return S1 + pad32(to).slice(2) + pad32(amount).slice(2);
}

function flipHexAt(value, pos) {
  const chars = value.split("");
  const idx = pos % (chars.length - 2);
  const c = HEX.indexOf(chars[idx + 2]);
  chars[idx + 2] = HEX[(c + 1) % 16];
  return chars.join("");
}

async function buildBase() {
  const hash = "0x" + sha256Hex("base-tx");
  const blockHash = "0x" + sha256Hex("base-block");
  const blockNumber = "0x3e8";
  const input = transferCalldata(RCP, "1000");

  const tx = { hash, from: SIGNER, to: TOKEN, value: "0x3e8", input, nonce: "0x1", gas: "0x5208" };
  const txReceipt = { status: "0x1", gasUsed: "0x5208", blockNumber, blockHash, timestamp: "0x3e8", logs: [] };
  const frames = [{ from: SIGNER, to: TOKEN, gas: "0x5208", gasUsed: "0x5208", input, output: "0x" }];
  const trace = normalizeExecution(tx, txReceipt, frames, {}, {});

  const intentHash = await hashIntent(intent);
  const policyHash = await hashPolicy(policy);
  const executionTraceHash = await hashTrace(trace);
  const { receiptId, receipt: created } = await createReceipt({
    chainId: "1116",
    txHash: hash,
    blockHash,
    blockNumber: "0x3e8",
    intentHash,
    policyHash,
    executionTraceHash,
    stateDeltaHash: "0x" + "11".repeat(32),
    evidenceRoot: "0x" + "22".repeat(32),
    simulation: { blockNumber: "1000", blockHash: "0x" + "c".repeat(64) },
    execution: { blockNumber: "0x3e8", blockHash },
    verifierVersion: "0.1.0",
    verificationLevel: "L2",
    levelReason: "mutation-lab original L2 claim",
    traceAvailability: { status: "TRACE_AVAILABLE", provider: "mutation-lab", frames: "1", depth: "1", coverage: [] },
    result: "VALID",
    checks: [],
  });
  return { receipt: { ...created, receiptId }, intent, policy, trace };
}

function mutate(target, cat, k) {
  const { receipt, intent, policy, trace } = target;

  switch (cat) {
    // 0 — target substitution (bit flip on emitted destination address)
    case 0:
      return { receipt, intent, policy, trace: { ...trace, to: flipHexAt(trace.to, k) } };
    // 1 — recipient substitution (calldata decode differs from committed recipient)
    case 1: {
      const badTo = flipHexAt(RCP, k + 3);
      const mutated = { ...trace, calldata: transferCalldata(badTo, "1000") };
      return { receipt, intent, policy, trace: mutated };
    }
    // 2 — amount inflation: executed value exceeds the committed amount
    case 2: {
      const v = String(BigInt(trace.value) + BigInt(k + 1));
      return { receipt, intent, policy, trace: { ...trace, value: v } };
    }
    // 3 — nonce mismatch vs committed intent
    case 3: {
      const n = String(BigInt(intent.nonce) + BigInt(k + 1));
      return { receipt, intent, policy, trace: { ...trace, nonce: n } };
    }
    // 4 — validity window breached (mined after validUntil)
    case 4: {
      const beyond = String(BigInt(intent.validUntil) + BigInt(k + 1));
      return { receipt, intent, policy, trace: { ...trace, blockTimestamp: beyond } };
    }
    // 5 — trace payload drift (calldata mutated → rejected by TRACE_HASH)
    case 5: {
      const mutated = { ...trace, calldata: flipHexAt(trace.calldata, k + 7) };
      return { receipt, intent, policy, trace: mutated };
    }
    // 6 — receipt committed intent-hash tampered
    case 6:
      return { receipt: { ...receipt, intentHash: flipHexAt(receipt.intentHash, k + 11) }, intent, policy, trace };
    // 7 — receipt id tampered
    case 7:
      return { receipt: { ...receipt, receiptId: flipHexAt(receipt.receiptId, k + 17) }, intent, policy, trace };
    // 8 — self-contradictory trace structure (gas > gasLimit → replay FAIL)
    case 8: {
      const mutated = { ...trace, gasUsed: String(BigInt(trace.gasUsed) + BigInt(1 + k)) };
      return { receipt, intent, policy, trace: mutated };
    }
    // 9 — state pinning destroyed (missing execution/simulation pin)
    case 9: {
      const { simulation, ...rest } = receipt;
      void simulation;
      return { receipt: { ...rest }, intent, policy, trace };
    }
    default:
      throw new Error(`unknown mutation category ${cat}`);
  }
}

async function main() {
  const base = await buildBase();

  // Baseline gate: the original MUST verify — otherwise the lab is malformed.
  const baseVerdict = await verifyReceipt(base.receipt, null, base.intent, base.policy, base.trace);
  if (baseVerdict.result !== "VERIFIED") {
    console.error(`mutation-lab: original execution did NOT verify (${baseVerdict.result} ${baseVerdict.verdictCode})`);
    process.exit(2);
  }

  const started = Date.now();
  let escaped = 0;
  let refused = 0;
  let unverifiable = 0;
  const escapes = [];

  for (let i = 0; i < MUTATIONS; i++) {
    const cat = i % 10;
    const k = Math.floor(i / 10);
    const variant = mutate(base, cat, k);
    const out = await verifyReceipt(variant.receipt, null, variant.intent, variant.policy, variant.trace);
    if (out.result === "VERIFIED") {
      escaped++;
      if (escapes.length < 5) escapes.push({ i, cat, code: out.verdictCode });
    } else if (out.result === "UNVERIFIED" || out.result === "INCONCLUSIVE") {
      unverifiable++;
    } else {
      refused++;
    }
  }

  const elapsed = Date.now() - started;

  console.log("CoreGuard Mutation Laboratory (P0.7)");
  console.log("-".repeat(60));
  console.log(`  baseline              : VERIFIED (gate) — original execution validates`);
  console.log(`  mutations run         : ${MUTATIONS}`);
  console.log(`  escaped (VERIFIED)    : ${escaped}  (target 0 — any is a CI FAIL)`);
  console.log(`  refused (INVALID)     : ${refused}`);
  console.log(`  unverifiable (blocked): ${unverifiable}`);
  console.log(`  elapsed               : ${elapsed}ms`);
  console.log("-".repeat(60));

  if (escapes.length > 0) {
    console.log("Escaped mutants (first 5):");
    for (const e of escapes) console.log(`  #[${e.i}] category ${e.cat} — verdict ${e.code}`);
  }

  const ok = escaped === 0;
  console.log(ok ? "Mutation Lab gate: PASS — 1000/1000 refused." : `Mutation Lab gate: FAIL — ${escaped} escaped.`);
  process.exit(ok ? 0 : 1);
}

main();