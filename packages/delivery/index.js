/**
 * CoreGuard Delivery & Dispute Evidence (DDE/1) — the execution/acceptance
 * boundary, enforced.
 *
 * The one rule this package exists to enforce (binding on every caller):
 *
 *   EXECUTION VERIFICATION NEVER DECIDES DELIVERY CONFORMITY.
 *   payment_settled=true NEVER implies delivery_accepted=true.
 *
 * CoreGuard's provenance layer proves WHO authorized WHAT, and that it RAN.
 * Those facts are necessary inputs to any dispute — and categorically
 * insufficient to decide whether the delivered work satisfied the deal.
 * This module carries the delivery-side evidence model: agreement, acceptance
 * criteria, delivery, acceptance/rejection, dispute positions, consent,
 * retention — and a fail-closed verifier that refuses to let the two
 * questions bleed into each other.
 *
 * Verdict vocabulary (fail-closed, no implicit conversions):
 *   PASS     the condition genuinely held, with evidence
 *   FAIL     a violation was caught by a closed check
 *   NOT_RUN  the check was not evaluable (never fabricated)
 *
 * Layer separation (provenance domain vs DDE domain):
 *   authLayer       — who authorized, with which signature (provenance)
 *   execLayer       — on-chain execution facts (provenance)
 *   deliveryLayer   — what was delivered (DDE)
 *   acceptanceLayer — human judgment over conformity (never derived)
 *
 * People's Court / Epistemic Labs mapping is a pure projection: evidence
 * classification only — no custody transfer, no judgment, no merit finding.
 *
 * Zero dependencies. Cryptographic replay is injected (the same optional
 * adapter pattern as provenance); without it, signature checks report
 * NOT_RUN — never a fabricated result.
 */

import { domainHash } from "@coreguard/canonical";

export const DDE_VERSION = "DDE/1";

/** Canonical domain tags for DDE record hashing (mirrors CGEP/1 style). */
export const DDE_DOMAIN = Object.freeze({
  AGREEMENT: "DDE/1:AGREEMENT",
  CRITERIA: "DDE/1:ACCEPTANCE-CRITERIA",
  DELIVERY: "DDE/1:DELIVERY",
  ACCEPTANCE: "DDE/1:ACCEPTANCE-RECORD",
  DISPUTE: "DDE/1:DISPUTE-RECORD",
});

/** Record lifecycle — explicit, monotonic, never inferred from other records. */
export const FIXTURE_STATES = Object.freeze([
  "DRAFT",
  "DELIVERY_SUBMITTED",
  "ACCEPTANCE_RECORDED",
  "DISPUTE_OPEN",
  "RECORD_CLOSED",
]);

/** Agreement lifecycle vocabulary. */
export const AGREEMENT_STATES = Object.freeze([
  "OFFERED",
  "ACCEPTED",
  "ACTIVE",
  "PERFORMED",
  "DISPUTED",
  "CANCELLED",
  "PHASE1_COMPLETED",
]);

/** Closed remedy vocabulary — no free-form remedies, no engine judgment. */
export const REMEDIES = Object.freeze([
  "NONE",
  "REWORK",
  "PARTIAL_REFUND",
  "FULL_REFUND",
  "CREDIT",
]);

/** Evidence classes for the People's Court projection (closed list). */
export const PC_EVIDENCE_KINDS = Object.freeze([
  "AGREEMENT",
  "ACCEPTANCE_CRITERIA",
  "AUTHORIZATION",
  "EXECUTION",
  "DELIVERY",
  "ACCEPTANCE_RECORD",
  "DISPUTE_RECORD",
  "CONSENT",
  "RETENTION",
]);

/** The engine's boundary banner — every report carries it; quoting DDE output
 *  without this sentence misrepresents the engine's reach. */
export const BOUNDARY_BANNER = Object.freeze({
  code: "DDE-BOUNDARY",
  statement:
    "Execution verification does not decide delivery conformity. " +
    "Acceptance or rejection of the delivered work is a separate determination " +
    "recorded by the parties, not derived from on-chain facts.",
});

/** ---------------------------------------------------------------- hashes */

export async function agreementDigest(rec) {
  return domainHash(DDE_DOMAIN.AGREEMENT, rec);
}

