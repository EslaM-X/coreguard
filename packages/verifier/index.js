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
  hashStateDelta,
  computeReceiptId,
} from "../canonical/index.js";
import { evaluatePolicy } from "../policy/index.js";
import { computeCanonicalStateDelta } from "../trace/index.js";
import { verifyIntentSignature } from "../crypto/index.js";
import { planTraceReplay } from "../replay/index.js";

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

/**
 * Levels that exist in the protocol but are NOT claimable in v0.1 (no runtime
 * pathway). Claiming one yields INCONCLUSIVE — matching scripts/anchor-verdict.mjs.
 */
export const UNCLAIMABLE_LEVELS_V = ["L3", "L4"];

/** Evidence that improves confidence but is never required at any level. */
export const OPTIONAL_CHECKS_V = [
  "EVIDENCE_COMMITMENT",
  "SIGNER_AUTHENTICATION",
  "POLICY_EVAL",
  "STATE_DELTA_CANONICAL",
  "REPLAY_CONSISTENCY",
];

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
    // Exist-but-unclaimable levels inherit the anchor semantics: INCONCLUSIVE.
    if (UNCLAIMABLE_LEVELS_V.includes(level)) {
      return {
        verdict: "INCONCLUSIVE",
        code: "LEVEL_UNAVAILABLE",
        required: [],
        requiredMissing: [],
        failing: [],
        reason: `Level "${level}" is not claimable in v0.1 — INCONCLUSIVE (no runtime pathway).`,
      };
    }
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
  let replay = null;

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

  // 5b. Verify canonical state-delta commitment (P1) — only when the caller
  //     committed via the CGEP/1:STATEDELTA scheme (explicit opt-in).
  if (evidenceBundle?.stateDeltaScheme === "CGEP/1:STATEDELTA" && trace) {
    const recomputedDelta = computeCanonicalStateDelta(trace);
    const recomputedHash = await hashStateDelta(recomputedDelta);
    const matches = recomputedHash === evidenceBundle.stateDeltaHash;
    checks.push({
      check: "STATE_DELTA_CANONICAL",
      result: matches ? CheckResult.PASS : CheckResult.FAIL,
      detail: matches
        ? "Canonical state delta commitment matches (CGEP/1:STATEDELTA)"
        : "State delta commitment mismatch — recomputed delta does not rehash",
    });
  }

  // 5c. Deterministic policy re-evaluation (P1) — the committed policy must be
  //     SATISFIED by the observed execution, evaluated from the trace alone.
  if (policy && trace) {
    const policyResult = evaluatePolicy(policy, policyContextFromTrace(intent, trace));
    const satisfied = policyResult.result === "SATISFIED";
    const failing = satisfied
      ? []
      : policyResult.rules.filter((r) => r.result === "FAIL");
    checks.push({
      check: "POLICY_EVAL",
      result: satisfied ? CheckResult.PASS : CheckResult.FAIL,
      detail: satisfied
        ? "Policy re-evaluation satisfied against observed execution"
        : `Policy violated: ${failing
            .map((r) => `${r.ruleId}(${r.expected})`)
            .join(", ")}`,
    });
  }

  // 5d. Signer authentication (P1) — when the intent carries full
  //     authentication material (signature + signerPubKey), the signature MUST
  //     be valid, in-range, bound to the intent digest and derived from the
  //     committed signer. Empty/partial material -> fail-closed FAIL (the
  //     presence of a signature is never silently ignored). Absent material ->
  //     check omitted (intents are verifiable unsigned at L0/L1).
  if (intent?.signature) {
    const auth = await verifyIntentSignature(intent);
    checks.push({
      check: "SIGNER_AUTHENTICATION",
      result: auth.valid ? CheckResult.PASS : CheckResult.FAIL,
      detail: auth.valid
        ? `Intent signature valid (${auth.recovered})`
        : `Intent signature invalid: ${auth.reason}`,
    });
  }

  // 5e. Deterministic replay consistency (P1, L2 tier) — the committed trace
  //     must re-derive a STRUCTURALLY POSSIBLE execution plan: legal DFS call
  //     tree, root identity, gas coherence, canonical integers. A
  //     self-contradictory trace can never be credible evidence.
  if (trace) {
    replay = await planTraceReplay(trace);
    checks.push({
      check: "REPLAY_CONSISTENCY",
      result: replay.valid ? CheckResult.PASS : CheckResult.FAIL,
      detail: replay.valid
        ? `Replay plan coherent (${replay.frames} frame(s))`
        : `Replay plan contradicts itself: ${replay.errors.join("; ")}`,
    });
  }

  // 6. Verify intent/execution binding
  if (intent && trace) {
    const bindingValid = verifyIntentExecutionBinding(intent, trace, receipt);
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
    replay: trace ? { digest: replay.digestHex, frames: replay.frames } : undefined,
    verifierVersion: "0.1.0",
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
}

