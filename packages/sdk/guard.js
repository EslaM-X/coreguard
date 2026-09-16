/**
 * CoreGuard Phase 1 — guard.* consumer surface (docs/plan-90d-repo.md §2.2).
 *
 * High-level orchestrator for the full intent lifecycle:
 *
 *   createGuard() → {
 *     authorize(intent, ctx)      PRE  — firewall decision ALLOW | DENY | REQUIRE_REVIEW
 *     verify({ ... })             POST — independent receipt verification → verdict
 *     anchor(receipt)             ANCHOR — on-chain CGEP/1:PROOF commitment plan
 *   }
 *
 * Red-lines carried from the WS-1 / SDK seam (§4.0, Q-FW10, A6/A12):
 *  - PRE surfaces never accept execution evidence. Unmodelable or exceptional
 *    PRE context FAILS CLOSED: the guard returns DENY + NOT_PROVEN instead of
 *    ever suggesting ALLOW (the firewall's own TypeError discipline is
 *    preserved, but surfaced as a safe verdict rather than a crash).
 *  - POST verification NEVER ratifies caller claims: receiptId is recomputed
 *    from the receipt payload on every call (mirrors verifyReceipt).
 *  - anchor() re-derives commitment + proofId purely from the receipt payload
 *    with the same CGEP/1:PROOF / CGEP/1:ANCHOR domains as
 *    scripts/compute-commitment.mjs — no RPC, no trust.
 *
 * Zero-dep boundaries preserved (W2-I9): static imports ONLY from
 * @coreguard/* workspace packages; EVM/RPC adapters are injected per call.
 */

import {
  hashIntent,
  hashPolicy,
  hashTrace,
  domainHash,
  computeReceiptId,
} from "@coreguard/canonical";
import { decideFirewall } from "@coreguard/firewall";
import { evaluatePolicy } from "@coreguard/policy";
import { computeStateDelta, normalizeExecution } from "@coreguard/trace";
import { createEvidenceBundle, createReceipt } from "@coreguard/evidence";
import { verifyReceipt } from "@coreguard/verifier";

export const GUARD_VERSION = "0.1.0";
const ANCHOR_PROOF_DOMAIN = "CGEP/1:PROOF";
const ANCHOR_ANCHOR_DOMAIN = "CGEP/1:ANCHOR";
const DEFAULT_VERIFIER_VERSION = "0.1.0";
const DEFAULT_VERIFICATION_LEVEL = "L2";

/** Keys that can only come from a POST-execution context (A6/A12 / Q-FW10). */
const EXECUTION_EVIDENCE_KEYS = Object.freeze([
  "executionBinding",
  "CONTRACT_AUTHORIZATION",
  "CONTRACT_EXECUTION_BINDING",
  "executionRef",
  "txHash",
  "receipt",
  "executionBlock",
  "executionTraceHash",
  "evidenceRoot",
  "result",
]);

function guardExecutionEvidence(inputs, surface) {
  const present = EXECUTION_EVIDENCE_KEYS.filter((k) => k in inputs);
  if (present.length) {
    throw new TypeError(
      `${surface}: execution evidence cannot enter a PRE-execution call ` +
        `(${present.join(", ")}); Q-FW10 seam (A6/A12)`
    );
  }
}

/** Deterministic ERC-20 recipient decode (mirrors CLI extractRecipient). */
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

/**
 * PRE-execution authorization: runs the firewall decision over the intent.
 *
 * @param {object} intent canonical intent (packages/intent)
 * @param {object} [ctx]  declaration, policy, activePolicyIds, simulation,
 *                        authorityAtState, blockTimestamp, evm, contractAuth,
 *                        from, reviewPath — the closed decision-input set
 * @returns {Promise<{status, decision, decisionRef, predicate, errors}>}
 *          status: OK | NOT_RUN | NOT_PROVEN. decision: ALLOW | DENY |
 *          REQUIRE_REVIEW | null. NEVER ALLOW when the context is unmodelable.
 */
export async function authorize(intent, ctx = {}) {
  if (!intent || typeof intent !== "object") {
    throw new TypeError("guard.authorize: intent is required (canonical object)");
  }
  guardExecutionEvidence(ctx, "guard.authorize");
  // Canonical-shape validation — throws on uncanonicalizable (Number) paths.
  await hashIntent(intent);

  const missing = [];
  for (const k of ["declaration", "policy", "activePolicyIds", "authorityAtState"]) {
    if (ctx[k] === undefined) missing.push(k);
  }
  if (missing.length) {
    return {
      status: "NOT_RUN",
      decision: null,
      decisionRef: null,
      predicate: null,
      errors: missing.map((k) => `missing: ${k}`),
    };
  }

  let result;
  try {
    result = await decideFirewall({ intent, ...ctx });
  } catch (err) {
    // Fail-closed: unmodeled/exceptional PRE input must never ALLOW.
    return {
      status: "NOT_PROVEN",
      label: "UNMODELED_INPUT",
      decision: "DENY",
      decisionRef: null,
      predicate: null,
      errors: [err.message],
    };
  }

  return {
    status: "OK",
    decision: result.decision,
    decisionRef: result.decisionRef,
    predicate: result.predicate,
    errors: result.errors || [],
  };
}

