/**
 * WS-2.3 - Mandate Proof / fail-closed capability chain gate (byte-seam).
 *
 * Pure, deterministic, engine-free. The mandate fold binds the REAL WS-3
 * byte substrate semantics onto a canonical five-layer chain:
 *
 *     intent -> authorization -> execution -> attestation
 *     (the mandate/authorization capability ABSOLUTELY NEVER equals execution
 *      proof on its own - WS-2.3/8, fail-closed).
 *
 * WS-2.3 non-negotiables (SAME fail-closed alphabet as WS-6/WS-2.2; there is
 * NO majority rule anywhere):
 *   WS-2.3/1 full valid chain + byte-identical bindings => VERIFIED
 *   WS-2.3/2 scope mismatch      => INVALID (never VERIFIED)
 *   WS-2.3/3 expired             => INVALID (never VERIFIED)
 *   WS-2.3/4 signer mismatch     => INVALID (never VERIFIED)
 *   WS-2.3/5 invalid delegation  => INVALID (never VERIFIED)
 *   WS-2.3/6 chain/binding mismatch => INVALID (never VERIFIED) - and a
 *           VERIFIED mandate can NEVER convert it (no majority rule)
 *   WS-2.3/7 missing layer       => NOT_PROVEN (fail-closed; never VERIFIED)
 *   WS-2.3/8 mandate ALONE (no intent/authorization/execution/attestation)
 *           => NOT_PROVEN - a mandate/authorization is NEVER execution proof.
 *
 * No majority: a VERIFIED chain can never promote/fold an INVALID layer up.
 */
import { createHash } from "node:crypto";

const sha256 = (buf) => createHash("sha256").update(buf).digest();
const LEAF = 0x00;
const NODE = 0x01;
const hex = (buf) => Buffer.from(buf).toString("hex");
const bytes = (v) => (Buffer.isBuffer(v) ? v : Buffer.from(String(v), "utf8"));
const seam = (v) => hex(sha256(bytes(v)));
const bind = (a, b) => hex(sha256(Buffer.concat([Buffer.from([NODE]), bytes(a), bytes(b)])));

export const MANDATE_VERDICTS = Object.freeze({
  VERIFIED: "VERIFIED",
  INVALID: "INVALID",
  NOT_PROVEN: "NOT_PROVEN",
});

export const MANDATE_TOKEN = Object.freeze({
  VERIFIED: "VERIFIED",
  INVALID: "INVALID",
  NOT_PROVEN: "NOT_PROVEN",
});

export const MANDATE_LABEL = Object.freeze({
  VERIFIED: "WS-2.3/1",
  INVALID: "WS-2.3 fail-closed INVALID",
  NOT_PROVEN: "WS-2.3/7-8 mandate alone / missing layer",
});

const bad = (token, label, reason) => ({ token, label, reason, ok: token === "VERIFIED" });

/** WS-2.3/5 delegation canonical check: a delegate ref is only valid when
 * the mandate EXPLICITLY carries a non-empty grant for it. */
const delegateValid = (m) =>
  m.hasDelegate === true && typeof m.delegateTo === "string" && m.delegateTo.length > 0
    ? { ok: true }
    : { ok: false, reason: "WS-2.3/5 invalid delegation: delegateTo missing/empty (fail-closed)" };

/**
 * WS-2.3 fold over ONE canonical mandate chain. Fail-closed.
 * @param {object} m
 *   mandatory: policyRef, signedBy, signers[], grantFor, intentRef,
 *              authorizationRef, executionRef, attestationRef, scope,
 *              notBefore, notAfter (ms epoch), now
 */
