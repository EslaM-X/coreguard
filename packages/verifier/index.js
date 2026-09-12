/**
 * CoreGuard Verifier
 *
 * Independent verification. Can run without RPC.
 * Recomputes all hashes, validates commitments, checks intent/execution binding.
 */

import {
  canonicalize,
  hashIntent,
  hashPolicy,
  hashTrace,
  hashEvidence,
  computeReceiptId,
} from "../canonical/index.js";

/**
 * Verification check result
 */
export const CheckResult = {
  PASS: "PASS",
  FAIL: "FAIL",
  SKIP: "SKIP",
};

/**
 * Required-evidence profile per claimed verification level (P0, closed).
 * Any required check that is not PASS (SKIP/absent) -> UNVERIFIED, never VERIFIED.
 */
export const REQUIRED_BY_LEVEL = {
  L0: ["RECEIPT_COMMITMENT", "STATE_PINNING"],
  L1: ["RECEIPT_COMMITMENT", "STATE_PINNING", "INTENT_HASH", "POLICY_HASH"],
  L2: [
    "RECEIPT_COMMITMENT",
    "STATE_PINNING",
    "INTENT_HASH",
    "POLICY_HASH",
    "TRACE_HASH",
    "INTENT_EXECUTION_BINDING",
  ],
};

/** Evidence that improves confidence but is never required at any level. */
export const OPTIONAL_CHECKS_V = ["EVIDENCE_COMMITMENT"];

export const CLAIMABLE_LEVELS_V = Object.keys(REQUIRED_BY_LEVEL);

/**
 * Determine the receipt verdict from the executed checks and the claimed level.
 * Mirrors scripts/anchor-verdict.mjs semantics (single source of truth):
 *   - Any FAIL (required or optional) -> INVALID (contradiction dominates).
 *   - Missing ANY required evidence (SKIP/absent) -> UNVERIFIED.
 *   - Unknown / unclaimable level    -> UNVERIFIED (never silently VERIFIED).
 *   - VERIFIED only when every required check PASSes and nothing FAILs.
 */
export function evaluateCheckVerdict(level, checks = []) {
  const failed = checks.filter((c) => c.result === CheckResult.FAIL);
  if (failed.length > 0) {
    return {
      verdict: "INVALID",
      code: "CONTRADICTION",
      required: REQUIRED_BY_LEVEL[level] ?? [],
      requiredMissing: [],
      failing: failed.map((c) => c.check),
      reason: "A run check failed — the claim contradicts the evidence.",
    };
  }

  if (!REQUIRED_BY_LEVEL[level]) {
    return {
      verdict: "UNVERIFIED",
      code: "UNSUPPORTED_LEVEL",
      required: [],
      requiredMissing: [String(level)],
      failing: [],
      reason: `Claimed level "${level}" is not claimable — evidence profile unknown.`,
    };
  }

  const byName = new Map(checks.map((c) => [c.check, c.result]));
  const required = REQUIRED_BY_LEVEL[level];
  const missing = required.filter((name) => byName.get(name) !== CheckResult.PASS);

  if (missing.length > 0) {
    return {
      verdict: "UNVERIFIED",
      code: "MISSING_REQUIRED_EVIDENCE",
      required,
      requiredMissing: missing,
      failing: [],
      reason: `Missing required evidence: ${missing.join(", ")}. Unverified — never VERIFIED.`,
    };
  }

  return {
    verdict: "VERIFIED",
    code: "RECEIPT_INTEGRITY",
    required,
    requiredMissing: [],
    failing: [],
    reason: "All required evidence present and PASS; no contradicting FAIL.",
  };
}

/**
 * Verify an execution receipt independently
 */