export async function criteriaDigest(rec) {
  return domainHash(DDE_DOMAIN.CRITERIA, rec);
}

export async function deliveryDigest(rec) {
  return domainHash(DDE_DOMAIN.DELIVERY, rec);
}

export async function acceptanceDigest(rec) {
  return domainHash(DDE_DOMAIN.ACCEPTANCE, rec);
}

export async function disputeDigest(rec) {
  return domainHash(DDE_DOMAIN.DISPUTE, rec);
}

/**
 * Deterministic SHA-256 over exact utf-8 bytes of an artifact's content.
 * Centralized so the generator and every re-checker hash identically —
 * the single definition of "the bytes of this artifact".
 */
export async function artifactSha256(content) {
  const { createHash } = await import("node:crypto");
  return (
    "0x" +
    createHash("sha256").update(Buffer.from(String(content), "utf8")).digest("hex")
  );
}

/** ------------------------------------------------------- F1 — separation */

const F1_FORBIDDEN_GROUNDS = Object.freeze([
  "payment settled",
  "payment_settled",
  "txstatus=1",
  "receipt proves",
  "on-chain success proves",
]);

/**
 * F1 — EXECUTION/ACCEPTANCE SEPARATION (fail-closed).
 *
 * An acceptance/rejection record is honest only if it stands on its own:
 * signed by a party, citing the criteria it applies. The classic dishonest
 * shapes this check kills:
 *   - acceptance grounds quoting execution facts ("payment settled", …)
 *   - an explicit inference marker (derivedFrom: "execution")
 *   - an acceptance verdict with no criteriaRef
 *
 * @returns {{ result: "PASS"|"FAIL", reasons: string[] }}
 */
