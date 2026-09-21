/**
 * engine-dde.mjs — standalone DDE/1 boundary engine shipped INSIDE the
 * generated scaffold (zero dependencies, Node >= 18).
 *
 * Why a bundled engine: the scaffold must work the moment it is created.
 * The authoritative engine lives in the coreguard repository
 * (packages/delivery, zero-dep, Node >= 18) and is the reference
 * implementation; CI in the coreguard repo checks this file's boundary
 * verdicts against the real engine on the bundled fixture. Until
 * `@coreguard/delivery` is published to npm, this file gives new projects
 * a runnable start. Same DDE/1 contract, same fail-closed semantics:
 *
 *   F0  REQUIRED_RECORDS                       all ten records present
 *   F1  EXECUTION_ACCEPTANCE_SEPARATION        acceptance is a signed party act citing criteria
 *   F2  CRITERIA_CLOSURE                       every criterion evaluated, every evaluation cited
 *   F3  LIFECYCLE_CONSISTENCY                  declared state matches the records
 *   E3  DELIVERY_INTEGRITY_REPLAY              artifacts re-hash (SHA-256) to their pins
 *   E4  AUTHORIZATION_BINDING                  delivery descends from agreement/execution/intent
 *   E5  CONSENT_BINDING                        NOT_RUN without an EVM adapter — never fabricated
 *   B1  PAYMENT_INFERENCE_FORBIDDEN            basis=[PAYMENT_SETTLED] alone never accepts
 *   B2  EXECUTION_DOES_NOT_DECIDE_CONFORMITY   verdicts rest on criterion evaluations
 *   B3  NO_ENGINE_ADJUDICATION                 both positions + remedies; no winner is named
 *
 * The boundary is part of every report. Quote one, you quote both.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const DDE_VERSION = "DDE/1";
export const BOUNDARY_BANNER = Object.freeze({
  code: "DDE-BOUNDARY",
  statement:
    "Execution verification does not decide delivery conformity. " +
    "Acceptance or rejection of the delivered work is a separate determination " +
    "recorded by the parties, not derived from on-chain facts.",
});

export const REMEDIES = Object.freeze(["NONE", "REWORK", "PARTIAL_REFUND", "REFUND", "REPLACE", "CANCEL"]);

const FILE_TO_KEY = {
  "agreement.json": "agreement",
  "acceptance-criteria.json": "acceptanceCriteria",
  "parties.json": "parties",
  "authorization.json": "authorization",
  "execution-attestation.json": "execution",
  "delivery-manifest.json": "delivery",
  "acceptance-record.json": "acceptanceRecord",
  "dispute-record.json": "disputeRecord",
  "consent-and-disclosure.json": "consentAndDisclosure",
  "retention-policy.json": "retentionPolicy",
};

/** SHA-256 over exact utf-8 bytes, 0x-prefixed — the single hash definition. */
export async function artifactSha256(content) {
  return "0x" + createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
}

/** Verify the SHA-256 pins in hashes.json against the exact record bytes on disk. */
export async function verifyPins(dir, readFile = null) {
  const fsMod = readFile ? null : await import("node:fs");
  const read = readFile ?? ((p) => fsMod.readFileSync(p));
  const pins = JSON.parse(read(`${dir}/hashes.json`).toString("utf8"));
  const checked = [];
  const mismatches = [];
  for (const [name, expected] of Object.entries(pins.files ?? {})) {
    const actual = "0x" + createHash("sha256").update(read(`${dir}/${name}`)).digest("hex");
    checked.push(name);
    if (actual !== expected) mismatches.push(`${name}: pinned ${expected.slice(0, 10)}… != actual ${actual.slice(0, 10)}…`);
  }
  if (!pins.files || Object.keys(pins.files).length === 0) {
    mismatches.push("hashes.json carries no pins");
  }
  for (const name of Object.keys(FILE_TO_KEY)) {
    if (!(name in (pins.files ?? {}))) mismatches.push(`${name}: not pinned in hashes.json`);
  }
  return { result: mismatches.length === 0 && checked.length > 0 ? "PASS" : "FAIL", checked, mismatches };
}

/** Load a fixture object from a directory of the ten record files. */
export function loadFixtureFromDir(dir) {
  const fixture = {};
  for (const [name, key] of Object.entries(FILE_TO_KEY)) {
    fixture[key] = JSON.parse(readFileSync(`${dir}/${name}`, "utf8"));
  }
  try {
    const manifest = JSON.parse(readFileSync(`${dir}/hashes.json`, "utf8"));
    if (manifest?.fixture?.origin) fixture.origin = manifest.fixture.origin;
    if (manifest?.fixture?.lifecycleState) fixture.lifecycleState = manifest.fixture.lifecycleState;
  } catch {
    /* hashes.json absence is reported by verifyPins */
  }
  return fixture;
}

