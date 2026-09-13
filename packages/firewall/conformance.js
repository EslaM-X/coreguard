/**
 * CoreGuard Firewall — Post-Execution Conformance (Q-FW8/Q-FW9a, §8 steps 7-9).
 *
 * Conformance observes what actually happened and compares it against the
 * frozen decision's declared intent/executionScope. It:
 *
 *  - NEVER re-decides and NEVER mutates a frozen decision record (I2);
 *  - emits a SEPARATE linked annotation record (conformanceRef keyed by the
 *    parent decision's `decisionRef`);
 *  - flags the DENY-verdict contradiction: a record that is `DENY` can never be
 *    presented as `VERIFIED`/`CONFORM` (Q-FW9a reuses the CGEP/1
 *    CONTRADICTION_SCAN surface — vocabulary extension, no new verifier meaning).
 *
 * The authoritative post-execution binding remains the B-1 verifier
 * (verifyProvenance, CONTRACT_EXECUTION_BINDING) — this module only annotates
 * the observed envelope against the declared one.
 */

import { freezeConformanceRecord, CONFORMANCE_DOMAIN, DENY } from "./decision-record.js";

/** Pure contradiction scan: a DENY record contradicted by a VERIFIED claim. */
export function contradictionScan({ record, claim }) {
  if (record && record.decision === DENY && (claim === "VERIFIED" || claim === "CONFORM")) {
    return { contradiction: true, flag: "DENY_VERDICT_CONTRADICTION", ref: record.decisionRef || null };
  }
  return { contradiction: false, flag: null, ref: null };
}

function eqLower(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

/**
 * Compare an observed execution against the frozen decision record's declared
 * executionScope. Returns mismatches without mutating the decision record.
 */
export function compareObserved({ decisionRecord, observed }) {
  const scope = (decisionRecord && decisionRecord.binding && decisionRecord.binding.executionScope) || {};
  const o = observed || {};
  const mismatches = [];

  if (o.executionRef && scope.chainId && !eqLower(String(o.executionRef.chainId), scope.chainId)) {
    mismatches.push(`executionRef.chainId ${o.executionRef.chainId} != declared ${scope.chainId}`);
  }
  if (o.recipient !== undefined && scope.recipient !== null && !eqLower(o.recipient, scope.recipient)) {
    mismatches.push(`observed recipient ${o.recipient} != declared ${scope.recipient}`);
  }
  if (o.amount !== undefined && scope.amount !== null && !eqLower(String(o.amount), String(scope.amount))) {
    mismatches.push(`observed amount ${o.amount} != declared ${scope.amount}`);
  }
  if (o.target !== undefined && scope.target !== null && !eqLower(o.target, scope.target)) {
    mismatches.push(`observed target ${o.target} != declared ${scope.target}`);
  }
  if (o.selector !== undefined && scope.selector !== null && !eqLower(o.selector, scope.selector)) {
    mismatches.push(`observed selector ${o.selector} != declared ${scope.selector}`);
  }
  return mismatches;
}

/**
 * Build (and freeze) a SEPARATE conformance annotation for a frozen decision
 * record. The parent decision record is never touched.
 *
 * @param {object} args
 * @param {object} args.decisionRecord frozen decision record
 * @param {object} args.observed       observed execution { executionRef, recipient?,
 *                                     amount?, target?, selector?, ... }
 * @param {string} [args.annotator]    annotating identity
 * @returns {Promise<{record, canonical, conformanceRef, mismatches}>}
 */
export async function annotateConformance({ decisionRecord, observed, annotator }) {
  if (!decisionRecord || typeof decisionRecord !== "object" || !Object.isFrozen(decisionRecord)) {
    throw new TypeError("annotateConformance: decisionRecord must be a frozen decision record");
  }
  const mismatches = compareObserved({ decisionRecord, observed });

  // Q-FW9a CONTRADICTION_SCAN: a DENY record contradicted by a conformance claim.
  const scan = contradictionScan({ record: decisionRecord, claim: "CONFORM" });
  if (scan.contradiction) mismatches.unshift(scan.flag);

  const conformance = mismatches.length === 0 ? "CONFORM" : "DIVERGED";

  const { record, canonical, conformanceRef } = await freezeConformanceRecord({
    ref: decisionRecord.decisionRef,
    decision: decisionRecord.decision,
    conformance,
    mismatches,
    observed: observed || {},
    at: (observed && observed.executionRef && observed.executionRef.blockNumber) || null,
    annotator: annotator || "UNKNOWN",
  });
  return { record, canonical, conformanceRef, mismatches, conformance };
}

export { CONFORMANCE_DOMAIN };