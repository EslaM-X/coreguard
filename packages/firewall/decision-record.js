/**
 * CoreGuard Firewall — Decision Record (Frozen) (Q-FW6/Q-FW6a).
 *
 * A decision record is a self-describing, replayable object that is FROZEN at
 * decision time. Its identity is content-derived:
 *
 *   decisionRef = H("CGEP/1:FW-DECISION" || canonicalize(recordWithoutDecisionRef))
 *
 * Canonical/deterministic serialization happens BEFORE hashing (repo invariant,
 * `@coreguard/canonical.canonicalize`), so different representations of the same
 * record can never produce different refs, and any mutation changes the ref —
 * a record with different content can never claim the same `decisionRef`.
 *
 * Post-hoc annotation (conformance) is a SEPARATE linked record keyed by the
 * decision `decisionRef`; it is never an in-place edit. Review resolutions are
 * likewise new frozen records (Q-FW2a).
 */

import { canonicalize, domainHash } from "../canonical/index.js";

export const DECISION_DOMAIN = "CGEP/1:FW-DECISION";
export const RESOLUTION_DOMAIN = "CGEP/1:FW-RESOLUTION";
export const CONFORMANCE_DOMAIN = "CGEP/1:FW-CONFORMANCE";
export const BINDING_DOMAIN = "CGEP/1:FW-BINDING";

export const ALLOW = "ALLOW";
export const DENY = "DENY";
export const REQUIRE_REVIEW = "REQUIRE_REVIEW";
export const DECISIONS = Object.freeze([ALLOW, DENY, REQUIRE_REVIEW]);

export const DECISION_RECORD_VERSION = "CGEP/1:FW-DECISION/1";
export const RESOLUTION_RECORD_VERSION = "CGEP/1:FW-RESOLUTION/1";
export const CONFORMANCE_RECORD_VERSION = "CGEP/1:FW-CONFORMANCE/1";

/** Deep-freeze an object so a frozen record can never be mutated. */
export function deepFreeze(obj) {
  if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const key of Object.keys(obj)) {
      deepFreeze(obj[key]);
    }
  }
  return obj;
}

/** Canonical, deterministic bytes of a record (before hashing). */
export function canonicalRecord(record) {
  return canonicalize(record);
}

/**
 * Decision-ref of a record WITHOUT its `decisionRef` field (Q-FW6a):
 *   H("CGEP/1:FW-DECISION" || canonicalize(core))
 */
export async function decisionRecordRef(core) {
  const { decisionRef: _ref, ...body } = core;
  return domainHash(DECISION_DOMAIN, body);
}

/**
 * Freeze a decision record: computes the content-derived `decisionRef`, then
 * deep-freezes. Returns `{ record, canonical, decisionRef }` where `canonical`
 * is the canonical serialization used for the hash (replayable/auditable).
 */
export async function freezeDecisionRecord(core) {
  const { decisionRef: _ref, ...body } = core;
  const canonical = canonicalize(body);
  const decisionRef = await domainHash(DECISION_DOMAIN, JSON.parse(canonical));
  const record = deepFreeze({ ...body, decisionRef });
  return { record, canonical, decisionRef };
}

/**
 * A review-resolution record is a NEW frozen record linked to the parent
 * decision via `ref` (Q-FW2a/Q-FW9a) — never a mutation of the parent.
 * Hash domain: "CGEP/1:FW-RESOLUTION".
 */
export async function freezeResolutionRecord({ ref, from, to, reason, at, writer }) {
  const body = {
    version: RESOLUTION_RECORD_VERSION,
    kind: "RESOLUTION",
    ref,
    from,
    to,
    at,
    writer,
    reason,
  };
  const canonical = canonicalize(body);
  const resolutionRef = await domainHash(RESOLUTION_DOMAIN, JSON.parse(canonical));
  return { record: deepFreeze({ ...body, resolutionRef }), canonical, resolutionRef };
}

/**
 * A conformance annotation is a SEPARATE record linked by `ref` to the parent
 * decision record. It never touches the parent (I2). Hash domain:
 * "CGEP/1:FW-CONFORMANCE".
 */
export async function freezeConformanceRecord({ ref, decision, conformance, mismatches, observed, at, annotator }) {
  const body = {
    version: CONFORMANCE_RECORD_VERSION,
    kind: "CONFORMANCE",
    ref,
    decision,
    conformance,
    mismatches,
    observed,
    at,
    annotator,
  };
  const canonical = canonicalize(body);
  const conformanceRef = await domainHash(CONFORMANCE_DOMAIN, JSON.parse(canonical));
  return { record: deepFreeze({ ...body, conformanceRef }), canonical, conformanceRef };
}