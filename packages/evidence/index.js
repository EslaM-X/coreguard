/**
 * CoreGuard Evidence Engine
 *
 * Generates evidence bundles and commitments.
 */

import { canonicalize, hashEvidence, computeReceiptId } from "@coreguard/canonical";

/**
 * Create an evidence bundle from intent, policy, and execution
 */
export async function createEvidenceBundle({
  intentHash,
  policyHash,
  traceHash,
  stateDeltaHash,
  stateDeltaScheme,
  result,
  verifications,
  simulation,
  execution,
}) {
  const evidence = {
    version: "CGEP/1",
    intentHash,
    policyHash,
    traceHash,
    stateDeltaHash,
    result,
    verifications,
    simulation,
    execution,
  };

  // P1: when the caller commits a canonical CGEP/1:STATEDELTA hash, mark the
  // scheme so the verifier's STATE_DELTA_CANONICAL check can recompute it.
  if (stateDeltaScheme) evidence.stateDeltaScheme = stateDeltaScheme;

  const canonical = canonicalize(evidence);
  const hash = await hashEvidence(evidence);

  return {
    evidence,
    canonical,
    hash,
  };
}

/**
 * Build a Trace Availability Proof (Phase 0 P0.3).
 *
 * A positive claim says the canonical execution trace exists AND where it came
 * from, so a consumer can assess provenance depth (provider capability, tree
 * depth, frame count, per-frame coverage). Absence of this block is NOT a
 * violation — but the verification-level self-declaration must then say why
 * (see levelTruth / TRACE_UNAVAILABLE).
 */
export function buildTraceAvailability({ provider, depth = 0, frames = 0, coverage = [] }) {
  return {
    status: "TRACE_AVAILABLE",
    provider,
    depth: String(depth),
    frames: String(frames),
    coverage: coverage.map((c) => String(c)),
  };
}

/**
 * Explicit, honest negative claim: no canonical execution trace is available
 * (or its provenance is unknown). Paired with a levelReason in the receipt.
 */
export function traceUnavailable(reason) {
  return { status: "TRACE_UNAVAILABLE", reason };
}

/**
 * Create an Execution Receipt
 */
export async function createReceipt({
  chainId,
  txHash,
  blockHash,
  blockNumber,
  intentHash,
  policyHash,
  executionTraceHash,
  stateDeltaHash,
  evidenceRoot,
  simulation,
  execution,
  verifierVersion,
  verificationLevel,
  levelReason,
  traceAvailability,
  result,
  checks,
}) {
  const timestamp = String(Math.floor(Date.now() / 1000));

  const receipt = {
    version: "CGEP/1",
    chainId: String(chainId),
    txHash: txHash.toLowerCase(),
    blockHash: blockHash.toLowerCase(),
    blockNumber: String(blockNumber),
    intentHash,
    policyHash,
    executionTraceHash,
    stateDeltaHash,
    evidenceRoot,
    simulation: {
      blockNumber: String(simulation.blockNumber),
      blockHash: simulation.blockHash.toLowerCase(),
    },
    execution: {
      blockNumber: String(execution.blockNumber),
      blockHash: execution.blockHash.toLowerCase(),
    },
    verifierVersion,
    verificationLevel,
    result,
    timestamp,
    checks,
  };

  // P0.3: trace availability + level self-declaration. ADDITIVE — omitted
  // when the caller does not supply them, so existing receipts stay byte-identical.
  if (traceAvailability) receipt.traceAvailability = traceAvailability;
  if (levelReason) receipt.levelReason = levelReason;

  const receiptId = await computeReceiptId(receipt);

  return {
    receiptId,
    receipt,
  };
}
