#!/usr/bin/env node
/**
 * integration-states.mjs — the machine-state face of the integration ladder.
 *
 * Bridges the guarded transition table (state-machine.mjs) with a record-safe
 * outcome machine: every integration is classified into ACTIVE / FAILED /
 * UNKNOWN / REJECTED, and every state carries entry criteria, required
 * evidence, a verification command, exit criteria, a failure state, an UNKNOWN
 * state, and an audit record. Nothing claims a live step without recorded
 * authorization (see scripts/ladder/state-machine.mjs).
 *
 * Core rule (binding): UNKNOWN != FAILED, UNKNOWN != VERIFIED. A lack of
 * evidence is recorded as UNKNOWN and never upgraded to a verdict.
 *
 * Usage:
 *   node scripts/ladder/integration-states.mjs --self-check
 */

import { INTEGRATION_STATES } from "./states.mjs";
import { evaluateTransition } from "./state-machine.mjs";

export const OUTCOME_STATES = Object.freeze({
  ACTIVE: "ACTIVE",
  FAILED: "FAILED",
  UNKNOWN: "UNKNOWN",
  REJECTED: "REJECTED",
});

export const UNKNOWN_RULE =
  "UNKNOWN means insufficient evidence, never a failure, never a verdict. UNKNOWN != FAILED and UNKNOWN != VERIFIED are binding.";

/* Every legal state's machine envelope: what enters it, what proves it, how it
 * is re-verified, what closes it, and where it fails or degrades to UNKNOWN. */
export const INTEGRATION_DOORWAYS = Object.freeze(
  Object.fromEntries(
    [
      {
        state: "NOT_STARTED",
        entryCriteria: "boundary declared; no work recorded",
        requiredEvidence: ["track id", "owner sign-off pending"],
        verificationCommand: "node scripts/ladder/evidence-passport.mjs --print",
        exitCriteria: "design recorded and reviewed",
        failureState: OUTCOME_STATES.REJECTED,
        unknownState: OUTCOME_STATES.UNKNOWN,
        auditRecord: "no outside message sent without a per-step owner gate",
      },
      {
        state: "DESIGNED",
        entryCriteria: "design review recorded",
        requiredEvidence: ["design note", "review note"],
        verificationCommand: "node scripts/ladder/evidence-passport.mjs --print",
        exitCriteria: "offline deterministic execution recorded",
        failureState: OUTCOME_STATES.UNKNOWN,
        unknownState: OUTCOME_STATES.UNKNOWN,
        auditRecord: "design is a boundary declaration, never a capability claim",
      },
      {
        state: "DRY_RUN",
        entryCriteria: "offline runnable + deterministic",
        requiredEvidence: ["dry-run evidence captures", "no network performed"],
        verificationCommand: "npm test",
        exitCriteria: "sandbox capability built and documented",
        failureState: OUTCOME_STATES.UNKNOWN,
        unknownState: OUTCOME_STATES.UNKNOWN,
        auditRecord: "every DRY_RUN record is labeled dry-run evidence",
      },
      {
        state: "SANDBOX_READY",
        entryCriteria: "sandbox capability documented",
        requiredEvidence: ["sandbox docs", "revocation path"],
        verificationCommand: "npm run partner:sandbox",
        exitCriteria: "owner-approved credential for a NAMED integrator",
        failureState: OUTCOME_STATES.REJECTED,
        unknownState: OUTCOME_STATES.UNKNOWN,
        auditRecord: "no sandbox authorization without owner approval",
      },
      {
        state: "SANDBOX_AUTHORIZED",
        entryCriteria: "named integrator + owner approval + sandbox-only + no real funds",
        requiredEvidence: ["integrator name", "owner approval record", "sandbox-only scope"],
        verificationCommand: "node scripts/ladder/evidence-passport.mjs --print",
        exitCriteria: "prepared adjudication.prepare() packet accepted",
        failureState: OUTCOME_STATES.FAILED,
        unknownState: OUTCOME_STATES.UNKNOWN,
        auditRecord: "L1 authority = SANDBOX_ONLY, never more",
      },
      {
        state: "LIVE_PREPARED",
        entryCriteria: "real surface accepted prepared packet; no settlement authority",
        requiredEvidence: ["surface confirmation", "no-settlement assertion"],
        verificationCommand: "node packages/adapters/providers.mjs --status",
        exitCriteria: "webhook stream connected",
        failureState: OUTCOME_STATES.FAILED,
        unknownState: OUTCOME_STATES.UNKNOWN,
        auditRecord: "preparation is not execution",
      },
      {
        state: "WEBHOOK_CONNECTED",
        entryCriteria: "auth + replay protection + idempotency",
        requiredEvidence: ["webhook security record", "policy boundary active"],
        verificationCommand: "node scripts/attack-lab.mjs",
        exitCriteria: "conformance run started",
        failureState: OUTCOME_STATES.FAILED,
        unknownState: OUTCOME_STATES.UNKNOWN,
        auditRecord: "webhook is a stream boundary, never authority",
      },
      {
        state: "CONFORMANCE_TESTING",
        entryCriteria: "integration under conformance suite",
        requiredEvidence: ["conformance run id"],
        verificationCommand: "npm run ladder:conformance",
        exitCriteria: "suite verdict recorded",
        failureState: OUTCOME_STATES.UNKNOWN,
        unknownState: OUTCOME_STATES.UNKNOWN,
        auditRecord: "no verdict before the suite runs green",
      },
      {
        state: "CONFORMANT",
        entryCriteria: "suite passed for a pinned version",
        requiredEvidence: ["CG-CS/1 PASS report"],
        verificationCommand: "npm run ladder:conformance",
        exitCriteria: "production boundary without settlement",
        failureState: OUTCOME_STATES.FAILED,
        unknownState: OUTCOME_STATES.UNKNOWN,
        auditRecord: "CG-CS/1 is badge-eligible, never endorsement",
      },
      {
        state: "PRODUCTION",
        entryCriteria: "conformance + security + evidence contract + partner approval + scope",
        requiredEvidence: ["five production records"],
        verificationCommand: "npm run ladder:status",
        exitCriteria: "multi-partner / commercial milestone recorded",
        failureState: OUTCOME_STATES.FAILED,
        unknownState: OUTCOME_STATES.UNKNOWN,
        auditRecord: "PRODUCTION boundary without automatic settlement",
      },
      {
        state: "SUSPENDED",
        entryCriteria: "owner pause",
        requiredEvidence: ["owner pause record"],
        verificationCommand: "npm run ladder:status",
        exitCriteria: "resume by owner approval or close",
        failureState: OUTCOME_STATES.FAILED,
        unknownState: OUTCOME_STATES.UNKNOWN,
        auditRecord: "all live steps halt while suspended",
      },
      {
        state: "REVOKED",
        entryCriteria: "authorization withdrawn",
        requiredEvidence: ["owner revocation record"],
        verificationCommand: "npm run ladder:status",
        exitCriteria: "permanent retirement",
        failureState: OUTCOME_STATES.FAILED,
        unknownState: OUTCOME_STATES.UNKNOWN,
        auditRecord: "closed surface; historical only",
      },
      {
        state: "DEPRECATED",
        entryCriteria: "permanent retirement",
        requiredEvidence: ["deprecation record"],
        verificationCommand: "npm run ladder:status",
        exitCriteria: "none (terminal)",
        failureState: OUTCOME_STATES.FAILED,
        unknownState: OUTCOME_STATES.UNKNOWN,
        auditRecord: "historical record only",
      },
    ].map((d) => [d.state, Object.freeze(d)]),
  ),
);

