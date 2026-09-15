/**
 * Execution Integrity Benchmark (Phase 0 P0.6)
 *
 * ~10,000 deterministically generated executions, split by attack dimension:
 *
 *   valid      2,000  → must be ACCEPTED (VERIFIED at L2)
 *   amount     2,000  → executed value exceeds committed amount   → REJECT
 *   target     2,000  → executed target not committed             → REJECT
 *   selector   1,000  → invoked selector not committed            → REJECT
 *   recipient  1,000  → recipient different from committed        → REJECT
 *   trace      1,000  → structurally self-contradictory trace     → REJECT
 *   replay/state 1,000 → committed validity window violated       → REJECT
 *
 * Metrics (single source of truth for the Phase-0 gate):
 *   - False Accept  (mutant accepted as VERIFIED): target = 0
 *   - False Reject  (valid execution rejected):     target = 0
 *   - Unverifiable  (honest count; UNVERIFIED/INCONCLUSIVE)
 *
 * Deterministic: seeded PRNG (mulberry32), sha256-derived addresses/hashes.
 * CI runnable: `npm run benchmark:10k`. Exit 0 only when all targets hold.
 */

import { createHash } from "node:crypto";

import { hashIntent, hashPolicy, hashTrace } from "@coreguard/canonical";
import { createPolicy } from "@coreguard/policy";
import { normalizeExecution } from "@coreguard/trace";
import { createReceipt } from "@coreguard/evidence";
import { verifyReceipt } from "@coreguard/verifier";

const SEED = 0x63274d6f;
const VALID = 2000;
const AMOUNT = 2000;
const TARGET = 2000;
const SELECTOR = 1000;
const RECIPIENT = 1000;
const TRACE = 1000;
const STATE = 1000;
const TOTAL = VALID + AMOUNT + TARGET + SELECTOR + RECIPIENT + TRACE + STATE;

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

function address(seed, idx) {
  return "0x" + sha256Hex(`addr:${seed}:${idx}`).slice(0, 40);
}

const SIGNER = address(SEED, 0);
const T1 = address(SEED, 1);
const T2 = address(SEED, 2);
const R1 = address(SEED, 3);
const R2 = address(SEED, 4);
const ATTACKER = address(SEED, 5);
const S1 = "0xa9059cbb";
const S2 = "0x23b872dd";

function pad32(hex) {
  return "0x" + hex.slice(2).padStart(64, "0");
}

function transferCalldata(selector, recipient, amount) {
  if (selector === "0x23b872dd") {
    return selector + pad32(SIGNER).slice(2) + pad32(recipient).slice(2) + pad32(amount).slice(2);
  }
  return selector + pad32(recipient).slice(2) + pad32(amount).slice(2);
}

function intentFor(rng, i, overrides = {}) {
  const target = rng() < 0.5 ? T1 : T2;
  const recipient = rng() < 0.5 ? R1 : R2;
  const selector = rng() < 0.5 ? S1 : S2;
  return {
    version: "CGEP/1",
    chainId: "1116",
    signer: SIGNER,
    nonce: String(i + 1),
    validAfter: "0",
    validUntil: "9999999999",
    action: "TRANSFER",
    target,
    selector,
    asset: target,
    amount: "1000",
    recipient,
    constraints: [],
    ...overrides,
  };
}

function policyFor(amount = "1000") {
  return createPolicy({
    policyId: "bp",
    name: "benchmark baseline policy",
    rules: [
      { ruleId: "v", type: "VALUE_LIMIT", severity: "CRITICAL", params: { max: amount } },
      { ruleId: "t", type: "TARGET_ALLOWLIST", severity: "CRITICAL", params: { targets: [T1, T2] } },
      { ruleId: "r", type: "RECIPIENT_ALLOWLIST", severity: "CRITICAL", params: { addresses: [R1, R2] } },
      { ruleId: "s", type: "SELECTOR_ALLOWLIST", severity: "CRITICAL", params: { selectors: [S1, S2] } },
    ],
  });
}

