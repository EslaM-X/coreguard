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

  const receiptId = await computeReceiptId(receipt);

  return {
    receiptId,
    receipt,
  };
}