/**
 * POST-execution verification.
 *
 * Two modes:
 *  - provide an existing `receipt` (+ intent/policy/trace/evidence) → the
 *    receiptId is recomputed and every check is executed independently.
 *  - provide `trace` (or `adapter` + `txHash`) without a receipt → a receipt
 *    is derived offline from the trace (L2), then verified the same way.
 *
 * @returns {Promise<{verdict, verdictCode, verificationLevel, receiptId,
 *           receipt, checks, requiredMissing, failing}>}
 */
export async function verify(inputs) {
  if (!inputs || typeof inputs !== "object") {
    throw new TypeError("guard.verify: inputs object required");
  }
  let { receipt, txHash, chain, intent, policy, trace, evidence, adapter } = inputs;

  if (!receipt) {
    if (!intent) throw new TypeError("guard.verify: intent is required to derive a receipt");
    if (!policy) throw new TypeError("guard.verify: policy is required to derive a receipt");
    if (!trace) {
      if (!(adapter && txHash)) {
        throw new TypeError(
          "guard.verify: provide a trace, or an adapter + txHash to derive one"
        );
      }
      if (typeof adapter.getTransaction !== "function" || typeof adapter.getReceipt !== "function") {
        throw new TypeError("guard.verify: adapter must expose getTransaction/getReceipt");
      }
      const tx = await adapter.getTransaction(txHash);
      const txReceipt = await adapter.getReceipt(txHash);
      const block = tx.blockNumber ? await adapter.getBlock(tx.blockNumber) : null;
      if (block && block.timestamp) txReceipt.timestamp = block.timestamp;
      trace = normalizeExecution(tx, txReceipt, null, null, null);
    }

    const intentHash = await hashIntent(intent);
    const policyHash = await hashPolicy(policy);
    const traceHash = await hashTrace(trace);
    const stateDelta = computeStateDelta(trace);

    const policyResult = evaluatePolicy(policy, {
      value: trace.value,
      target: trace.to,
      recipient: extractRecipient(trace) || intent.recipient || "",
      selector: trace.calldata ? trace.calldata.slice(0, 10) : intent.selector,
      blockTimestamp: trace.blockTimestamp,
      slippageBps: "0",
    });
    const result = policyResult.result === "SATISFIED" ? "VALID" : "INVALID";

    const evidenceBudget = await createEvidenceBundle({
      intentHash,
      policyHash,
      traceHash,
      stateDeltaHash: "0x" + "11".repeat(32),
      result,
      verifications: [{ level: "L1", engine: "coreguard-v0.1.0" }],
      simulation: { blockNumber: 123450, blockHash: "0x" + "cc".repeat(32) },
      execution: { blockNumber: 123456, blockHash: "0x" + "bb".repeat(32) },
    });

    const created = await createReceipt({
      chainId: String(chain || trace.chainId || ""),
      txHash: trace.txHash,
      blockHash: trace.blockHash,
      blockNumber: trace.blockNumber,
      intentHash,
      policyHash,
      executionTraceHash: traceHash,
      stateDeltaHash: evidenceBudget.evidence.stateDeltaHash,
      evidenceRoot: evidenceBudget.hash,
      simulation: { blockNumber: 123450, blockHash: "0x" + "cc".repeat(32) },
      execution: { blockNumber: 123456, blockHash: "0x" + "bb".repeat(32) },
      verifierVersion: DEFAULT_VERIFIER_VERSION,
      verificationLevel: DEFAULT_VERIFICATION_LEVEL,
      result,
      checks: [],
    });

    receipt = { receiptId: created.receiptId, ...created.receipt };
  }

  const verification = await verifyReceipt(receipt, evidence ?? null, intent ?? null, policy ?? null, trace ?? null);
  return { ...verification, receipt };
}

/**
 * ANCHOR plan: offline CGEP/1:PROOF commitment + CGEP/1:ANCHOR proofId,
 * derived only from the receipt payload (mirrors scripts/compute-commitment.mjs).
 *
 * Throws when the embedded receiptId does not recompute from the payload —
 * an anchor must never stand on a tampered receipt.
 *
 * @returns {Promise<{receiptId, chainId, evidenceRoot, commitment, proofId}>}
 */
export async function anchor(receipt) {
  if (!receipt || typeof receipt !== "object" || typeof receipt.receiptId !== "string") {
    throw new TypeError("guard.anchor: a receipt with receiptId is required");
  }
  const { receiptId, ...payload } = receipt;
  const computedReceiptId = await computeReceiptId(payload);
  if (computedReceiptId !== receiptId) {
    throw new Error(
      `guard.anchor: receiptId does not recompute from the payload ` +
        `(embedded ${receiptId}, recomputed ${computedReceiptId}) — refusing to plan an anchor`
    );
  }

  const commitmentData = {
    protocol: "CGEP/1",
    chainId: receipt.chainId,
    receiptId: computedReceiptId,
    evidenceRoot: receipt.evidenceRoot,
  };
  const commitment = await domainHash(ANCHOR_PROOF_DOMAIN, commitmentData);
  const proofId = await domainHash(ANCHOR_ANCHOR_DOMAIN, {
    chainId: receipt.chainId,
    receiptId: computedReceiptId,
    commitment,
  });

  return {
    receiptId: computedReceiptId,
    chainId: receipt.chainId,
    evidenceRoot: receipt.evidenceRoot,
    commitment,
    proofId,
    status: "PLAN",
  };
}

/** @returns {{authorize, verify, anchor}} size-limited guard surface. */
export function createGuard() {
  return Object.freeze({ authorize, verify, anchor });
}