async function execute({ intent, calldataSelector, calldataRecipient, to, value, traceMutate }) {
  const hash = "0x" + sha256Hex("tx", JSON.stringify(intent));
  const blockHash = "0x" + sha256Hex("block", String(intent.nonce));
  const blockNumber = "0x" + (1000 + Number(intent.nonce)).toString(16);

  const tx = {
    hash,
    from: SIGNER,
    to,
    value: "0x" + BigInt(value).toString(16),
    input: transferCalldata(calldataSelector || intent.selector, calldataRecipient || intent.recipient, value),
    nonce: "0x" + BigInt(intent.nonce).toString(16),
    gas: "0x5208",
  };
  const txReceipt = {
    status: "0x1",
    gasUsed: "0x5208",
    blockNumber,
    blockHash,
    timestamp: "0x3e8",
    logs: [],
  };
  const frames = [
    {
      from: SIGNER,
      to,
      gas: "0x5208",
      gasUsed: "0x5208",
      input: tx.input,
      output: "0x",
    },
  ];

  let trace = normalizeExecution(tx, txReceipt, frames, {}, {});
  if (traceMutate) trace = traceMutate(trace);

  const intentHash = await hashIntent(intent);
  const policyHash = await hashPolicy(policyFor(intent.amount));
  const executionTraceHash = await hashTrace(trace);
  const { receiptId, receipt: created } = await createReceipt({
    chainId: "1116",
    txHash: hash,
    blockHash,
    blockNumber: "0x" + (1000 + Number(intent.nonce)).toString(16),
    intentHash,
    policyHash,
    executionTraceHash,
    stateDeltaHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    evidenceRoot: "0x2222222222222222222222222222222222222222222222222222222222222222",
    simulation: {
      blockNumber: "1000",
      blockHash: "0x" + sha256Hex("sim", String(intent.nonce)),
    },
    execution: {
      blockNumber: "0x" + (1000 + Number(intent.nonce)).toString(16),
      blockHash,
    },
    verifierVersion: "0.1.0",
    verificationLevel: "L2",
    levelReason: "benchmark L2 claim (P0.6)",
    traceAvailability: {
      status: "TRACE_AVAILABLE",
      provider: "benchmark (deterministic generation)",
      frames: "1",
      depth: "1",
      coverage: ["from", "to", "value", "calldata", "nonce"],
    },
    result: "VALID",
    checks: [],
  });
  const receipt = { ...created, receiptId };

  const out = await verifyReceipt(receipt, null, intent, policyFor(intent.amount), trace);
  return { result: out.result, verdictCode: out.verdictCode };
}

async function runBucket(name, count, seed, makeCase) {
  const rng = mulberry32(seed);
  const seen = { accepted: 0, rejected: 0, unverifiable: 0 };
  const failures = [];
  const wanted = name === "valid" ? "VERIFIED" : "INVALID";
  for (let i = 0; i < count; i++) {
    const out = await execute(makeCase(rng, i));
    if (out.result === "VERIFIED") seen.accepted++;
    else if (out.result === "INVALID") seen.rejected++;
    else seen.unverifiable++;
    if (failures.length < 3 && out.result !== wanted) {
      failures.push({ i, result: out.result, code: out.verdictCode });
    }
  }
  return { name, count, ...seen, failures, wanted };
}