const F1_FORBIDDEN_GROUNDS = Object.freeze([
  "payment settled",
  "payment_settled",
  "txstatus=1",
  "receipt proves",
  "on-chain success proves",
]);

export function checkExecutionAcceptanceSeparation(fixture) {
  const reasons = [];
  const acc = fixture && fixture.acceptanceRecord;
  if (!acc || typeof acc !== "object") return { result: "FAIL", reasons: ["acceptanceRecord missing"] };
  if (!acc.criteriaRef) reasons.push("acceptanceRecord.criteriaRef missing — acceptance must cite the criteria it applies");
  const signers = Array.isArray(acc.signedBy) ? acc.signedBy : [];
  if (signers.length === 0) reasons.push("acceptanceRecord.signedBy missing — acceptance must be a party act, not a system inference");
  const text = JSON.stringify(acc).toLowerCase();
  for (const g of F1_FORBIDDEN_GROUNDS) {
    if (text.includes(g)) reasons.push(`acceptance grounds quote execution facts ("${g}") — F1 violation`);
  }
  if (acc.derivedFrom === "execution" || acc.derivedFrom === "EXECUTION") {
    reasons.push('acceptanceRecord.derivedFrom = "execution" — acceptance may not be derived from execution facts');
  }
  return { result: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}

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
    if (actual !== a.sha256) mismatches.push(`${a.id}: recorded ${a.sha256.slice(0, 10)}… != actual ${actual.slice(0, 10)}…`);
  }
  const ok = checked > 0 && mismatches.length === 0;
  return { result: ok ? "PASS" : "FAIL", checked, mismatches };
}