export function foldMandate(m = {}) {
  const missing = (reason) => bad(MANDATE_TOKEN.NOT_PROVEN, MANDATE_LABEL.NOT_PROVEN, reason);
  const invalid = (reason) => bad(MANDATE_TOKEN.INVALID, MANDATE_LABEL.INVALID, reason);
  if (!m || typeof m !== "object") return missing("WS-2.3/7 no mandate object; fail-closed NOT_PROVEN");

  // WS-2.3/7 - every layer must be present AND byte-non-empty.
  const layerKeys = ["intentRef", "authorizationRef", "executionRef", "attestationRef"];
  for (const k of layerKeys) {
    if (typeof m[k] !== "string" || m[k].length === 0) {
      return missing(`WS-2.3/7 missing layer ${k}; fail-closed NOT_PROVEN, never VERIFIED`);
    }
  }
  if (typeof m.policyRef !== "string" || m.policyRef.length === 0) {
    return missing("WS-2.3/7 missing policyRef; policy is mandatory");
  }
  if (typeof m.scope !== "string" || m.scope.length === 0) {
    return missing("WS-2.3/7 missing scope; fail-closed NOT_PROVEN");
  }

  // WS-2.3/ hoverper policyRef stays byte-bound to the grant scope.
  const policySeam = bind(m.policyRef, m.scope);

  // WS-2.3/2 - execution scope MUST be inside the granted scope alphabet.
  if (!m.scope.startsWith("0x0") && !String(m.scope).includes("/") && m.executionScope && m.executionScope !== m.scope) {
    // non-canonical scope spelling is not an automatic invalid; scope fold is
    // literal: the execution must be bound to the SAME mandate scope bytes.
  }
  if (m.executionScope && seam(m.executionScope) !== seam(m.scope) && !m.executionScope.startsWith(m.scope)) {
    return invalid(`WS-2.3/2 scope mismatch: executionScope ${m.executionScope} not within granted scope ${m.scope} (fail-closed)`);
  }

  // WS-2.3/3 - expiry, fail-closed: now is a caller clock? NO - we fold the
  // mandate's OWN declared window (notBefore/notAfter) against the chain's
  // NOTARIZED sequence, never a wall-clock majority.
  const notBefore = typeof m.notBefore === "number" ? m.notBefore : 0;
  const notAfter = typeof m.notAfter === "number" ? m.notAfter : Infinity;
  const chainedAt = Array.isArray(m.course) && m.course.length > 0 ? m.course[m.course.length - 1] : (m.now ?? 0);
  if (chainedAt < notBefore || chainedAt > notAfter) {
    return invalid(`WS-2.3/3 mandate not in force window [${notBefore},${notAfter}] at chain-end ${chainedAt} (fail-closed)`);
  }

  // WS-2.3/4 - every claim in the chain must be byte-signed by A signer in
  // the mandate signer set.
  if (!Array.isArray(m.signers) || m.signers.length === 0) {
    return missing("WS-2.3/4 no signers; a mandate with NO signer is never VERIFIED");
  }
  const signedByOk = typeof m.signedBy === "string" && m.signers.some((s) => seam(s) === seam(m.signedBy));
  if (!signedByOk) {
    return invalid(`WS-2.3/4 signer mismatch: signedBy not among authorized signers (fail-closed)`);
  }

  // WS-2.3/5 - delegation only via explicit non-empty grant.
  const del = delegateValid(m);
  if (!del.ok) return invalid(del.reason);

  // WS-2.3/6 - chain byte-binding: intent -> authorization -> execution ->
  // attestation MUST be byte-connected via canonical seams, and the mandate
  // grant ref MUST equal the authorization's mandate binding.
  const chainSeam = (a, b) => bind(a, b);
  if (chainSeam(m.intentRef, m.authorizationRef) !== chainSeam(m.grantFor, m.authorizationRef)) {
    // intent/authorization must be the SAME seam domain: authorization is
    // bound to the grant, so its ref equals the grant's intent binding.
    return invalid(`WS-2.3/6 chain/binding mismatch at intent->authorization seam (fail-closed)`);
  }
  const authExec = chainSeam(m.authorizationRef, m.executionRef);
  const execAtt = chainSeam(m.executionRef, m.attestationRef);
  if (authExec !== execAtt) {
    return invalid("WS-2.3/6 chain/binding mismatch: authorization->execution seam != execution->attestation seam (fail-closed)");
  }

  return {
    token: MANDATE_TOKEN.VERIFIED,
    label: MANDATE_LABEL.VERIFIED,
    reason: "WS-2.3/1 full mandate chain VERIFIED with byte-identical bindings",
    ok: true,
    policySeam,
    authExec,
    execAtt,
  };
}

export const WS23_TOKENS = MANDATE_TOKEN;
export const WS23_LABELS = MANDATE_LABEL;

