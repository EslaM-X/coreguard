/**
 * CoreGuard Firewall — Declaration Binding (Q-FW4 / Q-FW4a).
 *
 * The decision-time binding is a DECLARATION binding: it closes
 *
 *   intentRef  = H("CGEP/1:INTENT" || canonicalize(intent))            (packages/intent)
 *   manifestId = H("CGEP/1:AGENT-PROVENANCE" || canonicalize(declarationCore))
 *   bindingRef = H("CGEP/1:FW-BINDING" || canonicalize({ intentRef, manifestId, signature }))
 *
 * and checks the closure intent digest ↔ manifestId ↔ signature envelope plus
 * chainId/nonce/executionScope consistency. At decision time NO execution has
 * happened and NO `executionRef` exists; the binding never requires one.
 *
 * The manifestId formula is recomputed locally (never trusted from the input)
 * using the same well-founded domain as AgentProof
 * ("CGEP/1:AGENT-PROVENANCE"); this module only statically imports the local
 * zero-dep core (canonical/intent/policy) — Q-FW8a.
 */

import { canonicalize, domainHash } from "@coreguard/canonical";
import { hashIntent } from "@coreguard/canonical";
import { BINDING_DOMAIN } from "./decision-record.js";

export const PROVENANCE_DOMAIN = "CGEP/1:AGENT-PROVENANCE";
export const DECLARATION_KIND = "INTENT_DECLARATION";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX64_RE = /^[0-9a-fA-F]{64}$/;

/** The signable core of a firewall declaration (mirrors manifestCore strip). */
export function declarationCore(declaration) {
  const { manifestId: _mid, signature: _sig, commit: _commit, ...core } = declaration;
  return core;
}

/** Recompute the well-founded declaration id (same domain as AgentProof). */
export async function computeDeclarationId(declaration) {
  return domainHash(PROVENANCE_DOMAIN, declarationCore(declaration));
}

/** Binding ref closing intentRef ↔ manifestId ↔ signature envelope. */
export async function computeBindingRef({ intentRef, manifestId, signature }) {
  return domainHash(BINDING_DOMAIN, { intentRef, manifestId, signature });
}

/** Derive the predicted execution scope (declared envelope — NOT a tx ref). */
export function executionScopeOf(intent) {
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
 * Evaluate the declaration binding. Fail-closed: returns `status: "NOT_PROVEN"`
 * on any hole, `"NOT_RUN"` when the binding cannot be computed (missing intent/
 * declaration). Deterministic (I5); does not touch adapters.
 *
 * @param {object} args
 * @param {object} args.intent       canonical intent (packages/intent)
 * @param {object} args.declaration  signed declaration { version, kind, chainId,
 *                                   nonce, signerBinding, intent, manifestId, signature }
 * @returns {Promise<{status, label?, reason?, intentRef?, manifestId?,
 *                    bindingRef?, executionScope?, chainId?, nonce?}>}
 */
export async function evaluateDeclarationBinding({ intent, declaration }) {
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

  const intentRef = await hashIntent(intent);

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

  // Recompute the well-founded declaration id — never trust the declared one.
  let manifestId;
  try {
    manifestId = await computeDeclarationId(declaration);
  } catch {
    errors.push("declaration is not canonicalizable");
  }
  if (manifestId && String(declaration.manifestId || "").toLowerCase() !== manifestId) {
    errors.push(`declaration.manifestId != recomputed manifestId (${manifestId})`);
  }

  const bindingRef = await computeBindingRef({ intentRef, manifestId, signature: declaration.signature });

  if (errors.length > 0) {
    return {
      status: "NOT_PROVEN",
      label: "DECLARATION_NOT_BOUND",
      reason: errors.join("; "),
      intentRef,
      manifestId: manifestId || null,
      bindingRef,
      executionScope: executionScopeOf(intent),
      chainId: String(intent.chainId || ""),
      nonce: String(intent.nonce ?? ""),
    };
  }

  return {
    status: "OK",
    label: "BOUND",
    intentRef,
    manifestId,
    bindingRef,
    executionScope: executionScopeOf(intent),
    chainId: String(intent.chainId || ""),
    nonce: String(intent.nonce ?? ""),
  };
}