export function checkAuthorizationBinding(fixture) {
  const reasons = [];
  const a = fixture && fixture.agreement;
  const d = fixture && fixture.delivery;
  const x = fixture && fixture.execution;
  const z = fixture && fixture.authorization;
  if (!a || !d || !x || !z) return { result: "FAIL", reasons: ["fixture missing agreement/delivery/execution/authorization"] };
  if (d.agreementRef !== a.agreementId) reasons.push(`delivery.agreementRef (${d.agreementRef}) != agreement.agreementId (${a.agreementId})`);
  if (d.executionRef !== x.executionId) reasons.push(`delivery.executionRef (${d.executionRef}) != execution.executionId (${x.executionId})`);
  if (z.subject && a.client && a.client.agentAddress &&
      String(z.subject).toLowerCase() !== String(a.client.agentAddress).toLowerCase()) {
    reasons.push("authorization.subject != agreement.client.agentAddress");
  }
  if (!z.intentHash || !/^0x[0-9a-f]{64}$/.test(z.intentHash)) reasons.push("authorization.intentHash missing or malformed");
  if (z.intent && z.intent.intentHash && z.intent.intentHash !== z.intentHash) {
    reasons.push("authorization.intent.intentHash != authorization.intentHash (self-consistency)");
  }
  return { result: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}

export function checkB1PaymentInferenceForbidden(fixture) {
  const reasons = [];
  const acc = fixture && fixture.acceptanceRecord;
  if (acc && Array.isArray(acc.basis)) {
    const nonPayment = acc.basis.filter((b) => b !== "PAYMENT_SETTLED");
    if (acc.basis.includes("PAYMENT_SETTLED") && nonPayment.length === 0) {
      reasons.push("acceptanceRecord.basis = [PAYMENT_SETTLED] only — payment cannot be the acceptance basis");
    }
  }
  if (acc && acc.verdict === "ACCEPTED" && Array.isArray(acc.basis) && !acc.basis.includes("CRITERIA_EVALUATION")) {
    reasons.push("ACCEPTED verdict without CRITERIA_EVALUATION basis");
  }
  return { result: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}

export function checkB2ExecutionDoesNotDecideConformity(fixture) {
  const reasons = [];
  const acc = fixture && fixture.acceptanceRecord;
  if (acc && (acc.verdict === "ACCEPTED" || acc.verdict === "REJECTED")) {
    const n = Array.isArray(acc.evaluations) ? acc.evaluations.length : 0;
    if (n === 0) reasons.push(`${acc.verdict} with zero criterion evaluations — conformity decided by something other than criteria`);
  }
  return { result: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}

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

export async function checkConsentBinding(_fixture, _evm = undefined) {
  // The bundled engine never fabricates cryptographic results: consent
  // replay requires a real EVM adapter, which standalone scaffolds do not
  // carry. The authoritative engine in packages/delivery performs the
  // actual EIP-712 replay when an adapter is provided.
  return {
    result: "NOT_RUN",
    note: "EVM adapter not provided — consent signature replay NOT evaluated (never fabricated)",
  };
}

export function checkLifecycleConsistency(fixture) {
  const declared = fixture && fixture.lifecycleState;
  const expected =
    fixture && fixture.disputeRecord && fixture.disputeRecord.closedAtUtc ? "RECORD_CLOSED"
    : fixture && fixture.disputeRecord && fixture.disputeRecord.openedAtUtc ? "DISPUTE_OPEN"
    : fixture && fixture.acceptanceRecord && fixture.acceptanceRecord.verdict ? "ACCEPTANCE_RECORDED"
    : fixture && fixture.delivery && fixture.delivery.submittedAtUtc ? "DELIVERY_SUBMITTED"
    : "DRAFT";
  return { result: declared === expected ? "PASS" : "FAIL", declared: declared ?? null, expected };
}

export async function verifyDeliveryFixture(fixture, _evm = undefined) {
  const checks = [];
  const add = (id, name, result, extra = {}) => checks.push({ id, name, result, ...extra });

  const required = [
    "agreement", "acceptanceCriteria", "parties", "authorization",
    "execution", "delivery", "acceptanceRecord", "disputeRecord",
    "consentAndDisclosure", "retentionPolicy",
  ];
  const missing = required.filter((k) => !fixture || !fixture[k]);
  add("F0", "REQUIRED_RECORDS", missing.length === 0 ? "PASS" : "FAIL", missing.length ? { missing } : {});

  const f1 = checkExecutionAcceptanceSeparation(fixture);
  add("F1", "EXECUTION_ACCEPTANCE_SEPARATION", f1.result, { reasons: f1.reasons });

  const f2 = checkCriteriaClosure(fixture);
  add("F2", "CRITERIA_CLOSURE", f2.result, { unevaluated: f2.unevaluated, uncited: f2.uncited });

  const e3 = await replayDeliveryIntegrity(fixture && fixture.delivery);
  add("E3", "DELIVERY_INTEGRITY_REPLAY", e3.result, { checked: e3.checked, mismatches: e3.mismatches });

  const e4 = checkAuthorizationBinding(fixture);
  add("E4", "AUTHORIZATION_BINDING", e4.result, { reasons: e4.reasons });

  const b1 = checkB1PaymentInferenceForbidden(fixture);
  add("B1", "PAYMENT_INFERENCE_FORBIDDEN", b1.result, { reasons: b1.reasons });

  const b2 = checkB2ExecutionDoesNotDecideConformity(fixture);
  add("B2", "EXECUTION_DOES_NOT_DECIDE_CONFORMITY", b2.result, { reasons: b2.reasons });

  const b3 = checkB3NoEngineAdjudication(fixture);
  add("B3", "NO_ENGINE_ADJUDICATION", b3.result, { reasons: b3.reasons });

  const e5 = await checkConsentBinding(fixture);
  add("E5", "CONSENT_BINDING", e5.result, e5.result === "NOT_RUN" ? { note: e5.note } : { reasons: e5.reasons || [] });

  const f3 = checkLifecycleConsistency(fixture);
  add("F3", "LIFECYCLE_CONSISTENCY", f3.result, { declared: f3.declared, expected: f3.expected });

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

/**
 * Payment gate — the scaffold's release law.
 * release=true requires BOTH the engine verdict to be VERIFIED and the
 * caller's acceptance predicate to hold. The predicate is the platform's
 * acceptance condition (typically: party-signed ACCEPTED record resting on
 * criterion evaluations). A settled transaction satisfies neither half
 * alone; the gate names its reasons either way.
 */
export function releaseWhen(report, predicate) {
  const reasons = [];
  if (!report || report.status !== "VERIFIED") {
    reasons.push(`fixture verification is ${report?.status ?? "ABSENT"} — no release without a VERIFIED report`);
  }
  if (typeof predicate !== "function") {
    reasons.push("no release predicate provided — release requires an explicit acceptance condition");
  } else {
    let ok = false;
    try { ok = predicate(report) === true; } catch (e) { reasons.push(`predicate error: ${e.message}`); }
    if (!ok) reasons.push("release predicate not satisfied — the acceptance condition did not hold");
  }
  return { release: reasons.length === 0, reasons };
}
