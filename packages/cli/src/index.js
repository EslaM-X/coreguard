/**
 * CoreGuard CLI
 *
 * analyze    — Analyze an execution against intent and policy (on-chain or offline)
 * verify     — Independently verify an execution receipt
 * verify-run — External verification surface (CGEP/1:VERIFY-RUN) with exit codes
 * report     — Render a human-readable report from a receipt
 *
 * Examples:
 *   analyze --intent intent.json --policy policy.json --trace trace.json
 *   analyze --tx 0x... --intent intent.json --policy policy.json --rpc https://rpc.test2.btcs.network
 *   verify --receipt receipt.json [--intent intent.json --policy policy.json --trace trace.json]
 *   verify-run --receipt receipt.json --intent intent.json --policy policy.json --trace trace.json --json
 *   verify-run --bundle verify-bundle.json [--rpc https://rpc.test2.btcs.network] [--json]
 *   report --receipt receipt.json
 */

import { readFile } from "fs/promises";
import { resolve } from "path";
import { fileURLToPath } from "url";

import { hashIntent, hashPolicy } from "../../canonical/index.js";
import { evaluatePolicy } from "../../policy/index.js";
import { computeStateDelta, normalizeExecution } from "../../trace/index.js";
import { createEvidenceBundle, createReceipt } from "../../evidence/index.js";
import { verifyReceipt } from "../../verifier/index.js";
import { runVerification, deriveRpcBindings } from "../../verifier/run.js";
import { CoreTestnet2Adapter } from "../../canonical/chain-adapter.js";

const VERIFIER_VERSION = "0.1.0";
const VERIFICATION_LEVEL = "L1"; // chain receipt; L2 when replay trace provided

async function loadJson(path, label) {
  try {
    const full = resolve(path);
    return JSON.parse(await readFile(full, "utf8"));
  } catch (err) {
    throw new Error(`Cannot load ${label} from "${path}": ${err.message}`);
  }
}

