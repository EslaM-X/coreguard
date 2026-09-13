/**
 * CoreGuard Firewall — Policy Commitment + Evaluation (Q-FW3 / Q-FW3a / Q-FW3b).
 *
 * - Q-FW3: evaluation is ONLY against the committed policy hash (recomputed,
 *   never trusted). A mismatched resolution id ⇒ FAIL ⇒ DENY.
 * - Q-FW3a: a policyHash is admissible only when the `policyId` is ACTIVE at
 *   decision time (no silent rollback) and — when a trust surface is supplied —
 *   the policy's actor reaches the firewall's configured anchors/owners.
 * - Q-FW3b: the evaluation context is derived EXCLUSIVELY from the bound intent
 *   + the recorded simulation summary; there is no independently-suppliable
 *   context object.
 *
 * Review rules (type "REQUIRE_REVIEW") are detected as review obligations and
 * are NOT evaluated by the rule engine; any other unbound rule type fails closed
 * (VIOLATED ⇒ DENY).
 */

import { evaluatePolicy } from "../policy/index.js";
import { hashPolicy } from "../canonical/index.js";

const ACTOR_KEYS = ["owner", "publisher", "attestor"];

/**
 * Evaluate the committed policy for a decision.
 *
 * @param {object} args
 * @param {object} args.policy             committed policy object (createPolicy shape)
 * @param {string} [args.expectedPolicyHash] declared policy hash; when present must
 *                                          equal the recomputed hash
 * @param {string[]} [args.activePolicyIds] currently-active policy ids (anti-rollback)
 * @param {object}  [args.policyTrust]     { anchors: string[] } optional trust surface
 * @param {object}  args.intent            bound intent (context source, Q-FW3b)
 * @param {object}  [args.simulation]      recorded simulation summary (context source)
 * @param {string}  [args.blockTimestamp]  decision-time block timestamp
 * @returns {Promise<{status, label?, reason?, policyId?, policyHash?,
 *                    rules?, reviewObligation, context}>}
 */
export async function evaluatePolicyForDecision({
  policy,
  expectedPolicyHash,
  activePolicyIds,
  policyTrust,
  intent,
  simulation,
  blockTimestamp,
}) {
  if (!policy || typeof policy !== "object" || !Array.isArray(policy.rules)) {
    return { status: "NOT_RUN", label: "POLICY_UNVERIFIABLE", reason: "committed policy object is required", reviewObligation: false, context: null };
  }

  const policyHash = await hashPolicy(policy);
  if (expectedPolicyHash && String(expectedPolicyHash).toLowerCase() !== policyHash) {
    return { status: "FAIL", label: "POLICY_HASH_MISMATCH", reason: `declared ${expectedPolicyHash} != recomputed ${policyHash}`, policyId: policy.policyId, policyHash, reviewObligation: false, context: null };
  }

  if (!Array.isArray(activePolicyIds) || activePolicyIds.length === 0) {
    return { status: "NOT_RUN", label: "ACTIVATION_UNKNOWN", reason: "activePolicyIds must be a non-empty list (Q-FW3a fail-closed)", policyId: policy.policyId, policyHash, reviewObligation: false, context: null };
  }
  if (!activePolicyIds.includes(String(policy.policyId))) {
    return { status: "FAIL", label: "POLICY_NOT_ACTIVE", reason: `policyId ${policy.policyId} is not active at decision time — silent rollback rejected`, policyId: policy.policyId, policyHash, reviewObligation: false, context: null };
  }

  if (policyTrust && Array.isArray(policyTrust.anchors) && policyTrust.anchors.length > 0) {
    const actor = ACTOR_KEYS.map((k) => String(policy[k] || "")).find((v) => /^0x[0-9a-fA-F]{40}$/.test(v));
    const anchors = policyTrust.anchors.map((a) => String(a).toLowerCase());
    if (!actor || !anchors.includes(actor.toLowerCase())) {
      return { status: "FAIL", label: "POLICY_NOT_TRUSTED", reason: `policy ${policy.policyId} is not reachable from the firewall trust anchors`, policyId: policy.policyId, policyHash, reviewObligation: false, context: null };
    }
  }

  // Q-FW3b: context derived ONLY from the bound intent + the simulation summary.
  const context = {
    value: intent.amount ?? null,
    target: intent.target ?? null,
    selector: intent.selector ?? null,
    recipient: intent.recipient ?? null,
    gasUsed: simulation?.gasUsed ?? null,
    slippageBps: simulation?.slippageBps ?? null,
    priceBps: simulation?.priceBps ?? null,
    blockTimestamp: simulation?.blockTimestamp ?? blockTimestamp ?? null,
  };

  const reviewRules = policy.rules.filter((r) => r && r.type === "REQUIRE_REVIEW");
  const enforceable = policy.rules.filter((r) => !(r && r.type === "REQUIRE_REVIEW"));
  let reviewObligation = reviewRules.length > 0;

  let evalResult;
  try {
    evalResult = evaluatePolicy({ ...policy, rules: enforceable }, context);
  } catch {
    return { status: "NOT_RUN", label: "POLICY_EVAL_ERROR", reason: "policy evaluation could not complete (context gap)", policyId: policy.policyId, policyHash, reviewObligation, context };
  }
  if (evalResult.result !== "SATISFIED") {
    return { status: "VIOLATED", label: "POLICY_VIOLATED", reason: "one or more policy rules fail", policyId: policy.policyId, policyHash, rules: evalResult.rules, reviewObligation, context };
  }

  return { status: "SATISFIED", label: "POLICY_SATISFIED", policyId: policy.policyId, policyHash, rules: evalResult.rules, reviewObligation, context };
}