export async function verifyReceipt(receipt, evidenceBundle, intent, policy, trace) {
  const checks = [];

  // 1. Verify receipt commitment (computed over payload WITHOUT the ID field)
  const { receiptId, ...payload } = receipt;
  const computedReceiptId = await computeReceiptId(payload);
  const receiptValid = computedReceiptId === receipt.receiptId;
  checks.push({
    check: "RECEIPT_COMMITMENT",
    result: receiptValid ? CheckResult.PASS : CheckResult.FAIL,
    detail: receiptValid
      ? "Receipt commitment matches"
      : "Receipt commitment mismatch — possible tampering",
  });

  // 2. Verify intent hash
  if (intent) {
    const intentHash = await hashIntent(intent);
    const intentValid = intentHash === receipt.intentHash;
    checks.push({
      check: "INTENT_HASH",
      result: intentValid ? CheckResult.PASS : CheckResult.FAIL,
      detail: intentValid
        ? "Intent hash matches"
        : "Intent hash mismatch — intent may have been modified",
    });
  } else {
    checks.push({
      check: "INTENT_HASH",
      result: CheckResult.SKIP,
      detail: "Intent not provided for verification",
    });
  }

  // 3. Verify policy hash
  if (policy) {
    const policyHash = await hashPolicy(policy);
    const policyValid = policyHash === receipt.policyHash;
    checks.push({
      check: "POLICY_HASH",
      result: policyValid ? CheckResult.PASS : CheckResult.FAIL,
      detail: policyValid
        ? "Policy hash matches"
        : "Policy hash mismatch — policy may have been modified",
    });
  } else {
    checks.push({
      check: "POLICY_HASH",
      result: CheckResult.SKIP,
      detail: "Policy not provided for verification",
    });
  }

  // 4. Verify trace hash
  if (trace) {
    const traceHash = await hashTrace(trace);
    const traceValid = traceHash === receipt.executionTraceHash;
    checks.push({
      check: "TRACE_HASH",
      result: traceValid ? CheckResult.PASS : CheckResult.FAIL,
      detail: traceValid
        ? "Execution trace hash matches"
        : "Execution trace hash mismatch — trace may have been modified",
    });
  } else {
    checks.push({
      check: "TRACE_HASH",
      result: CheckResult.SKIP,
      detail: "Trace not provided for verification",
    });
  }

  // 5. Verify evidence bundle
  if (evidenceBundle) {
    const evidenceHash = await hashEvidence(evidenceBundle);
    const evidenceValid = evidenceHash === receipt.evidenceRoot;
    checks.push({
      check: "EVIDENCE_COMMITMENT",
      result: evidenceValid ? CheckResult.PASS : CheckResult.FAIL,
      detail: evidenceValid
        ? "Evidence commitment matches"
        : "Evidence commitment mismatch",
    });
  }

  // 6. Verify intent/execution binding
  if (intent && trace) {
    const bindingValid = verifyIntentExecutionBinding(intent, trace);
    checks.push({
      check: "INTENT_EXECUTION_BINDING",
      result: bindingValid.valid ? CheckResult.PASS : CheckResult.FAIL,
      detail: bindingValid.detail,
    });
  }

  // 7. Verify state pinning
  const statePinningValid = verifyStatePinning(receipt);
  checks.push({
    check: "STATE_PINNING",
    result: statePinningValid ? CheckResult.PASS : CheckResult.FAIL,
    detail: statePinningValid
      ? "State pinning is consistent"
      : "State pinning inconsistency detected",
  });

  // Determine overall result (P0: required-evidence profile per claimed level)
  const claimedLevel = receipt.verificationLevel || "L2";
  const verdict = evaluateCheckVerdict(claimedLevel, checks);
  const result = verdict.verdict;

  return {
    receiptId: receipt.receiptId,
    result,
    verdict: verdict.verdict,
    verdictCode: verdict.code,
    verificationLevel: claimedLevel,
    required: verdict.required,
    requiredMissing: verdict.requiredMissing,
    failing: verdict.failing,
    checks,
    verifierVersion: "0.1.0",
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
}

/**
 * Verify intent/execution binding
 */
function verifyIntentExecutionBinding(intent, trace) {
  const violations = [];

  // Check target
  if (intent.target && trace.to) {
    if (intent.target.toLowerCase() !== trace.to.toLowerCase()) {
      violations.push({
        field: "target",
        expected: intent.target,
        observed: trace.to,
      });
    }
  }

  // Check value
  if (intent.amount && trace.value) {
    if (BigInt(intent.amount) < BigInt(trace.value)) {
      violations.push({
        field: "value",
        expected: `<= ${intent.amount}`,
        observed: trace.value,
      });
    }
  }

  // Check recipient (from calldata decode if TRANSFER)
  if (intent.recipient && intent.action === "TRANSFER") {
    const calldataRecipient = extractRecipientFromCalldata(
      trace.calldata,
      intent.selector
    );
    if (calldataRecipient) {
      if (intent.recipient.toLowerCase() !== calldataRecipient.toLowerCase()) {
        violations.push({
          field: "recipient",
          expected: intent.recipient,
          observed: calldataRecipient,
        });
      }
    }
  }

  if (violations.length > 0) {
    return {
      valid: false,
      detail: `Intent/execution mismatch: ${violations.map((v) => v.field).join(", ")}`,
      violations,
    };
  }

  return { valid: true, detail: "Execution matches committed intent" };
}

/**
 * Extract recipient from ERC-20 transfer calldata
 */
function extractRecipientFromCalldata(calldata, selector) {
  // transfer(address,uint256) = 0xa9059cbb
  // transferFrom(address,address,uint256) = 0x23b872dd
  if (!calldata || calldata.length < 10) return null;

  const actualSelector = calldata.slice(0, 10);

  if (actualSelector === "0xa9059cbb" && calldata.length >= 74) {
    return "0x" + calldata.slice(34, 74);
  }

  if (actualSelector === "0x23b872dd" && calldata.length >= 138) {
    return "0x" + calldata.slice(98, 138);
  }

  return null;
}

/**
 * Verify state pinning consistency
 */
function verifyStatePinning(receipt) {
  return (
    receipt.simulation &&
    receipt.simulation.blockNumber &&
    receipt.simulation.blockHash &&
    receipt.execution &&
    receipt.execution.blockNumber &&
    receipt.execution.blockHash
  );
}
