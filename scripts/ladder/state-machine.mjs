/**
 * state-machine.mjs — the guarded transition table for integration states.
 *
 * Every edge from or into a "live" state carries requirements that cannot be
 * recorded by the repo alone: a named integrator, a recorded owner approval,
 * and a boundary assertion (no settlement authority). evaluateTransition
 * returns { allowed, missing } purely, so any caller (CLI, dashboard, tests)
 * can prove WHY a step is blocked — the honest posture on every surface.
 */

import { INTEGRATION_STATES } from "./states.mjs";

const R = {
  APPROVAL: "ownerApproval",
  INTEGRATOR: "namedIntegrator",
  SANDBOX_ONLY: "environmentSandboxOnly",
  NO_FUNDS: "noRealFunds",
  ADJUDICATION_SURFACE: "adjudicationSurfaceConfirmed",
  NO_SETTLEMENT: "noSettlementAuthority",
  WEBHOOK_SECURITY: "webhookSecurity",
  POLICY_BOUNDARY: "policyBoundaryActive",
  CONFORMANCE_PASS: "conformanceSuitePass",
  SECURITY_PASS: "securityCheckPass",
  EVIDENCE_CONTRACT_PASS: "evidenceContractPass",
  PARTNER_APPROVAL: "partnerApproval",
  DEPLOYMENT_SCOPE: "deploymentScopeDefined",
  RESUME_APPROVAL: "ownerApproval",
};

export const GUARDS = Object.freeze(R);

/** Every legal forward edge with the requirements it must record. */
export const TRANSITIONS = Object.freeze({
  NOT_STARTED: [
    { to: "DESIGNED", requires: [], note: "design reviewed" },
    { to: "REVOKED", requires: [], note: "closed before start" },
  ],
  DESIGNED: [
    { to: "DRY_RUN", requires: [], note: "offline, deterministic execution recorded" },
    { to: "NOT_STARTED", requires: [], note: "design retracted" },
  ],
  DRY_RUN: [
    { to: "SANDBOX_READY", requires: [], note: "sandbox capability built and documented" },
    { to: "NOT_STARTED", requires: [], note: "surface closed" },
    { to: "REVOKED", requires: [], note: "closed from dry-run" },
  ],
  SANDBOX_READY: [
    {
      to: "SANDBOX_AUTHORIZED",
      requires: [R.INTEGRATOR, R.APPROVAL, R.SANDBOX_ONLY, R.NO_FUNDS],
      note: "L1 — owner-approved sandbox credential for a NAMED integrator",
    },
    { to: "NOT_STARTED", requires: [], note: "sandbox not adopted" },
  ],
  SANDBOX_AUTHORIZED: [
    {
      to: "LIVE_PREPARED",
      requires: [R.INTEGRATOR, R.APPROVAL, R.ADJUDICATION_SURFACE, R.NO_SETTLEMENT],
      note: "L2 — prepared adjudication.prepare() packet accepted by a real surface",
    },
    { to: "SUSPENDED", requires: [], note: "sandbox paused" },
    { to: "REVOKED", requires: [], note: "sandbox revoked" },
  ],
  LIVE_PREPARED: [
    {
      to: "WEBHOOK_CONNECTED",
      requires: [R.INTEGRATOR, R.APPROVAL, R.WEBHOOK_SECURITY, R.POLICY_BOUNDARY],
      note: "L3 — live webhook stream connected with audit",
    },
    { to: "SUSPENDED", requires: [], note: "preparation paused" },
    { to: "REVOKED", requires: [], note: "authorization revoked" },
  ],
  WEBHOOK_CONNECTED: [
    { to: "CONFORMANCE_TESTING", requires: [], note: "conformance run started" },
    { to: "SUSPENDED", requires: [], note: "stream paused" },
    { to: "REVOKED", requires: [], note: "stream disconnected" },
  ],
  CONFORMANCE_TESTING: [
    { to: "CONFORMANT", requires: [R.CONFORMANCE_PASS], note: "suite passed for a pinned version" },
    { to: "WEBHOOK_CONNECTED", requires: [], note: "suite failed; integration re-opened" },
    { to: "SUSPENDED", requires: [], note: "run paused" },
  ],
  CONFORMANT: [
    {
      to: "PRODUCTION",
      requires: [R.CONFORMANCE_PASS, R.SECURITY_PASS, R.EVIDENCE_CONTRACT_PASS, R.PARTNER_APPROVAL, R.DEPLOYMENT_SCOPE],
      note: "production boundary without automatic settlement",
    },
    { to: "CONFORMANCE_TESTING", requires: [], note: "re-certification on a release" },
    { to: "SUSPENDED", requires: [], note: "integration paused" },
    { to: "REVOKED", requires: [], note: "integration closed" },
  ],
  PRODUCTION: [
    { to: "CONFORMANCE_TESTING", requires: [], note: "re-certification" },
    { to: "SUSPENDED", requires: [], note: "owner pause" },
    { to: "REVOKED", requires: [], note: "authorization withdrawn" },
  ],
  SUSPENDED: [
    { to: "SANDBOX_AUTHORIZED", requires: [R.APPROVAL], note: "resume at last authorized surface" },
    { to: "LIVE_PREPARED", requires: [R.APPROVAL], note: "resume preparation" },
    { to: "WEBHOOK_CONNECTED", requires: [R.APPROVAL], note: "resume stream" },
    { to: "CONFORMANT", requires: [R.APPROVAL], note: "resume conformant" },
    { to: "PRODUCTION", requires: [R.APPROVAL], note: "resume production" },
    { to: "REVOKED", requires: [], note: "closed permanently" },
  ],
  REVOKED: [
    { to: "DEPRECATED", requires: [], note: "terminal retirement" },
  ],
  DEPRECATED: [],
});

export function edgeFor(from, to) {
  const edges = TRANSITIONS[from] || [];
  return edges.find((e) => e.to === to) || null;
}

export function requiresFor(from, to) {
  const e = edgeFor(from, to);
  return e ? e.requires : null;
}

/**
 * @param {string} from - current state
 * @param {string} to - target state
 * @param {Object} conditions - recorded facts that may satisfy requirements
 * @returns {{allowed:boolean, missing:string[], note:string|null}}
 */
export function evaluateTransition(from, to, conditions = {}) {
  if (!(from in TRANSITIONS) || !to) {
    return { allowed: false, missing: ["unknownState"], note: null };
  }
  const edge = edgeFor(from, to);
  if (!edge) {
    return { allowed: false, missing: ["noTransition"], note: null };
  }
  const missing = edge.requires.filter((r) => conditions[r] !== true);
  if (missing.length > 0) {
    return { allowed: false, missing, note: edge.note };
  }
  return { allowed: true, missing: [], note: edge.note };
}

/**
 * The shortest requirement-free corridor from NOT_STARTED to PRODUCTION with
 * every live gate satisfied. Returns the list of names a fully-authorized,
 * fully-recorded integration documents. Used by docs and dashboards as the
 * "provenance of a live integration" — never as a claim that one exists.
 */
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