function getArg(args, name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

function printUsage() {
  console.log(`
CoreGuard CLI v${VERIFIER_VERSION}

Usage:
  coreguard analyze --intent <file> --policy <file> [--trace <file>]
  coreguard analyze --tx <hash> --intent <file> --policy <file> [--rpc <url>]
  coreguard verify  --receipt <file> [--intent <file> --policy <file> --trace <file>]
  coreguard verify-run [--receipt <file>] [--evidence <file>] [--intent <file>] [--policy <file>]
                       [--trace <file>] [--bundle <file>] [--rpc <url>] [--json]
  coreguard report  --receipt <file>

Commands:
  analyze    Analyze an execution against intent and policy
  verify     Independently verify an execution receipt
  verify-run External verification surface (CGEP/1:VERIFY-RUN). Exit codes:
             0=VERIFIED · 1=CLI/input error · 2=INVALID · 3=UNVERIFIED · 4=INCONCLUSIVE
  report     Render a human-readable report from a receipt
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "analyze":
      return await cmdAnalyze(args.slice(1));
    case "verify":
      return await cmdVerify(args.slice(1));
    case "verify-run":
      return await cmdVerifyRun(args.slice(1));
    case "report":
      return await cmdReport(args.slice(1));
    default:
      printUsage();
      process.exit(command ? 1 : 0);
  }
}

async function cmdAnalyze(args) {
  const intentFile = getArg(args, "--intent");
  const policyFile = getArg(args, "--policy");
  const traceFile = getArg(args, "--trace");
  const txHash = getArg(args, "--tx");
  const rpcUrl = getArg(args, "--rpc");

  if ((!intentFile || !policyFile) || (!traceFile && !txHash)) {
    console.error(
      "Error: needs --intent, --policy, and either --trace or --tx"
    );
    process.exit(1);
  }

  const intent = await loadJson(intentFile, "intent");
  const policy = await loadJson(policyFile, "policy");

  let trace;
  let execution = null;
  let adapter = null;

  if (traceFile) {
    trace = await loadJson(traceFile, "trace");
  } else {
    adapter = new CoreTestnet2Adapter(rpcUrl || undefined);
    const tx = await adapter.getTransaction(txHash);
    const receipt = await adapter.getReceipt(txHash);
    const block = await adapter.getBlock(tx.blockNumber);
    receipt.timestamp = block.timestamp;
    trace = normalizeExecution(
      tx,
      receipt,
      null, // replay trace not yet fetched
      null,
      null
    );
    execution = {
      blockNumber: String(tx.blockNumber),
      blockHash: receipt.blockHash,
    };
  }

  const policyResult = evaluatePolicy(policy, {
    value: trace.value,
    target: trace.to,
    recipient: extractRecipient(trace) || intent.recipient,
    selector: trace.calldata ? trace.calldata.slice(0, 10) : intent.selector,
    blockTimestamp: trace.blockTimestamp,
    slippageBps: trace.slippageBps || "0",
  });

  const stateDelta = computeStateDelta(trace);
  const intentHash = await hashIntent(intent);
  const policyHash = await hashPolicy(policy);

  const result = policyResult.result === "SATISFIED" ? "VALID" : "INVALID";

  console.log(`\nCoreGuard Analysis (v${VERIFIER_VERSION})`);
  console.log(`${"─".repeat(56)}`);
  console.log(`Intent hash:   ${intentHash}`);
  console.log(`Policy hash:   ${policyHash}`);
  console.log(`Action:        ${intent.action}${trace.to ? " -> " + trace.to : ""}`);
  console.log(`Trace blocks:  ${trace.blockHash}`);
  console.log(`Policy result: ${result}`);
  console.log(`${"─".repeat(56)}`);

  for (const rule of policyResult.rules) {
    const mark = rule.result === "PASS" ? "✓" : "✗";
    console.log(`  ${mark} ${rule.ruleId} (${rule.typeOf || rule.severity})`);
    if (rule.result === "FAIL") {
      console.log(`      expected ${rule.expected}`);
      console.log(`      observed  ${rule.observed}`);
    }
  }
  console.log(`${"─".repeat(56)}`);
  console.log(`State delta: ${stateDelta.callCount} calls, ${stateDelta.eventCount} events, status ${trace.status}`);

  return { intent, policy, trace, policyResult, stateDelta, intentHash, policyHash };
}

function extractRecipient(trace) {
  const sel = trace.calldata ? trace.calldata.slice(0, 10) : null;
  if (sel === "0xa9059cbb" && trace.calldata.length >= 74) {
    return "0x" + trace.calldata.slice(34, 74);
  }
  if (sel === "0x23b872dd" && trace.calldata.length >= 138) {
    return "0x" + trace.calldata.slice(98, 138);
  }
  return null;
}

async function cmdVerify(args) {
  const receiptFile = getArg(args, "--receipt");
  if (!receiptFile) {
    console.error("Error: --receipt is required");
    process.exit(1);
  }

  const intentFile = getArg(args, "--intent");
  const policyFile = getArg(args, "--policy");
  const traceFile = getArg(args, "--trace");

  const receiptDoc = await loadJson(receiptFile, "receipt");
  const receipt = receiptDoc.receiptId && receiptDoc.receipt
    ? { receiptId: receiptDoc.receiptId, ...receiptDoc.receipt }
    : receiptDoc;

  const intent = intentFile ? await loadJson(intentFile, "intent") : null;
  const policy = policyFile ? await loadJson(policyFile, "policy") : null;
  const trace = traceFile ? await loadJson(traceFile, "trace") : null;

  const verification = await verifyReceipt(receipt, null, intent, policy, trace);

  console.log(`\nCoreGuard Verification (v${VERIFIER_VERSION})`);
  console.log(`${"─".repeat(56)}`);
  console.log(`Receipt ID:    ${verification.receiptId}`);
  console.log(`Result:        ${verification.result}`);
  console.log(`${"─".repeat(56)}`);
  for (const check of verification.checks) {
    const mark = check.result === "PASS" ? "✓" : check.result === "NOT_RUN" ? "·" : "✗";
    console.log(`  ${mark} ${check.check} — ${check.detail}`);
  }
  console.log(`${"─".repeat(56)}`);
  return verification;
}

async function cmdVerifyRun(args) {
  const json = args.includes("--json");
  const bundleFile = getArg(args, "--bundle");
  const receiptFile = getArg(args, "--receipt");
  const intentFile = getArg(args, "--intent");
  const policyFile = getArg(args, "--policy");
  const traceFile = getArg(args, "--trace");
  const evidenceFile = getArg(args, "--evidence");
  const rpcUrl = getArg(args, "--rpc");

  const bundleDoc = bundleFile ? await loadJson(bundleFile, "bundle") : null;
  const receiptRaw = bundleFile ? readFileFromBundle(bundleDoc, "receipt") : await loadJson(receiptFile, "receipt");
  const receipt = receiptRaw && (receiptRaw.receiptId && receiptRaw.receipt)
    ? { receiptId: receiptRaw.receiptId, ...receiptRaw.receipt }
    : receiptRaw;

  const intent = bundleFile
    ? readFileFromBundle(bundleDoc, "intent")
    : intentFile
      ? await loadJson(intentFile, "intent")
      : null;
  const policy = bundleFile
    ? readFileFromBundle(bundleDoc, "policy")
    : policyFile
      ? await loadJson(policyFile, "policy")
      : null;
  const trace = bundleFile
    ? readFileFromBundle(bundleDoc, "trace")
    : traceFile
      ? await loadJson(traceFile, "trace")
      : null;
  const evidence = bundleFile
    ? readFileFromBundle(bundleDoc, "evidence")
    : evidenceFile
      ? await loadJson(evidenceFile, "evidence")
      : null;

  let rpcChecks = [];
  if (rpcUrl) {
    rpcChecks = await cmdRpcBindings(receipt, rpcUrl);
  }

  const report = await runVerification({
    receipt,
    evidence,
    intent,
    policy,
    trace,
    rpcChecks,
  });

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  process.exitCode = report.exitCode;
  return report;
}

async function cmdRpcBindings(receipt, rpcUrl) {
  const adapter = new CoreTestnet2Adapter(rpcUrl);
  const snapshot = {};
  try {
    snapshot.chainId = await adapter.getChainId();
  } catch {
    // read-only optional binding; failure leaves it NOT_RUN, never a contradiction
  }
  try {
    snapshot.tx = await adapter.getTransaction(receipt.txHash);
  } catch {
    snapshot.tx = undefined;
  }
  try {
    snapshot.receiptLog = await adapter.getReceipt(receipt.txHash);
  } catch {
    snapshot.receiptLog = undefined;
  }
  try {
    const blockNumber = Number(receipt.blockNumber || "0");
    snapshot.block = blockNumber > 0 ? await adapter.getBlock(blockNumber) : undefined;
  } catch {
    snapshot.block = undefined;
  }
  return deriveRpcBindings(receipt, snapshot);
}

function readFileFromBundle(doc, key) {
  return doc && doc[key] !== undefined ? doc[key] : null;
}

function printHumanReport(report) {
  console.log(`\nCoreGuard Verify-Run (${report.contract} v${report.version})`);
  console.log(`${"─".repeat(56)}`);
  console.log(`Receipt ID:    ${report.observed.receiptId}`);
  console.log(`Level:         ${report.verdict.verificationLevel}`);
  console.log(`Verdict:       ${report.verdict.verdict} (${report.verdict.code})`);
  console.log(`Exit code:     ${report.exitCode}`);
  console.log(`${"─".repeat(56)}`);
  for (const check of report.verified) {
    const mark = check.result === "PASS" ? "✓" : check.result === "NOT_RUN" ? "·" : "✗";
    console.log(`  ${mark} ${check.check} — ${check.detail}`);
  }
  if (report.verdict.requiredMissing.length > 0) {
    console.log(`${"─".repeat(56)}`);
    console.log(`Missing required: ${report.verdict.requiredMissing.join(", ")}`);
  }
  if (report.verdict.failing.length > 0) {
    console.log(`${"─".repeat(56)}`);
    console.log(`Failing: ${report.verdict.failing.join(", ")}`);
  }
  console.log(`${"─".repeat(56)}`);
}

async function cmdReport(args) {
  const receiptFile = getArg(args, "--receipt");
  if (!receiptFile) {
    console.error("Error: --receipt is required");
    process.exit(1);
  }

  const receiptDoc = await loadJson(receiptFile, "receipt");
  const receipt = receiptDoc.receiptId && receiptDoc.receipt
    ? { receiptId: receiptDoc.receiptId, ...receiptDoc.receipt }
    : receiptDoc;

  console.log(`\nCOREGUARD EXECUTION RECEIPT (v${VERIFIER_VERSION})`);
  console.log(`${"─".repeat(56)}`);
  console.log(`Result:        ${receipt.result}`);
  console.log(`Receipt ID:    ${receipt.receiptId}`);
  console.log(`Chain:         ${receipt.chainId}`);
  console.log(`TX:            ${receipt.txHash}`);
  console.log(`Block:         ${receipt.blockNumber} (${receipt.blockHash})`);
  console.log(`Intent hash:   ${receipt.intentHash}`);
  console.log(`Policy hash:   ${receipt.policyHash}`);
  console.log(`Trace hash:    ${receipt.executionTraceHash}`);
  console.log(`Evidence root: ${receipt.evidenceRoot}`);
  console.log(`Simulation:    block ${receipt.simulation?.blockNumber} (${receipt.simulation?.blockHash})`);
  console.log(`Execution:     block ${receipt.execution?.blockNumber} (${receipt.execution?.blockHash})`);
  console.log(`Verification:  ${receipt.verificationLevel} (${receipt.verifierVersion})`);
  console.log(`Timestamp:     ${receipt.timestamp}`);
  console.log(`${"─".repeat(56)}`);
  return receipt;
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

export { extractRecipient }; // re-usable for other tooling