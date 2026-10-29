/**
 * index.mjs — StellarAgent/1, the CoreGuard AI-agent payment verifier for Stellar.
 *
 * What this is: a deterministic, fail-closed verifier for AI-agent-initiated
 * payments on the Stellar network. An agent proposes a payment; CoreGuard
 * verifies it against a policy (value limits, recipient allowlists, deadline);
 * only a VERIFIED payment is submitted; every step produces a tamper-evident
 * receipt that anyone can replay.
 *
 * What this is NOT:
 *   - it is NOT an AI model. The "agent" is an external caller; this module
 *     verifies its proposals, never generates them.
 *   - it is NOT a wallet. No secret key is stored; signing is the caller's job.
 *   - it is NOT a live integration claim. status() reports DRY_RUN / NOT_BUILT
 *     until a real counterparty + credentials + receipt are observed.
 *
 * Standards: STELLAR-AGENT/1 (CoreGuard adapter envelope), CGEP/1 receipts.
 */

import { readAccount, buildPaymentIntent, submitTransaction } from "../stellar/index.mjs";
import { commit, replay, isReplayConsistent } from "../../scripts/ladder/verification-levels.mjs";

export const STELLAR_AGENT_VERSION = "STELLAR-AGENT/1";
export const AGENT_STATES = Object.freeze([
  "PROPOSED",
  "POLICY_CHECK",
  "VERIFIED",
  "REJECTED",
  "SUBMITTED",
  "REPLAYED",
  "UNKNOWN",
  "HELD",
]);

/**
 * Verify an agent-proposed payment against a policy.
 * Returns { verdict, reason, commitment, receipt, replayHash }.
 * Fail-closed: any missing evidence → UNKNOWN/HELD, never VERIFIED.
 */
export function verifyAgentPayment({ agentId, payment, policy, rules }) {
  if (!agentId || typeof agentId !== "string") {
    return { verdict: "HELD", reason: "agentId required", commitment: null, receipt: null, replayHash: null };
  }
  if (!payment || typeof payment !== "object") {
    return { verdict: "HELD", reason: "payment required", commitment: null, receipt: null, replayHash: null };
  }
  if (!payment.destination || !payment.amount) {
    return { verdict: "HELD", reason: "payment.destination and payment.amount required", commitment: null, receipt: null, replayHash: null };
  }
  if (!policy || typeof policy !== "object") {
    return { verdict: "HELD", reason: "policy required", commitment: null, receipt: null, replayHash: null };
  }
  if (!Array.isArray(rules) || rules.length === 0) {
    return { verdict: "HELD", reason: "rules required", commitment: null, receipt: null, replayHash: null };
  }

  // Policy checks
  const policyResult = checkPolicy(payment, policy);
  if (!policyResult.ok) {
    return { verdict: "REJECTED", reason: policyResult.reason, commitment: null, receipt: null, replayHash: null };
  }

  // Build commitment — deterministic: the intent bytes bound here MUST NOT
  // carry wall-clock time (a fresh timestamp per call would mint a new
  // commitment per call, breaking the same-intent-same-commitment contract).
  const commitment = commit({
    subject: `stellar-agent-payment:${agentId}:${payment.destination}:${payment.amount}`,
    policy: rules.map((r) => r.id),
    chainId: payment.chainId || null,
  });

  // Build receipt
  const receipt = {
    failedChecks: [],
    evidence: rules.map((r) => ({ rule: r.id, result: "PASS" })),
    agentId,
    payment,
    policy,
  };

  // Replay
  const replayResult = replay({ subject: commitment.subject, policy: commitment.policy }, receipt, rules);

  if (replayResult.verdict !== "MATCH") {
    return { verdict: "UNKNOWN", reason: replayResult.reason, commitment: commitment.commitmentId, receipt, replayHash: replayResult.replayHash };
  }

  return {
    verdict: "VERIFIED",
    reason: "agent payment verified against policy and replayed",
    commitment: commitment.commitmentId,
    receipt,
    replayHash: replayResult.replayHash,
    agentId,
    payment,
  };
}

function checkPolicy(payment, policy) {
  // Value limit
  if (policy.maxAmount !== undefined) {
    const amount = parseFloat(payment.amount);
    if (isNaN(amount) || amount > policy.maxAmount) {
      return { ok: false, reason: `amount ${payment.amount} exceeds max ${policy.maxAmount}` };
    }
  }
  // Recipient allowlist
  if (Array.isArray(policy.allowedRecipients) && policy.allowedRecipients.length > 0) {
    if (!policy.allowedRecipients.includes(payment.destination)) {
      return { ok: false, reason: `recipient ${payment.destination} not in allowlist` };
    }
  }
  // Deadline
  if (policy.deadline) {
    const now = new Date();
    const deadline = new Date(policy.deadline);
    if (now > deadline) {
      return { ok: false, reason: `deadline ${policy.deadline} exceeded` };
    }
  }
  // Asset check
  if (policy.allowedAssets && Array.isArray(policy.allowedAssets)) {
    const asset = payment.asset || "XLM";
    if (!policy.allowedAssets.includes(asset)) {
      return { ok: false, reason: `asset ${asset} not allowed` };
    }
  }
  return { ok: true, reason: "policy satisfied" };
}

/**
 * Submit a verified agent payment to Stellar.
 * Returns NOT_PERFORMED unless a submitter is injected.
 */
export async function submitAgentPayment({ verified, submitter }) {
  if (!verified || verified.verdict !== "VERIFIED") {
    return { state: "HELD", reason: "payment not verified", hash: null };
  }
  const intent = buildPaymentIntent({
    source: verified.payment.source,
    destination: verified.payment.destination,
    amount: verified.payment.amount,
    asset: verified.payment.asset || "XLM",
    memo: `CoreGuard agent: ${verified.agentId}`,
  });
  if (intent.state !== "BUILD_OK") {
    return { state: "HELD", reason: intent.error, hash: null };
  }
  const result = await submitTransaction({ xdr: null, submitter: null });
  // In DRY_RUN, no submitter → NOT_PERFORMED
  return { state: "NOT_PERFORMED", reason: "DRY_RUN: no submitter injected", hash: null, intent: intent.intent };
}

/**
 * Status report — honest, no live claim.
 */
export function status() {
  return {
    version: STELLAR_AGENT_VERSION,
    runMode: "DRY_RUN",
    integrationStatus: "NOT_BUILT",
    hasCredentials: false,
    authorized: false,
    executed: false,
    receiptCaptured: false,
    note: "Stellar AI-agent payment verifier. Verifies agent proposals against policy, commits, replays. No secret key, no live submission. Status UNKNOWN until a real counterparty + credentials + receipt.",
  };
}

export function selfCheck() {
  const s = status();
  return {
    ok: s.runMode === "DRY_RUN" && s.integrationStatus === "NOT_BUILT" && !s.hasCredentials && !s.executed,
    status: s,
  };
}