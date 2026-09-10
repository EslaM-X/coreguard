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

  // Determine overall result
  const failedChecks = checks.filter((c) => c.result === CheckResult.FAIL);
  const skippedChecks = checks.filter((c) => c.result === CheckResult.SKIP);

  let result;
  if (failedChecks.length > 0) {
    result = "INVALID";
  } else if (skippedChecks.length > 2) {
    result = "UNVERIFIABLE";
  } else {
    result = "VERIFIED";
  }

  return {
    receiptId: receipt.receiptId,
    result,
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