async function main() {
  const started = Date.now();
  const buckets = [];

  buckets.push(
    await runBucket("valid", VALID, SEED ^ 0x01, (rng, i) => {
      const intent = intentFor(rng, i);
      return { intent, calldataSelector: null, calldataRecipient: null, to: intent.target, value: "1000" };
    })
  );

  buckets.push(
    await runBucket("amount", AMOUNT, SEED ^ 0x02, (rng, i) => {
      const intent = intentFor(rng, i);
      return { intent, calldataSelector: null, calldataRecipient: null, to: intent.target, value: "2000" };
    })
  );

  buckets.push(
    await runBucket("target", TARGET, SEED ^ 0x03, (rng, i) => {
      const intent = intentFor(rng, i);
      return { intent, calldataSelector: null, calldataRecipient: null, to: ATTACKER, value: "1000" };
    })
  );

  buckets.push(
    await runBucket("selector", SELECTOR, SEED ^ 0x04, (rng, i) => {
      const intent = intentFor(rng, i);
      return { intent, calldataSelector: intent.selector === S1 ? S2 : S1, calldataRecipient: intent.recipient, to: intent.target, value: "1000" };
    })
  );

  buckets.push(
    await runBucket("recipient", RECIPIENT, SEED ^ 0x05, (rng, i) => {
      const intent = intentFor(rng, i);
      return { intent, calldataSelector: null, calldataRecipient: ATTACKER, to: intent.target, value: "1000" };
    })
  );

  buckets.push(
    await runBucket("trace", TRACE, SEED ^ 0x06, (rng, i) => {
      const intent = intentFor(rng, i);
      return {
        intent,
        calldataSelector: null,
        calldataRecipient: null,
        to: intent.target,
        value: "1000",
        traceMutate: (t) => ({ ...t, gasUsed: String(BigInt(t.gasUsed) * 2n) }),
      };
    })
  );

  buckets.push(
    await runBucket("replay/state", STATE, SEED ^ 0x07, (rng, i) => {
      const intent = intentFor(rng, i, { validUntil: "500" });
      return { intent, calldataSelector: null, calldataRecipient: null, to: intent.target, value: "1000" };
    })
  );

  const elapsed = Date.now() - started;

  const totalRuns = buckets.reduce((s, b) => s + b.count, 0);
  const accepted = buckets.reduce((s, b) => s + b.accepted, 0);
  const rejected = buckets.reduce((s, b) => s + b.rejected, 0);
  const unverifiable = buckets.reduce((s, b) => s + b.unverifiable, 0);

  const falseAccept = buckets.filter((b) => b.name !== "valid").reduce((s, b) => s + b.accepted, 0);
  const falseReject = buckets.find((b) => b.name === "valid").rejected;
  const sampleFailures = buckets.flatMap((b) =>
    b.failures.map((f) => `  [${b.name} #${f.i}] expected ${b.wanted}, got ${f.result} (${f.code})`)
  );

  console.log("CoreGuard Execution Integrity Benchmark (P0.6)");
  console.log("-".repeat(60));
  for (const b of buckets) {
    console.log(
      `  ${b.name.padEnd(12)} ${String(b.count).padStart(5)} runs  accepted=${b.accepted}  rejected=${b.rejected}  unverifiable=${b.unverifiable}`
    );
  }
  console.log("-".repeat(60));
  console.log(`  total        ${String(totalRuns).padStart(5)} runs  accepted=${accepted}  rejected=${rejected}  unverifiable=${unverifiable}`);
  console.log(`  False Accept : ${falseAccept} (target 0)`);
  console.log(`  False Reject : ${falseReject} (target 0)`);
  console.log(`  Unverifiable : ${unverifiable} (honest count)`);
  console.log(`  elapsed      : ${elapsed}ms`);

  const okCounts = totalRuns === TOTAL;
  const okFalseAccept = falseAccept === 0;
  const okFalseReject = falseReject === 0;
  const okSamples = sampleFailures.length === 0;
  const okTime = elapsed < 120000;
  const ok = okCounts && okFalseAccept && okFalseReject && okSamples && okTime;

  if (sampleFailures.length > 0) {
    console.log("First unexpected verdicts:");
    console.log(sampleFailures.join("\n"));
  }
  console.log(ok ? "Benchmark gate: PASS" : "Benchmark gate: FAIL");
  process.exit(ok ? 0 : 1);
}

main();