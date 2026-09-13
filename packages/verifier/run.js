/**
 * CoreGuard — External Verification Surface (CGEP/1:VERIFY-RUN)
 *
 * A pure, hermetic entrypoint that turns a complete verification claim
 * (receipt + optional evidence/intent/policy/trace) into ONE verdict as a
 * structured report with three explicit layers:
 *
 *   OBSERVED — what the caller supplied, at face value (commitments only).
 *   DERIVED  — what CoreGuard independently recomputed from that material.
 *   VERIFIED — per-check outcomes (PASS / FAIL / NOT_RUN).
 *
 * Contract properties (same closed semantics as the engine and anchor module):
 *   - FAIL-CLOSED: missing REQUIRED evidence → UNVERIFIED (never VERIFIED);
 *     every run check that FAILs → INVALID (contradiction dominates);
 *     unclaimable L3/L4 → INCONCLUSIVE; unknown level → UNVERIFIED.
 *   - PRIVACY-MINIMAL: the report surfaces commitment/hash/level/binding
 *     fields only. Intent/policy/trace/evidence BODIES are never re-printed.
 *   - NETWORK-FREE: read-only on-chain bindings are supplied as already
 *     collected checks (see CLI `verify-run --rpc`), so this module is pure.
 *
 * Verdict exit codes: VERIFIED→0 · CLI/INPUT error→1 · INVALID→2 ·
 * UNVERIFIED→3 · INCONCLUSIVE→4.
 */

import { canonicalUintString } from "../canonical/uint.js";
import {
  hashIntent,
  hashPolicy,
  hashTrace,
  hashEvidence,
  computeReceiptId,
} from "../canonical/index.js";
import { verifyReceipt, evaluateCheckVerdict } from "./index.js";

export const CONTRACT = "CGEP/1:VERIFY-RUN";
export const VERIFIER_VERSION = "0.1.0";

/**
 * Normalize a receipt document so both shapes work:
 *   { receiptId, receipt: { ... } }  (written by createReceipt/run-demo)
 *   { receiptId, ... }               (flat receipt, as the engine consumes)
 */
export function normalizeReceiptDocument(doc) {
  if (!doc || typeof doc !== "object") {
    throw new Error("receipt: expected an object");
  }
  if (doc.receiptId && doc.receipt && typeof doc.receipt === "object") {
    return { receiptId: doc.receiptId, ...doc.receipt };
  }
  return doc;
}

/**
 * Map a verdict to the CLI process exit code.
 */
export function exitCodeForVerdict(verdict) {
  switch (verdict) {
    case "VERIFIED":
      return 0;
    case "INVALID":
      return 2;
    case "UNVERIFIED":
      return 3;
    case "INCONCLUSIVE":
      return 4;
    default:
      return 1;
  }
}

const NOT_RUN = "NOT_RUN";
const PASS = "PASS";
const FAIL = "FAIL";

/**
 * Derive read-only on-chain binding checks from a small RPC snapshot.
 *
 * The snapshot values come from PUBLIC read calls only (chainId, transaction,
 * receipt, block) — never from signing or broadcasting. Semantics:
 *   - value absent (`undefined`)  → NOT_RUN  (bindings are optional evidence)
 *   - chain returned "not found" (`null`) → FAIL   (receipt claims something
 *     the chain does not have — a contradiction when the RPC was used)
 *   - fetched but mismatched     → FAIL  (contradiction dominates)
 *   - fetched and matched        → PASS
 *
 * @param {object} receipt   Normalized flat receipt.
 * @param {object} snapshot  { chainId?, tx?, receiptLog?, block? } raw RPC.
 * @returns {Array<{check,result,detail}>}
 */