/**
 * Verify intent/execution binding
 *
 * Every intent field that has a machine-observable counterpart in the trace is
 * enforced when BOTH sides are present (traces normalized before P1 may lack
 * nonce/gas fields — absence is not a violation, but presence IS enforced).
 * A committed field can never be silently skipped when the evidence is there.
 */
function verifyIntentExecutionBinding(intent, trace, receipt) {
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

  // Check signer/sender — the executor must be the committed signer
  if (intent.signer && trace.from) {
    if (intent.signer.toLowerCase() !== trace.from.toLowerCase()) {
      violations.push({
        field: "signer",
        expected: intent.signer,
        observed: trace.from,
      });
    }
  }

  // Check selector — the invoked function must be the committed selector
  if (intent.selector && trace.calldata && trace.calldata.length >= 10) {
    const observedSelector = trace.calldata.slice(0, 10).toLowerCase();
    if (intent.selector.toLowerCase() !== observedSelector) {
      violations.push({
        field: "selector",
        expected: intent.selector,
        observed: observedSelector,
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

  // Check nonce — anti-replay binding when the trace carries the sender nonce
  if (
    intent.nonce !== undefined &&
    intent.nonce !== null &&
    trace.nonce !== undefined &&
    trace.nonce !== null
  ) {
    if (String(intent.nonce).toLowerCase() !== String(trace.nonce).toLowerCase()) {
      violations.push({
        field: "nonce",
        expected: String(intent.nonce),
        observed: String(trace.nonce),
      });
    }
  }

  // Check validity window — authorization freshness against the mined block
  if (trace.blockTimestamp !== undefined && trace.blockTimestamp !== null) {
    const mined = BigInt(trace.blockTimestamp || "0");
    if (intent.validAfter !== undefined && intent.validAfter !== "") {
      if (BigInt(intent.validAfter) > mined) {
        violations.push({
          field: "validAfter",
          expected: `>= ${intent.validAfter}`,
          observed: String(trace.blockTimestamp),
        });
      }
    }
    if (intent.validUntil !== undefined && intent.validUntil !== "") {
      if (BigInt(intent.validUntil) < mined) {
        violations.push({
          field: "validUntil",
          expected: `<= ${intent.validUntil}`,
          observed: String(trace.blockTimestamp),
        });
      }
    }
  }

  // Check chain binding — intent and receipt must commit to the same chainId
  if (intent.chainId && receipt && receipt.chainId) {
    if (String(intent.chainId) !== String(receipt.chainId)) {
      violations.push({
        field: "chainId",
        expected: String(intent.chainId),
        observed: String(receipt.chainId),
      });
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
 * Build the deterministic policy context from the trace alone (P1).
 * Mirrors the pipeline's evaluatePolicy context so the verifier re-evaluates
 * the committed policy identically without trusting a stored evaluation.
 */
function policyContextFromTrace(intent, trace) {
  const calldata = trace.calldata || "0x";
  const selector = calldata.slice(0, 10).toLowerCase();
  let recipient = null;
  if (selector === "0xa9059cbb" && calldata.length >= 74) {
    recipient = "0x" + calldata.slice(34, 74);
  } else if (selector === "0x23b872dd" && calldata.length >= 138) {
    recipient = "0x" + calldata.slice(98, 138);
  }
  return {
    value: trace.value ?? intent?.amount ?? "0",
    target: trace.to || "0x",
    recipient: recipient || intent?.recipient || "0x",
    selector,
    blockTimestamp: trace.blockTimestamp || "0",
    slippageBps: trace.slippageBps || "0",
    gasUsed: trace.gasUsed || "0",
    priceBps: trace.priceBps || "10000",
  };
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
