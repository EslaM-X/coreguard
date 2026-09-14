/**
 * CoreGuard WS-2 — Signed Intent SDK: verifyBinding recomputation pipeline
 * (spec/signed-intent-sdk.md §0/§4).
 *
 * WS-2 is a CONSUMER surface, NOT a source of truth. Every binding output is
 * independently re-derived from trusted inputs every call — never from a
 * caller-supplied `bindingRef`, `executionScope`, `authorized`, or `relayer`
 * claim (§4.0 red line). The full chain is recomputed:
 *
 *   intentRef → manifestId → bindingRef → executionScope (frozen record) →
 *   authority probe → independently derived result
 *
 * Hard rules enforced here:
 * - FSR-1: `executionScope` is read ONLY from the authoritative frozen decision
 *   record (`record.binding.executionScope`, content-addressed via
 *   `decisionRef = H("CGEP/1:FW-DECISION", record)`). A separately supplied
 *   intent-shaped/scope object is never authoritative.
 * - FSR-2: a caller-supplied `bindingRef` is comparison/reference metadata only;
 *   a mismatch ⇒ deterministic NOT_PROVEN (label BINDING_REFERENCE_MISMATCH),
 *   never OK/BOUND, never forwarded.
 * - Q-SDK5/Q-W2-4 (Q-FW10 seam): execution evidence is rejected with a
 *   TypeError (A6/A12 typed-shape rejection) — no PRE binding ever accepts it.
 * - Q-SDK7 (W2-I4): `from`/relayer never authorizes; `from` is EIP-1271
 *   eth_call caller context (probe semantics only).
 *
 * Zero-dep boundaries preserved (Q-SDK9/W2-I9): static imports only from local
 * zero-dep cores (canonical) and the two mandated WS-1 cores.
 */

import { canonicalize, domainHash } from "../canonical/index.js";
import {
  buildAuthorization,
  scopeOfIntent,
} from "../intent/authorization.js";
import { probeAuthorization } from "../provenance/authorization-probe.js";

/** CGEP/1:FW-DECISION domain — shared convention, declared locally for
 * independent recomputation (cross-checked against the Firewall by tests so a
 * drift is caught, not duplicated blindly). */
export const FW_DECISION_DOMAIN = "CGEP/1:FW-DECISION";
export const FW_DECISION_RECORD_VERSION = "CGEP/1:FW-DECISION/1";
const RECORD_KIND = "DECISION";

/** Q-FW10 temporal seam (Q-SDK5/Q-W2-4): these inputs are NEVER accepted by a
 * pre-execution binding call. Same policy as the decision engine's own
 * POST_EXECUTION_INPUTS guard, widened with txHash/receipt per Q-SDK5. */
const EXECUTION_EVIDENCE_KEYS = Object.freeze([
  "executionRef",
  "executionBinding",
  "CONTRACT_AUTHORIZATION",
  "CONTRACT_EXECUTION_BINDING",
  "executionBlock",
  "txHash",
  "receipt",
]);

/** Claim channels documented by W2-I2 (§4.2): `authorized` / `executionScope` /
 * `relayer` are NEVER read — feeding them changes nothing, and their values
 * never appear in any output. They are not recognized inputs; absent from the
 * destructure above on purpose. */

function guardSeam(args) {
  const present = EXECUTION_EVIDENCE_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(args, k));
  if (present.length > 0) {
    throw new TypeError(
      `sdk: pre-execution verifyBinding must NOT receive post-execution evidence (${present.join(", ")}) — Q-FW10 seam (Q-SDK5/Q-W2-4)`
    );
  }
}

function recomputedOf(semantics, instance) {
  if (!semantics || !instance) return null;
  return {
    intentRef: semantics.intentRef,
    manifestId: semantics.manifestId,
    bindingRef: instance.bindingRef,
  };
}

