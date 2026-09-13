/**
 * CoreGuard Firewall — Review Resolution (Q-FW2a / Q-FW9a).
 *
 * Converting `REQUIRE_REVIEW → ALLOW` is permitted ONLY as a NEW, fully
 * documented decision record — never as a mutation of the prior record. It
 * cannot invent or override authority/policy/simulation results: the resolution
 * re-runs the full §9 predicate on the SAME bound inputs with the previously
 * unresolved model term supplied, and only an ALLOW result is admitted.
 *
 * Hard rules:
 *  - The parent record MUST be a frozen REQUIRE_REVIEW decision; a DENY parent
 *    can never be reviewed into ALLOW (DENY → ALLOW is forbidden, Q-FW2a).
 *  - The reviewer MUST be in the configured review path's `writers` list;
 *    an unauthorized writer is invalid ⇒ DENY-equivalent (Q-FW9a).
 *  - The resulting resolution record is frozen and linked via `ref`.
 */

import { decideFirewall } from "./decision.js";
import {
  freezeResolutionRecord,
  RESOLUTION_RECORD_VERSION,
  REQUIRE_REVIEW,
} from "./decision-record.js";

const ADDRESS_WRITER = /^0x[0-9a-fA-F]{40}$/;

/**
 * Resolve a REQUIRE_REVIEW decision.
 *
 * @param {object} args
 * @param {object} args.parentRecord       the frozen REQUIRE_REVIEW decision record
 * @param {string} args.writer             reviewer identity (must be authorized)
 * @param {object} args.reviewPath         { configured: true, writers: string[] }
 * @param {object} args.resolvedSimulation the completed model summary
 * @param {string} args.reason             documented review reason
 * @param {object} args.inputs              decision inputs (intent/declaration/
 *                                          policy/activePolicyIds/authorityAtState/
 *                                          evm/contractAuth/...)
 * @returns {Promise<{admitted, decision?, resolution?, decisionRecord?, error?}>}
 */
export async function resolveReview({
  parentRecord,
  writer,
  reviewPath,
  resolvedSimulation,
  reason: reviewReason,
  inputs,
}) {
  if (!parentRecord || typeof parentRecord !== "object" || !Object.isFrozen(parentRecord)) {
    return { admitted: false, error: "parentRecord must be a frozen decision record" };
  }
  if (parentRecord.decision !== REQUIRE_REVIEW) {
    return {
      admitted: false,
      error: `review resolution is only defined for REQUIRE_REVIEW; parent is ${parentRecord.decision} (DENY → ALLOW is forbidden)`,
    };
  }
  if (!reviewPath || reviewPath.configured !== true) {
    return { admitted: false, error: "no configured review path for resolution" };
  }
  const writers = Array.isArray(reviewPath.writers) ? reviewPath.writers : [];
  const writerOk = writers.some((w) =>
    ADDRESS_WRITER.test(String(w)) && String(w).toLowerCase() === String(writer).toLowerCase()
  );
  if (!writerOk) {
    return { admitted: false, error: `review writer ${writer} is not authorized by the review path (Q-FW9a)` };
  }
  if (!resolvedSimulation || typeof resolvedSimulation !== "object") {
    return { admitted: false, error: "resolveReview requires a completed (resolved) simulation summary" };
  }

  // Re-run the full §9 predicate with the resolved model term (Q-FW2a: a
  // resolution cannot override authority/policy/simulation — it re-checks them).
  let outcome;
  try {
    outcome = await decideFirewall({ ...(inputs || {}), simulation: resolvedSimulation });
  } catch (e) {
    return { admitted: false, error: `re-decision failed: ${e.message}` };
  }

  const parentRef = parentRecord.decisionRef;
  const at = outcome.record.blockTimestamp || null;

  if (outcome.decision !== "ALLOW") {
    return {
      admitted: false,
      error: `resolution re-decision did not yield ALLOW (got ${outcome.decision}); only ALLOW is admitted (Q-FW2a/Q-FW9a)`,
      redecided: outcome.decision,
    };
  }

  const { record: resolution, canonical, resolutionRef } = await freezeResolutionRecord({
    ref: parentRef,
    from: REQUIRE_REVIEW,
    to: outcome.decision,
    at,
    writer,
    reason: reviewReason || "review resolved the outstanding obligation",
  });

  return { admitted: true, decision: outcome.decision, resolution, resolutionRef, canonical, decisionRecord: outcome.record };
}

export { RESOLUTION_RECORD_VERSION };