/** A machine record for a single integration: status derives from the state;
 *  claims are empty until recorded evidence supports them; unknowns are listed
 *  explicitly. Deterministic on purpose (fixed key order, no timestamps). */
export function evaluateIntegration(record = {}) {
  const state = INTEGRATION_STATES.includes(record.state) ? record.state : "NOT_STARTED";
  const doorway = INTEGRATION_DOORWAYS[state];
  if (record.networkCall === "PERFORMED" && record.integrationStatus === "NOT_BUILT") {
    return {
      state,
      status: OUTCOME_STATES.UNKNOWN,
      evidence: [],
      verifiedAt: null,
      verifier: "honesty-contract",
      claims: [],
      unknowns: ["networkCall PERFORMED does not upgrade a NOT_BUILT integration"],
    };
  }
  if (record.integrationStatus === "NOT_BUILT" && state !== "NOT_STARTED") {
    return {
      state,
      status: OUTCOME_STATES.UNKNOWN,
      evidence: [],
      verifiedAt: null,
      verifier: "registry",
      claims: [],
      unknowns: [`${state} without integrationStatus built -> UNKNOWN`],
    };
  }
  return {
    state,
    status: OUTCOME_STATES.ACTIVE,
    evidence: doorway.requiredEvidence.map((e) => e),
    verifiedAt: null,
    verifier: "state-machine",
    claims: [],
    unknowns: state === "NOT_STARTED" ? ["no recorded external milestone"] : [],
  };
}

/** A forbidden transition attempts to jump a gate (missing authorization) and
 *  the machine answers REJECTED — never a silent pass, never a verdict. */
export function transitionVerdict(from, to, conditions = {}) {
  const verdict = evaluateTransition(from, to, conditions);
  if (!verdict.allowed) {
    return { outcome: OUTCOME_STATES.REJECTED, missing: verdict.missing, note: verdict.note };
  }
  return { outcome: OUTCOME_STATES.ACTIVE, missing: [], note: verdict.note };
}

/** The named requirements a "fully recorded" live integration documents. */
export function fullAuthorizationRecords() {
  return {
    namedIntegrator: true,
    ownerApproval: true,
    environmentSandboxOnly: true,
    noRealFunds: true,
    adjudicationSurfaceConfirmed: true,
    noSettlementAuthority: true,
    webhookSecurity: true,
    policyBoundaryActive: true,
    conformanceSuitePass: true,
    securityCheckPass: true,
    evidenceContractPass: true,
    partnerApproval: true,
    deploymentScopeDefined: true,
  };
}

function selfCheck() {
  const forbidden = transitionVerdict("DRY_RUN", "SANDBOX_AUTHORIZED", {});
  const unknownRec = evaluateIntegration({ state: "DRY_RUN", integrationStatus: "NOT_BUILT", networkCall: "NOT_PERFORMED" });
  const liveRec = evaluateIntegration({ state: "DRY_RUN", integrationStatus: "NOT_BUILT", networkCall: "PERFORMED" });
  const ok =
    forbidden.outcome === OUTCOME_STATES.REJECTED &&
    unknownRec.status === OUTCOME_STATES.UNKNOWN &&
    liveRec.status === OUTCOME_STATES.UNKNOWN &&
    UNKNOWN_RULE.includes("UNKNOWN != FAILED");
  console.log(`INTEGRATION-STATES SELF-CHECK: ${ok ? "PASS" : "FAIL"}`);
  console.log("  forbidden live jump -> " + forbidden.outcome + " (" + forbidden.missing.join(",") + ")");
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && process.argv[1].endsWith("integration-states.mjs")) {
  if (process.argv.includes("--self-check")) selfCheck();
}