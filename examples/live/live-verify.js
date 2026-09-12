/**
 * CoreGuard Live E2E — verify a real transaction on Core Testnet2
 *
 * Captures a real transaction from the chain (latest block, or --hash),
 * normalizes it into a deterministically verifiable execution trace,
 * builds the Evidence Bundle + Execution Receipt, and runs the
 * independent verifier — end to end, on live chain data.
 *
 * NOTE: In a production flow the Intent + Policy are committed BEFORE
 * execution (pre-declared authorization). This demo infers them
 * post-hoc from the observed transaction so the machinery can be
 * exercised against any real Testnet2 transaction. Inferred artifacts
 * are explicitly labeled so no one mistakes the demo for a real claim.
 *
 * Usage:
 *   node examples/live/live-verify.js                 # latest block, first eligible tx
 *   node examples/live/live-verify.js --hash 0x...    # specific transaction
 *   node examples/live/live-verify.js --rpc <url>     # custom RPC
 *   node examples/live/live-verify.js --out <dir>     # output dir (default ./output)
 */

import { writeFile, mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

import { canonicalize, hashIntent, hashPolicy, hashTrace } from "../../packages/canonical/index.js";
import { CoreTestnet2Adapter } from "../../packages/canonical/chain-adapter.js";
import { normalizeExecution, computeStateDelta } from "../../packages/trace/index.js";
import { evaluatePolicy } from "../../packages/policy/index.js";
import { createEvidenceBundle, createReceipt } from "../../packages/evidence/index.js";
import { verifyReceipt } from "../../packages/verifier/index.js";
import { extractRecipient } from "../../packages/cli/src/index.js";

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { rpc: "https://rpc.test2.btcs.network", hash: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--hash") args.hash = argv[i + 1];
    if (argv[i] === "--rpc") args.rpc = argv[i + 1];
    if (argv[i] === "--out") args.out = argv[i + 1];
  }
  return args;
}

const toDecimal = (hex) => String(BigInt(hex));
const keccakLike = (s) => "0x" + createHash("sha256").update(s).digest("hex");

function inferIntent(tx, chainId) {
  const isTransfer = tx.value && tx.value !== "0x0" && tx.value !== "0";
  return {
    version: "CGEP/1",
    chainId: String(chainId),
    signer: tx.from.toLowerCase(),
    nonce: toDecimal(tx.nonce || "0x0"),
    validAfter: "0",
    validUntil: "4999999999",
    action: isTransfer ? "TRANSFER" : "CALL",
    target: (tx.to || "").toLowerCase(),
    selector: !isTransfer && tx.input && tx.input.length > 10 ? tx.input.slice(0, 10) : "0x",
    asset: isTransfer ? "0x0000000000000000000000000000000000000000" : (tx.to || "").toLowerCase(),
    amount: toDecimal(tx.value || "0x0"),
    recipient: isTransfer ? (tx.to || "").toLowerCase() : (tx.to || "").toLowerCase(),
    inferred: true,
  };
}

function buildPolicy(intent) {
  const rules = [
    {
      ruleId: "VALUE_001",
      type: "VALUE_LIMIT",
      params: { max: intent.amount },
      severity: "CRITICAL",
    },
    {
      ruleId: "TARGET_001",
      type: "TARGET_ALLOWLIST",
      params: { targets: [intent.target] },
      severity: "CRITICAL",
    },
    {
      ruleId: "DEADLINE_001",
      type: "DEADLINE",
      params: { deadline: intent.validUntil },
      severity: "HIGH",
    },
  ];
  if (intent.selector && intent.selector !== "0x") {
    rules.push({
      ruleId: "SELECTOR_001",
      type: "SELECTOR_ALLOWLIST",
      params: { selectors: [intent.selector] },
      severity: "CRITICAL",
    });
  }
  return {
    version: "CGEP/1",
    policyId: "0x" + "ff".repeat(20),
    name: "Inferred Live Policy",
    rules,
    inferred: true,
  };
}

async function captureState(adapter, blockNumber, addresses) {
  const preBlock = blockNumber - 1;
  const state = { pre: {}, post: {} };
  for (const addr of addresses) {
    try {
      const pre = await adapter.getState(preBlock, addr);
      const post = await adapter.getState(blockNumber, addr);
      state.pre[addr] = pre.balance;
      state.post[addr] = post.balance;
    } catch {
      state.pre[addr] = "0x0";
      state.post[addr] = "0x0";
    }
  }
  return state;
}

