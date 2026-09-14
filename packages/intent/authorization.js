/**
 * CoreGuard WS-1 — Signed Intent / Authorization Binding (additive).
 *
 * WS-1 is NOT a new source of truth. It defines and binds what a signer
 * authorized precisely, then hands the Firewall a RECOMPUTABLE / VERIFIABLE
 * binding input (spec/signed-intent-authorization.md §0/§4). This module
 * independently recomputes every link of the chain — intentRef → manifestId →
 * bindingRef — from the zero-dependency canonical core; it never trusts a
 * caller-supplied ref, boolean, or authority claim.
 *
 * Identities (TL-1 / MIT-4 split):
 *   semantics  = { intentRef, manifestId, scope, chainId, nonce, signer }
 *                — the semantic authorization identity ({intent, manifest
 *                scope, signer}); STABLE across re-signature instances.
 *   instance   = { bindingRef, signature }
 *                — the binding instance fingerprint; bindingRef =
 *                H("CGEP/1:FW-BINDING", {intentRef, manifestId, signature}).
 *                New signature BYTES ⇒ new bindingRef with the SAME
 *                semantics — never a scope widening, never a new
 *                authorization (A3.2 tamper-evidence preserved).
 *
 * Fail-closed: missing input ⇒ NOT_RUN; any hole ⇒ NOT_PROVEN. No
 * nonce-burning / replay registry (B-2, out of WS-1).
 */

import { canonicalize, domainHash, hashIntent } from "../canonical/index.js";

export const WS1_DOMAINS = Object.freeze({
  INTENT: "CGEP/1:INTENT",
  PROVENANCE: "CGEP/1:AGENT-PROVENANCE",
  BINDING: "CGEP/1:FW-BINDING",
});

export const DECLARATION_KIND = "INTENT_DECLARATION";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX64_RE = /^[0-9a-fA-F]{64}$/;

/** The signable core of a declaration (mirror of firewall declarationCore). */
export function declarationCore(declaration) {
  const { manifestId: _mid, signature: _sig, commit: _commit, ...core } = declaration;
  return core;
}

/** WS-1 intentRef = H("CGEP/1:INTENT", canonicalize(intent)). */
export async function computeIntentRef(intent) {
  return hashIntent(intent);
}

/** WS-1 manifestId — recomputed, never trusted from the declared value. */
export async function computeManifestId(declaration) {
  return domainHash(WS1_DOMAINS.PROVENANCE, declarationCore(declaration));
}

/** WS-1 bindingRef — closure/instance fingerprint incl. the signature leg. */
export async function computeBindingRef({ intentRef, manifestId, signature }) {
  return domainHash(WS1_DOMAINS.BINDING, { intentRef, manifestId, signature });
}

/** Predicted execution scope — the closed set {chainId, validAfter,
 * validUntil, target, selector, asset, amount, recipient} (envelope, not a
 * tx ref). */
export function scopeOfIntent(intent) {
  return {
    chainId: intent.chainId,
    validAfter: intent.validAfter ?? null,
    validUntil: intent.validUntil ?? null,
    target: intent.target ?? null,
    selector: intent.selector ?? null,
    asset: intent.asset ?? null,
    amount: intent.amount ?? null,
    recipient: intent.recipient ?? null,
  };
}

function signatureEnvelopeOk(signature, kind) {
  if (!signature || typeof signature !== "object") {
    return { ok: false, label: "NO_SIGNATURE", reason: "declaration.signature is required" };
  }
  if (!ADDRESS_RE.test(String(signature.signer || ""))) {
    return { ok: false, label: "SIG_SIGNER", reason: "signature.signer must be an address" };
  }
  if (signature.scheme === "EIP-712") {
    if (kind === "EIP1271") {
      return { ok: false, label: "CONSISTENCY_MISMATCH", reason: "EIP-712 envelope with kind EIP1271" };
    }
    if (!HEX64_RE.test(String(signature.r || "")) || !HEX64_RE.test(String(signature.s || ""))) {
      return { ok: false, label: "SIG_MALFORMED", reason: "r/s must each be 32 bytes of hex" };
    }
    if (/^[0]+$/.test(String(signature.r)) || /^[0]+$/.test(String(signature.s))) {
      return { ok: false, label: "SIG_MALFORMED", reason: "r/s must be non-zero" };
    }
    if (signature.v !== 27 && signature.v !== 28) {
      return { ok: false, label: "SIG_MALFORMED", reason: "v must be 27 or 28" };
    }
    return { ok: true };
  }
  if (signature.scheme === "EIP-1271") {
    if (kind !== "EIP1271") {
      return { ok: false, label: "CONSISTENCY_MISMATCH", reason: "EIP-1271 envelope requires kind EIP1271" };
    }
    if (typeof signature.bytes !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(signature.bytes)) {
      return { ok: false, label: "SIG_MALFORMED", reason: "signature.bytes must be even-length 0x hex" };
    }
    return { ok: true };
  }
  return { ok: false, label: "SIG_SCHEME", reason: 'signature.scheme must be "EIP-712" or "EIP-1271"' };
}