export function deriveRpcBindings(receipt, snapshot = {}) {
  const checks = [];

  const chainId = snapshot.chainId;
  checks.push(
    chainId === undefined
      ? { check: "CHAIN_ID_BINDING", result: NOT_RUN, detail: "chainId not queried (optional binding)" }
      : chainId === null
        ? { check: "CHAIN_ID_BINDING", result: FAIL, detail: "chainId not returned by RPC" }
        : canonicalUintString(chainId) === canonicalUintString(receipt.chainId || "0")
          ? { check: "CHAIN_ID_BINDING", result: PASS, detail: "RPC chainId matches receipt chainId" }
          : {
              check: "CHAIN_ID_BINDING",
              result: FAIL,
              detail: `RPC chainId ${chainId} does not match receipt chainId ${receipt.chainId}`,
            }
  );

  const tx = snapshot.tx;
  checks.push(
    tx === undefined
      ? { check: "TX_BINDING", result: NOT_RUN, detail: "transaction not queried (optional binding)" }
      : tx === null
        ? { check: "TX_BINDING", result: FAIL, detail: `transaction ${receipt.txHash} not found on chain` }
        : (tx.hash || "").toLowerCase() === (receipt.txHash || "").toLowerCase()
          ? { check: "TX_BINDING", result: PASS, detail: "RPC transaction hash matches receipt txHash" }
          : {
              check: "TX_BINDING",
              result: FAIL,
              detail: `RPC transaction ${tx.hash} does not match receipt txHash ${receipt.txHash}`,
            }
  );

  const log = snapshot.receiptLog;
  checks.push(
    log === undefined
      ? { check: "RECEIPT_BINDING", result: NOT_RUN, detail: "receipt not queried (optional binding)" }
      : log === null
        ? { check: "RECEIPT_BINDING", result: FAIL, detail: `receipt for ${receipt.txHash} not found on chain` }
        : (log.blockHash || "").toLowerCase() === (receipt.blockHash || "").toLowerCase() &&
            canonicalUintString(log.blockNumber || "0x0") === canonicalUintString(receipt.blockNumber || "0x0")
          ? { check: "RECEIPT_BINDING", result: PASS, detail: "RPC receipt blockHash+blockNumber matches receipt" }
          : {
              check: "RECEIPT_BINDING",
              result: FAIL,
              detail: "RPC receipt blockHash/blockNumber does not match receipt",
            }
  );

  const block = snapshot.block;
  checks.push(
    block === undefined
      ? { check: "BLOCK_BINDING", result: NOT_RUN, detail: "block not queried (optional binding)" }
      : block === null
        ? { check: "BLOCK_BINDING", result: FAIL, detail: `block ${receipt.blockNumber} not found on chain` }
        : (block.hash || "").toLowerCase() === (receipt.blockHash || "").toLowerCase()
          ? { check: "BLOCK_BINDING", result: PASS, detail: "RPC block hash matches receipt blockHash" }
          : {
              check: "BLOCK_BINDING",
              result: FAIL,
              detail: `RPC block ${block.hash} does not match receipt blockHash ${receipt.blockHash}`,
            }
  );

  return checks;
}

/**
 * Run one external verification and produce the CGEP/1:VERIFY-RUN report.
 *
 * @param {object}   options.receipt   Receipt document (wrapper or flat).
 * @param {object}   [options.evidence] Evidence bundle (optional advice).
 * @param {object}   [options.intent]   Intent (required at L1/L2).
 * @param {object}   [options.policy]   Policy (required at L1/L2).
 * @param {object}   [options.trace]    Execution trace (required at L2).
 * @param {Array}    [options.rpcChecks] Read-only binding checks (from
 *   deriveRpcBindings or the CLI --rpc path). Any FAIL dominates.
 * @returns {object} Structured CGEP/1:VERIFY-RUN report (never contains the
 *   intent/policy/trace/evidence bodies — commitments only).
 */
export async function runVerification({
  receipt,
  evidence = null,
  intent = null,
  policy = null,
  trace = null,
  rpcChecks = [],
}) {
  if (!receipt) {
    throw new Error("receipt is required");
  }

  const flat = normalizeReceiptDocument(receipt);
  const claimedLevel = flat.verificationLevel || "L2";
  const { receiptId: _claimId, ...payload } = flat;

  const engine = await verifyReceipt(flat, evidence, intent, policy, trace);
  const verified = [...engine.checks, ...rpcChecks];
  const verdict = evaluateCheckVerdict(claimedLevel, verified);

  // DERIVED — independent recomputation (surfaces commitments only).
  const derived = {
    receiptId: await computeReceiptId(payload),
    intentHash: intent ? await hashIntent(intent) : null,
    policyHash: policy ? await hashPolicy(policy) : null,
    traceHash: trace ? await hashTrace(trace) : null,
    evidenceHash: evidence ? await hashEvidence(evidence) : null,
  };

  const report = {
    contract: CONTRACT,
    version: VERIFIER_VERSION,
    observed: {
      receiptId: flat.receiptId,
      verificationLevel: claimedLevel,
      chainId: flat.chainId,
      txHash: flat.txHash,
      blockHash: flat.blockHash,
      blockNumber: flat.blockNumber,
      present: {
        evidence: Boolean(evidence),
        intent: Boolean(intent),
        policy: Boolean(policy),
        trace: Boolean(trace),
      },
    },
    derived,
    verified,
    verdict: {
      verdict: verdict.verdict,
      code: verdict.code,
      verificationLevel: claimedLevel,
      required: verdict.required,
      requiredMissing: verdict.requiredMissing,
      failing: verdict.failing,
      reason: verdict.reason,
    },
    exitCode: exitCodeForVerdict(verdict.verdict),
  };

  return report;
}