export function checkExecutionAcceptanceSeparation(fixture) {
  const reasons = [];
  const acc = fixture && fixture.acceptanceRecord;
  if (!acc || typeof acc !== "object") {
    reasons.push("acceptanceRecord missing");
    return { result: "FAIL", reasons };
  }
  if (!acc.criteriaRef) {
    reasons.push("acceptanceRecord.criteriaRef missing — acceptance must cite the criteria it applies");
  }
  const signers = Array.isArray(acc.signedBy) ? acc.signedBy : [];
  if (signers.length === 0) {
    reasons.push("acceptanceRecord.signedBy missing — acceptance must be a party act, not a system inference");
  }
  const text = JSON.stringify(acc).toLowerCase();
  for (const g of F1_FORBIDDEN_GROUNDS) {
    if (text.includes(g)) {
      reasons.push(`acceptance grounds quote execution facts ("${g}") — F1 violation`);
    }
  }
  if (acc.derivedFrom === "execution" || acc.derivedFrom === "EXECUTION") {
    reasons.push('acceptanceRecord.derivedFrom = "execution" — acceptance may not be derived from execution facts');
  }
  return { result: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}

/** -------------------------------------------------- F2 — criteria closure */

/**
 * F2 — CRITERIA CLOSURE: every criterion in acceptance-criteria is evaluated
 * by the acceptance record (no silent skips) and every evaluation cites a
 * criterion that exists (no invented passes).
 */
export function checkCriteriaClosure(fixture) {
  const criteria = (fixture && fixture.acceptanceCriteria && fixture.acceptanceCriteria.criteria) || [];
  const evals = (fixture && fixture.acceptanceRecord && fixture.acceptanceRecord.evaluations) || [];
  const critIds = new Set(criteria.map((c) => c.id).filter(Boolean));
  const evalIds = new Set(evals.map((e) => e.criterionId).filter(Boolean));

  const unevaluated = [...critIds].filter((id) => !evalIds.has(id));
  const uncited = [...evalIds].filter((id) => !critIds.has(id));
  const ok = unevaluated.length === 0 && uncited.length === 0;
  return { result: ok ? "PASS" : "FAIL", unevaluated, uncited };
}

/** ------------------------------------------------------------ E3 — replay */

/**
 * E3 — DELIVERY INTEGRITY REPLAY: every artifact in the delivery manifest
 * re-hashes (SHA-256 over exact utf-8 bytes of `content`) and must match its
 * recorded sha256. Fail-closed on any mismatch or missing field.
 *
 * @returns {Promise<{result:"PASS"|"FAIL", checked:number, mismatches:string[]}>}
 */
export async function replayDeliveryIntegrity(delivery) {
  const artifacts = (delivery && delivery.artifacts) || [];
  const mismatches = [];
  let checked = 0;
  for (const a of artifacts) {
    if (!a || typeof a !== "object") { mismatches.push("(malformed artifact)"); continue; }
    if (!a.id) { mismatches.push("(artifact without id)"); continue; }
    if (typeof a.content !== "string") { mismatches.push(`${a.id}: content missing`); continue; }
    if (!a.sha256 || !/^0x[0-9a-f]{64}$/.test(a.sha256)) { mismatches.push(`${a.id}: sha256 malformed`); continue; }
    const actual = await artifactSha256(a.content);
    checked += 1;
    if (actual !== a.sha256) {
      mismatches.push(`${a.id}: recorded ${a.sha256.slice(0, 10)}… != actual ${actual.slice(0, 10)}…`);
    }
  }
  const ok = checked > 0 && mismatches.length === 0;
  return { result: ok ? "PASS" : "FAIL", checked, mismatches };
}

/** ------------------------------------------------- E4 — authorization chain */

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * E4 — AUTHORIZATION BINDING: the delivery must descend from the agreement,
 * execution, and declared intent the parties actually signed. Fail-closed
 * when any reference is broken or the authorizing agent is not the
 * agreement's client-side agent.
 */
export function checkAuthorizationBinding(fixture) {
  const reasons = [];
  const a = fixture && fixture.agreement;
  const d = fixture && fixture.delivery;
  const x = fixture && fixture.execution;
  const z = fixture && fixture.authorization;
  if (!a || !d || !x || !z) {
    return { result: "FAIL", reasons: ["fixture missing agreement/delivery/execution/authorization"] };
  }
  if (d.agreementRef !== a.agreementId) {
    reasons.push(`delivery.agreementRef (${d.agreementRef}) != agreement.agreementId (${a.agreementId})`);
  }
  if (d.executionRef !== x.executionId) {
    reasons.push(`delivery.executionRef (${d.executionRef}) != execution.executionId (${x.executionId})`);
  }
  if (z.subject && a.client && a.client.agentAddress &&
      String(z.subject).toLowerCase() !== String(a.client.agentAddress).toLowerCase()) {
    reasons.push("authorization.subject != agreement.client.agentAddress");
  }
  if (!z.intentHash || !/^0x[0-9a-f]{64}$/.test(z.intentHash)) {
    reasons.push("authorization.intentHash missing or malformed");
  }
  if (z.intent && z.intent.intentHash && z.intent.intentHash !== z.intentHash) {
    reasons.push("authorization.intent.intentHash != authorization.intentHash (self-consistency)");
  }
  return { result: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}

/** ----------------------------------------------- B1–B3 — boundary guards */

/**
 * B1 — PAYMENT INFERENCE FORBIDDEN: payment completion can never be the
 * acceptance basis. Structural: `basis = ["PAYMENT_SETTLED"]` alone fails;
 * an ACCEPTED verdict without a CRITERIA_EVALUATION basis fails.
 */
export function checkB1PaymentInferenceForbidden(fixture) {
  const reasons = [];
  const acc = fixture && fixture.acceptanceRecord;
  if (acc && Array.isArray(acc.basis)) {
    const nonPayment = acc.basis.filter((b) => b !== "PAYMENT_SETTLED");
    if (acc.basis.includes("PAYMENT_SETTLED") && nonPayment.length === 0) {
      reasons.push("acceptanceRecord.basis = [PAYMENT_SETTLED] only — payment cannot be the acceptance basis");
    }
  }
  if (acc && acc.verdict === "ACCEPTED" && Array.isArray(acc.basis) &&
      !acc.basis.includes("CRITERIA_EVALUATION")) {
    reasons.push("ACCEPTED verdict without CRITERIA_EVALUATION basis");
  }
  return { result: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}

/**
 * B2 — EXECUTION DOES NOT DECIDE CONFORMITY: an ACCEPTED or REJECTED verdict
 * must rest on criterion evaluations. Zero evaluations under either verdict
 * means conformity was decided by something other than the criteria — FAIL.
 * (The engine structurally reads nothing from `execution` for conformity;
 * this check makes the corresponding fixture-level abuse detectable.)
 */
export function checkB2ExecutionDoesNotDecideConformity(fixture) {
  const reasons = [];
  const acc = fixture && fixture.acceptanceRecord;
  if (acc && (acc.verdict === "ACCEPTED" || acc.verdict === "REJECTED")) {
    const n = Array.isArray(acc.evaluations) ? acc.evaluations.length : 0;
    if (n === 0) {
      reasons.push(`${acc.verdict} with zero criterion evaluations — conformity decided by something other than criteria`);
    }
  }
  return { result: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}

/**
 * B3 — NO ENGINE ADJUDICATION: the dispute record must carry BOTH parties'
 * positions with an explicit requestedRemedy each (closed vocabulary), and
 * the engine never names a winner.
 */
export function checkB3NoEngineAdjudication(fixture) {
  const reasons = [];
  const d = fixture && fixture.disputeRecord;
  if (!d || typeof d !== "object") return { result: "FAIL", reasons: ["disputeRecord missing"] };
  for (const side of ["partyA", "partyB"]) {
    const p = d[side];
    if (!p || typeof p !== "object") { reasons.push(`disputeRecord.${side} missing`); continue; }
    if (!p.position) reasons.push(`disputeRecord.${side}.position missing`);
    if (!p.requestedRemedy) reasons.push(`disputeRecord.${side}.requestedRemedy missing`);
    else if (!REMEDIES.includes(p.requestedRemedy)) {
      reasons.push(`disputeRecord.${side}.requestedRemedy "${p.requestedRemedy}" outside closed remedy vocabulary`);
    }
  }
  return { result: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}

/** ------------------------------------------------- E5 — consent binding */

const GRANT_TYPES = Object.freeze({
  RedactionGrant: [
    { name: "grantor", type: "address" },
    { name: "fixtureRef", type: "bytes32" },
    { name: "scope", type: "string" },
  ],
});

/** EIP-712 digest for one redaction grant. Exported for generator parity. */
export function redactionGrantDigest(grant, evm, chainId = "1116") {
  return evm.typedDataDigestWithDomain(
    "RedactionGrant",
    GRANT_TYPES,
    { grantor: grant.grantor, fixtureRef: grant.fixtureRef, scope: grant.scope },
    {
      name: "CoreGuard DDE Redaction Grant",
      version: "1",
      chainId: BigInt(chainId),
    },
  );
}

/**
 * E5 — CONSENT BINDING: both parties' redaction-grant signatures replay to
 * their declared grantor. With no EVM adapter the check reports NOT_RUN —
 * never a fabricated cryptographic result.
 *
 * @returns {Promise<{result:"PASS"|"FAIL"|"NOT_RUN", reasons?:string[], note?:string}>}
 */
export async function checkConsentBinding(fixture, evm = undefined) {
  const consent = fixture && fixture.consentAndDisclosure;
  if (!evm) {
    return {
      result: "NOT_RUN",
      note: "EVM adapter not provided — consent signature replay NOT evaluated (never fabricated)",
    };
  }
  const reasons = [];
  const grants = (consent && consent.redactionGrants) || [];
  if (!Array.isArray(grants) || grants.length < 2) {
    return { result: "FAIL", reasons: ["redactionGrants must carry both parties' grants"] };
  }
  for (const g of grants) {
    if (!g.grantor || !g.fixtureRef || !g.scope || !g.signature) {
      reasons.push(`grant for ${g.grantor || "?"} missing grantor/fixtureRef/scope/signature`);
      continue;
    }
    try {
      const digest = redactionGrantDigest(g, evm, (consent && consent.chainId) || "1116");
      const recovered = evm.recoverSignerAddress(digest, g.signature);
      if (String(recovered).toLowerCase() !== String(g.grantor).toLowerCase()) {
        reasons.push(`consent signature recovered ${recovered} != grantor ${g.grantor}`);
      }
    } catch (e) {
      reasons.push(`consent replay error: ${e.message}`);
    }
  }
  return { result: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}

/** ------------------------------------------------- F3 — lifecycle truth */

/**
 * F3 — LIFECYCLE CONSISTENCY: the declared fixture state must match what its
 * records actually establish. Records establish a state; the declared state
 * is checked against them — never inferred silently in the other direction.
 * A closed dispute record (closedAtUtc set) establishes RECORD_CLOSED; closure
 * of the record is NOT adjudication — B3 still names no winner.
 */
export function checkLifecycleConsistency(fixture) {
  const declared = fixture && fixture.lifecycleState;
  const expected =
    fixture && fixture.disputeRecord && fixture.disputeRecord.closedAtUtc ? "RECORD_CLOSED"
    : fixture && fixture.disputeRecord && fixture.disputeRecord.openedAtUtc ? "DISPUTE_OPEN"
    : fixture && fixture.acceptanceRecord && fixture.acceptanceRecord.verdict ? "ACCEPTANCE_RECORDED"
    : fixture && fixture.delivery && fixture.delivery.submittedAtUtc ? "DELIVERY_SUBMITTED"
    : "DRAFT";
  return {
    result: declared === expected ? "PASS" : "FAIL",
    declared: declared ?? null,
    expected,
  };
}

/** ------------------------------------------------------ full fixture gate */

/**
 * Run the whole fail-closed gate over a loaded fixture object.
 *
 * Shape: { origin?, lifecycleState?, agreement, acceptanceCriteria, parties,
 *          authorization, execution, delivery, acceptanceRecord,
 *          disputeRecord, consentAndDisclosure, retentionPolicy }
 *
 * @param {object} fixture
 * @param {object} [evm] optional EVM adapter (consent signature replay);
 *                       absent → E5 NOT_RUN
 * @returns {Promise<object>} full report: status, decision, boundary, checks, summary
 */
export async function verifyDeliveryFixture(fixture, evm = undefined) {
  const checks = [];
  const add = (id, name, result, extra = {}) => checks.push({ id, name, result, ...extra });

  // F0 — required records present
  const required = [
    "agreement", "acceptanceCriteria", "parties", "authorization",
    "execution", "delivery", "acceptanceRecord", "disputeRecord",
    "consentAndDisclosure", "retentionPolicy",
  ];
  const missing = required.filter((k) => !fixture || !fixture[k]);
  add("F0", "REQUIRED_RECORDS", missing.length === 0 ? "PASS" : "FAIL",
    missing.length ? { missing } : {});

  // F1 — execution/acceptance separation
  const f1 = checkExecutionAcceptanceSeparation(fixture);
  add("F1", "EXECUTION_ACCEPTANCE_SEPARATION", f1.result, { reasons: f1.reasons });

  // F2 — criteria closure
  const f2 = checkCriteriaClosure(fixture);
  add("F2", "CRITERIA_CLOSURE", f2.result,
    { unevaluated: f2.unevaluated, uncited: f2.uncited });

  // E3 — delivery integrity replay
  const e3 = await replayDeliveryIntegrity(fixture && fixture.delivery);
  add("E3", "DELIVERY_INTEGRITY_REPLAY", e3.result,
    { checked: e3.checked, mismatches: e3.mismatches });

  // E4 — authorization binding
  const e4 = checkAuthorizationBinding(fixture);
  add("E4", "AUTHORIZATION_BINDING", e4.result, { reasons: e4.reasons });

  // B1–B3 — boundary guards
  const b1 = checkB1PaymentInferenceForbidden(fixture);
  add("B1", "PAYMENT_INFERENCE_FORBIDDEN", b1.result, { reasons: b1.reasons });
  const b2 = checkB2ExecutionDoesNotDecideConformity(fixture);
  add("B2", "EXECUTION_DOES_NOT_DECIDE_CONFORMITY", b2.result, { reasons: b2.reasons });
  const b3 = checkB3NoEngineAdjudication(fixture);
  add("B3", "NO_ENGINE_ADJUDICATION", b3.result, { reasons: b3.reasons });

  // E5 — consent binding (signature replay when the adapter is available)
  const e5 = await checkConsentBinding(fixture, evm);
  add("E5", "CONSENT_BINDING", e5.result,
    e5.result === "NOT_RUN" ? { note: e5.note } : { reasons: e5.reasons || [] });

  // F3 — lifecycle consistency
  const f3 = checkLifecycleConsistency(fixture);
  add("F3", "LIFECYCLE_CONSISTENCY", f3.result,
    { declared: f3.declared, expected: f3.expected });

  const failed = checks.filter((c) => c.result === "FAIL");
  const status = failed.length === 0 ? "VERIFIED" : "REJECTED";

  return {
    engine: "coreguard-dde",
    ddeVersion: DDE_VERSION,
    fixtureOrigin: (fixture && fixture.origin) || "UNDECLARED",
    status,
    decision: failed.length === 0
      ? "EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE"
      : "FIXTURE_REJECTED",
    boundary: BOUNDARY_BANNER.statement,
    checks,
    summary: {
      total: checks.length,
      pass: checks.filter((c) => c.result === "PASS").length,
      fail: failed.length,
      notRun: checks.filter((c) => c.result === "NOT_RUN").length,
    },
  };
}

/** ------------------------------------- People's Court projection (C1–C6) */

/**
 * Project a fixture into People's Court's neutral intake model.
 * PURE mapping — classification of evidence classes only. It performs no
 * custody transfer, no judgment, no merit assessment; `readiness` is a
 * documentation-completeness signal, not a legal conclusion.
 *
 * @returns {{ mappable:boolean, items:Array, gaps:string[], readiness:string }}
 */
export function mapToPeoplesCourt(fixture) {
  const items = [];
  const gaps = [];
  const push = (kind, ref, note) => items.push({ kind, ref, note: note ?? null });

  const a = fixture && fixture.agreement;
  if (a && a.agreementId) push("AGREEMENT", a.agreementId, `version ${a.version ?? "?"}`);
  else gaps.push("AGREEMENT record missing or unidentified");

  const c = fixture && fixture.acceptanceCriteria;
  if (c && Array.isArray(c.criteria) && c.criteria.length) {
    push("ACCEPTANCE_CRITERIA", `${c.criteria.length} criteria`, c.criteriaRef ?? null);
  } else gaps.push("ACCEPTANCE_CRITERIA empty");

  const z = fixture && fixture.authorization;
  if (z && z.intentHash) push("AUTHORIZATION", z.intentHash, z.scheme ?? null);
  else gaps.push("AUTHORIZATION intent hash missing");

  const x = fixture && fixture.execution;
  if (x && x.txHash) push("EXECUTION", x.txHash, `chainId ${x.chainId ?? "?"}`);
  else gaps.push("EXECUTION tx hash missing");

  const d = fixture && fixture.delivery;
  if (d && Array.isArray(d.artifacts) && d.artifacts.length) {
    push("DELIVERY", `${d.artifacts.length} artifacts`, "sha256-pinned");
  } else gaps.push("DELIVERY artifacts missing");

  const acc = fixture && fixture.acceptanceRecord;
  if (acc && acc.verdict) push("ACCEPTANCE_RECORD", acc.verdict, acc.criteriaRef ?? null);
  else gaps.push("ACCEPTANCE_RECORD verdict missing");

  const disp = fixture && fixture.disputeRecord;
  if (disp && disp.disputeId) {
    const pa = disp.partyA && disp.partyA.requestedRemedy;
    const pb = disp.partyB && disp.partyB.requestedRemedy;
    push("DISPUTE_RECORD", disp.disputeId, `remedies: A=${pa ?? "?"} / B=${pb ?? "?"}`);
  } else gaps.push("DISPUTE_RECORD missing");

  const con = fixture && fixture.consentAndDisclosure;
  if (con && Array.isArray(con.redactionGrants) && con.redactionGrants.length >= 2) {
    push("CONSENT", `${con.redactionGrants.length} grants`, "both parties");
  } else gaps.push("CONSENT grants incomplete");

  const ret = fixture && fixture.retentionPolicy;
  if (ret && ret.retentionUtcUntil) push("RETENTION", ret.retentionUtcUntil, null);
  else gaps.push("RETENTION policy missing");

  const mappable = gaps.length === 0;
  return {
    mappable,
    items,
    gaps,
    readiness: mappable
      ? "READY_FOR_CLAIM_MAPPING — evidence classes complete; conformity question framed, not decided"
      : "INCOMPLETE — see gaps",
  };
}