/**
 * Establish the WS-1 signed-intent / authorization binding by direct
 * recomputation. Caller-supplied claims (`callerClaims.bindingRef`,
 * `callerClaims.authorityOk`) are ALWAYS ignored (§4.2) — the whole chain is
 * re-derived from trusted inputs.
 *
 * @param {object} args
 * @param {object} args.intent          canonical intent (packages/intent)
 * @param {object} args.declaration     signed declaration (CGEP/1)
 * @param {object} [args.callerClaims]  discarded claims (never trusted)
 * @returns {Promise<{status, label?, reason?, semantics?, instance?}>}
 */
export async function buildAuthorization({ intent, declaration, callerClaims }) {
  if (!intent || typeof intent !== "object") {
    return { status: "NOT_RUN", label: "INTENT_MISSING", reason: "intent object is required" };
  }
  if (!declaration || typeof declaration !== "object") {
    return { status: "NOT_RUN", label: "DECLARATION_MISSING", reason: "declaration object is required" };
  }
  if (declaration.version !== "CGEP/1" || declaration.kind !== DECLARATION_KIND) {
    return { status: "NOT_PROVEN", label: "DECLARATION_INVALID", reason: 'declaration must be { version:"CGEP/1", kind:"INTENT_DECLARATION", ... }' };
  }

  const errors = [];
  const intentRef = await computeIntentRef(intent);

  const declaredIntent = declaration.intent;
  if (!declaredIntent || typeof declaredIntent !== "object") {
    errors.push("declaration.intent is required (the signed intent)");
  } else if (canonicalize(declaredIntent) !== canonicalize(intent)) {
    errors.push("declared intent != supplied intent (canonical mismatch)");
  }

  if (String(declaration.chainId || "") !== String(intent.chainId || "")) {
    errors.push("declaration.chainId != intent.chainId");
  }
  if (String(declaration.nonce ?? "") !== String(intent.nonce ?? "")) {
    errors.push("declaration.nonce != intent.nonce");
  }

  const signerBinding = declaration.signerBinding || {};
  const kind = signerBinding.kind === "EIP1271" ? "EIP1271" : "EOA";
  if (!ADDRESS_RE.test(String(signerBinding.address || ""))) {
    errors.push("signerBinding.address must be an address");
  } else if (signerBinding.address.toLowerCase() !== String(intent.signer || "").toLowerCase()) {
    errors.push("signerBinding.address != intent.signer");
  }
  if (kind === "EOA" && signerBinding.kind === "EIP1271") {
    errors.push('signerBinding.kind must be "EOA" or "EIP1271"');
  }

  const envelope = signatureEnvelopeOk(declaration.signature, kind);
  if (!envelope.ok) errors.push(`signature: ${envelope.reason}`);

  let manifestId;
  try {
    manifestId = await computeManifestId(declaration);
  } catch {
    errors.push("declaration is not canonicalizable");
  }
  if (manifestId && String(declaration.manifestId || "").toLowerCase() !== manifestId) {
    errors.push(`declaration.manifestId != recomputed manifestId (${manifestId})`);
  }

  const bindingRef = await computeBindingRef({ intentRef, manifestId, signature: declaration.signature });

  const semantics = {
    intentRef,
    manifestId,
    scope: scopeOfIntent(intent),
    chainId: String(intent.chainId || ""),
    nonce: String(intent.nonce ?? ""),
    signer: String(intent.signer || "").toLowerCase(),
  };
  const instance = { bindingRef, signature: declaration.signature };

  if (errors.length > 0) {
    return {
      status: "NOT_PROVEN",
      label: "DECLARATION_NOT_BOUND",
      reason: errors.join("; "),
      semantics,
      instance,
    };
  }

  return { status: "OK", label: "BOUND", semantics, instance };
}

/**
 * Fail-closed decision integration (WS-1 §7 boundary): binding ∧ authority
 * probe are NECESSARY, never sufficient, for a decision. This only decides
 * whether a validated `{ intent, declaration }` pair may be FORWARDED to the
 * Firewall — it never decides, never forwards a broken binding, and never
 * crosses the Q-FW10 seam.
 *
 * @returns {Promise<{ok:boolean, stage?, status?, label?, reason?,
 *                    semantics?, instance?, authority?, decisionInputs?}>}
 */
export async function authorizeForDecision({
  intent,
  declaration,
  evm,
  contractAuth,
  authorityAtState,
  from,
  callerClaims,
}) {
  const binding = await buildAuthorization({ intent, declaration, callerClaims });
  if (binding.status !== "OK") {
    return { ok: false, stage: "binding", status: binding.status, label: binding.label, reason: binding.reason, decisionInputs: null };
  }

  const { probeAuthorization } = await import("../provenance/authorization-probe.js");
  const authority = await probeAuthorization({
    signature: declaration.signature,
    signerBinding: declaration.signerBinding,
    manifestId: binding.semantics.manifestId,
    chainId: binding.semantics.chainId,
    evm,
    contractAuth,
    authorityAtState,
    from,
  });
  if (authority.status !== "OK") {
    return { ok: false, stage: "authority", authority, semantics: binding.semantics, instance: binding.instance, decisionInputs: null };
  }

  return {
    ok: true,
    semantics: binding.semantics,
    instance: binding.instance,
    authority,
    decisionInputs: { intent, declaration },
  };
}