/** Recompute the content-address of a decision record body (strip `decisionRef`,
 * then H(CGEP/1:FW-DECISION, canonicalize(body)) — mirrors the Firewall's
 * freeze/decisionRecordRef convention). */
async function recomputeDecisionRef(record) {
  const { decisionRef: _ref, ...body } = record;
  return domainHash(FW_DECISION_DOMAIN, body);
}

/**
 * Derive the authoritative `executionScope` from the frozen decision record
 * (FSR-1). Fail-closed, in three checks:
 *   1. record shape (version/kind)       ⇒ NOT_RUN / DECISION_RECORD_INVALID
 *   2. content-address recomputation      ⇒ NOT_RUN / DECISION_RECORD_INVALID
 *   3. scope byte-identity (WS-1 SIA-I3)  ⇒ NOT_PROVEN / SCOPE_MISMATCH
 *
 * @returns {Promise<{ok:boolean, status?:string, label?:string, reason?:string,
 *                    executionScope?:object, decisionRef?:string}>}
 */
async function scopeFromFrozenRecord(intent, frozenRecord) {
  if (!frozenRecord || typeof frozenRecord !== "object") {
    return { ok: false, status: "NOT_RUN", label: "DECISION_RECORD_MISSING", reason: "authoritative frozen decision record is required (FSR-1) — without it executionScope cannot be derived" };
  }
  if (frozenRecord.version !== FW_DECISION_RECORD_VERSION || frozenRecord.kind !== RECORD_KIND) {
    return { ok: false, status: "NOT_RUN", label: "DECISION_RECORD_INVALID", reason: `frozenRecord must be { version: "${FW_DECISION_RECORD_VERSION}", kind: "${RECORD_KIND}", ... }` };
  }

  let decisionRef;
  try {
    decisionRef = await recomputeDecisionRef(frozenRecord);
  } catch (e) {
    return { ok: false, status: "NOT_RUN", label: "DECISION_RECORD_INVALID", reason: `decision record is not canonicalizable: ${e.message}` };
  }
  if (!String(frozenRecord.decisionRef || "").toLowerCase().startsWith("0x") ||
      String(frozenRecord.decisionRef || "").toLowerCase() !== decisionRef) {
    return { ok: false, status: "NOT_RUN", label: "DECISION_RECORD_INVALID", reason: "frozenRecord.decisionRef != H(CGEP/1:FW-DECISION, record) — content-address mismatch" };
  }

  const recordScope = frozenRecord.binding && frozenRecord.binding.executionScope;
  if (!recordScope || typeof recordScope !== "object") {
    return { ok: false, status: "NOT_PROVEN", label: "SCOPE_MISMATCH", reason: "frozen record carries no binding.executionScope; cannot derive a scope (WS-1 SIA-I3)" };
  }
  try {
    if (canonicalize(recordScope) !== canonicalize(scopeOfIntent(intent))) {
      return { ok: false, status: "NOT_PROVEN", label: "SCOPE_MISMATCH", reason: "frozen record binding.executionScope != predicted scopeOfIntent(intent) — byte identity violated (WS-1 SIA-I3)" };
    }
  } catch (e) {
    return { ok: false, status: "NOT_RUN", label: "DECISION_RECORD_INVALID", reason: `executionScope is not canonicalizable: ${e.message}` };
  }

  return { ok: true, executionScope: recordScope, decisionRef };
}