async function main() {
  const args = parseArgs(process.argv);
  const OUT_DIR = resolve(here, args.out || "output");
  const adapter = new CoreTestnet2Adapter(args.rpc);

  console.log("");
  console.log("  CoreGuard Live E2E  ·  Core Testnet2");
  console.log("  ───────────────────────────────────────────");

  // 1. Resolve the transaction
  let tx;
  if (args.hash) {
    tx = await adapter.getTransaction(args.hash);
    if (!tx) throw new Error(`Transaction not found: ${args.hash}`);
  } else {
    const latest = await adapter.rpcCall("eth_getBlockByNumber", ["latest", true]);
    const eligible =
      latest.transactions?.filter((t) => t.to && t.input && t.input !== "0x") || [];
    const withValue = eligible.filter((t) => t.value && t.value !== "0x0");
    tx = (withValue[0] || eligible[0]);
    if (!tx) throw new Error("Latest block has no eligible transactions");
  }

  const chainId = parseInt(await adapter.getChainId(), 16);
  console.log(`  Chain ID:      ${chainId}`);
  console.log(`  Transaction:   ${tx.hash}`);

  // 2. Chain capture
  const receipt = await adapter.getReceipt(tx.hash);
  const block = await adapter.getBlock(parseInt(receipt.blockNumber, 16));
  const blockNumber = parseInt(receipt.blockNumber, 16);

  // 3. Pre/post state at block boundaries (balance-based state delta)
  const addresses = [tx.from, tx.to].filter(Boolean);
  const state = await captureState(adapter, blockNumber, addresses);
  const stateDeltaCtx = { pre: state.pre, post: state.post };

  // 4. Optional node-level tracing (available on archive RPCs with debug namespace)
  let trace = null;
  try {
    trace = await adapter.traceTransaction(tx.hash);
    console.log(`  Debug trace:   available (full L2 replay input)`);
  } catch {
    console.log(`  Debug trace:   not exposed on this RPC — using balance state delta (L1)`);
  }

  // 5. Deterministic normalization
  const normalizedTrace = normalizeExecution(
    tx,
    { ...receipt, timestamp: block.timestamp },
    trace,
    state.pre,
    state.post
  );
  normalizedTrace.blockTimestamp = block.timestamp;

  const intent = inferIntent(tx, chainId);
  const policy = buildPolicy(intent);
  const recipient = extractRecipient(normalizedTrace) || intent.recipient || "0x0000000000000000000000000000000000000000";

  console.log(`  From:          ${tx.from}`);
  console.log(`  To:            ${tx.to || "(create)"}`);
  console.log(`  Value:         ${toDecimal(tx.value || "0x0")}`);
  console.log(`  Block:         ${blockNumber}  (${block.hash})`);

  // 6. Policy evaluation
  const policyResult = evaluatePolicy(policy, {
    value: normalizedTrace.value,
    target: normalizedTrace.to,
    recipient,
    selector: normalizedTrace.calldata.slice(0, 10),
    blockTimestamp: block.timestamp,
    slippageBps: "0",
  });
  console.log("");
  console.log("  ── POLICY ────────────────────────────────");
  const ruleType = (id) => (policy.rules.find((r) => r.ruleId === id) || {}).type || "";
  for (const r of policyResult.rules) {
    const mark = r.result === "PASS" ? "✓" : "✗";
    console.log(`  ${mark} ${r.ruleId}  ${ruleType(r.ruleId)}  → ${r.result}${r.expected ? ` (${r.expected})` : ""}`);
  }
  console.log(`  Policy result: ${policyResult.result}`);
  const result = policyResult.result === "SATISFIED" ? "VALID" : "INVALID";

  // 7. Evidence bundle + receipt
  const intentHash = await hashIntent(intent);
  const policyHash = await hashPolicy(policy);
  const traceHash = await hashTrace(normalizedTrace);
  const stateDelta = computeStateDelta(normalizedTrace);
  const stateDeltaHash = keccakLike(canonicalize(stateDelta));

  const evidence = await createEvidenceBundle({
    intentHash,
    policyHash,
    traceHash,
    stateDeltaHash,
    result,
    verifications: [{ level: "L1", engine: "coreguard-v0.1.0" }],
    simulation: { blockNumber: String(blockNumber), blockHash: block.hash },
    execution: { blockNumber: String(blockNumber), blockHash: block.hash },
  });

  const { receiptId, receipt: execReceipt } = await createReceipt({
    chainId,
    txHash: tx.hash.toLowerCase(),
    blockHash: block.hash.toLowerCase(),
    blockNumber: String(blockNumber),
    intentHash,
    policyHash,
    executionTraceHash: traceHash,
    stateDeltaHash,
    evidenceRoot: evidence.hash,
    simulation: { blockNumber: String(blockNumber), blockHash: block.hash },
    execution: { blockNumber: String(blockNumber), blockHash: block.hash },
    verifierVersion: "0.1.0",
    verificationLevel: "L1",
    result,
    checks: [],
  });

  console.log("");
  console.log("  ── RECEIPT ───────────────────────────────");
  console.log(`  Receipt ID:    ${receiptId}`);
  console.log(`  Result:        ${result}`);
  console.log(`  Level:         L1 (chain receipt + state delta)`);
  console.log(`  Evidence root: ${execReceipt.evidenceRoot}`);

  // 8. Independent verification (no RPC needed)
  console.log("");
  console.log("  ── VERIFICATION ─────────────────────────");
  const verification = await verifyReceipt({ ...execReceipt, receiptId }, null, intent, policy, normalizedTrace);
  for (const c of verification.checks) {
    const mark = c.result === "PASS" ? "✓" : c.result === "SKIP" ? "·" : "✗";
    console.log(`  ${mark} ${c.check}${c.result === "FAIL" ? ` — ${c.detail}` : ""}`);
  }
  console.log(`  Verifier result: ${verification.result}`);

  console.log("");
  console.log("  ⚠  Demo notice: intent + policy were INFERRED post-hoc from");
  console.log("     this transaction to exercise the machinery on live chain data.");
  console.log("     A production receipt requires pre-declared (committed) authorization.");
  console.log("");

  // 9. Persist artifacts
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(resolve(OUT_DIR, "intent.json"), JSON.stringify(intent, null, 2));
  await writeFile(resolve(OUT_DIR, "policy.json"), JSON.stringify(policy, null, 2));
  await writeFile(resolve(OUT_DIR, "trace.json"), JSON.stringify(normalizedTrace, null, 2));
  await writeFile(
    resolve(OUT_DIR, "receipt.json"),
    JSON.stringify({ receiptId, receipt }, null, 2)
  );
  await writeFile(
    resolve(OUT_DIR, "verification.json"),
    JSON.stringify(verification, null, 2)
  );
  await writeFile(
    resolve(OUT_DIR, "evidence.json"),
    JSON.stringify(evidence.evidence, null, 2)
  );

  console.log(`  Artifacts saved to: ${OUT_DIR}`);
  return { receiptId, result: verification.result, txHash: tx.hash, blockNumber };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}