/**
 * Independently verify a signed intent authorization (WS-2 §4.0 red line).
 *
 * @param {object} args
 * @param {object} args.intent            canonical intent (recomputed, never trusted)
 * @param {object} args.declaration       signed declaration (recomputed, never trusted)
 * @param {object} args.frozenRecord      authoritative frozen DECISION record (FSR-1);
 *                                        absence ⇒ NOT_RUN/DECISION_RECORD_MISSING
 * @param {string} [args.callerBindingRef] reference-only bindingRef for FSR-2
 *                                         comparison; a mismatch ⇒ NOT_PROVEN/
 *                                         BINDING_REFERENCE_MISMATCH (never OK)
 * @param {object} [args.callerClaims]     discarded claims object (WS-1 §4.2) —
 *                                         never trusted, never echoed
 * @param {string} args.authorityAtState   decision/authority block (decimal string)
 * @param {object} [args.evm]              injected @coreguard/evm adapter (EOA/recovery)
 * @param {object} [args.contractAuth]     injected { ethCall, getCode } providers (EIP-1271)
 * @param {string} [args.from]             EIP-1271 eth_call caller context ONLY —
 *                                         probe semantics, never authorization (Q-SDK7)
 * @returns {Promise<{status, label?, reason?, stage?, recomputed?, semantics?,
 *                    instance?, executionScope?, decisionRef?, authority?}>}
 */
export async function verifyBinding(args = {}) {
  guardSeam(args);
  const {
    intent,
    declaration,
    frozenRecord,
    callerBindingRef,
    callerClaims,
    authorityAtState,
    evm,
    contractAuth,
    from,
  } = args;

  // Binding chain — independent recompute (WS-1 §4.3). callerClaims is
  // discarded inside buildAuthorization; never trusted.
  const binding = await buildAuthorization({ intent, declaration, callerClaims });
  if (binding.status !== "OK") {
    return {
      status: binding.status,
      label: binding.label,
      reason: binding.reason || null,
      stage: "binding",
      recomputed: recomputedOf(binding.semantics, binding.instance),
      semantics: binding.semantics || null,
      instance: binding.instance || null,
      executionScope: null,
      decisionRef: null,
      authority: null,
    };
  }

  const recomputed = recomputedOf(binding.semantics, binding.instance);

  // FSR-2 — caller-supplied bindingRef is reference-only comparison metadata.
  if (callerBindingRef !== undefined && callerBindingRef !== null) {
    if (String(callerBindingRef).toLowerCase() !== binding.instance.bindingRef) {
      return {
        status: "NOT_PROVEN",
        label: "BINDING_REFERENCE_MISMATCH",
        reason: "caller-supplied bindingRef != recomputed bindingRef (reference-only; FSR-2)",
        stage: "reference",
        recomputed,
        semantics: binding.semantics,
        instance: binding.instance,
        executionScope: null,
        decisionRef: null,
        authority: null,
      };
    }
  }

  // FSR-1 — executionScope derives from the authoritative frozen decision record.
  const scope = await scopeFromFrozenRecord(intent, frozenRecord);
  if (!scope.ok) {
    return {
      status: scope.status,
      label: scope.label,
      reason: scope.reason,
      stage: "scope",
      recomputed,
      semantics: binding.semantics,
      instance: binding.instance,
      executionScope: null,
      decisionRef: null,
      authority: null,
    };
  }

  // Authority — via injected adapters only (Q-SDK6). from is probe context
  // (EIP-1271 eth_call caller), never an authorizer (Q-SDK7/W2-I4).
  const authority = await probeAuthorization({
    signature: declaration.signature,
    signerBinding: declaration.signerBinding,
    manifestId: binding.semantics.manifestId,
    chainId: binding.semantics.chainId,
    authorityAtState,
    evm,
    contractAuth,
    from,
  });
  if (authority.status !== "OK") {
    return {
      status: authority.status,
      label: authority.label,
      reason: authority.reason || null,
      stage: "authority",
      recomputed,
      semantics: binding.semantics,
      instance: binding.instance,
      executionScope: scope.executionScope,
      decisionRef: scope.decisionRef,
      authority,
    };
  }

  return {
    status: "OK",
    label: "BOUND",
    reason: null,
    stage: null,
    recomputed,
    semantics: binding.semantics,
    instance: binding.instance,
    executionScope: scope.executionScope,
    decisionRef: scope.decisionRef,
    authority,
  };
}