/**
 * states.mjs — the unified integration state space and the platform adoption
 * ladder (L0–L8). Single source of truth for every status the repo prints.
 *
 * Honesty contract: no status describes anything that is not backing a real
 * recorded surface. Nothing here grants authority; the transitions in
 * state-machine.mjs refuse every live step without a named integrator + owner
 * approval. Adapters keep integrationStatus NOT_BUILT until an authorized step
 * records a confirmation fixture.
 */

export const INTEGRATION_STATES = Object.freeze([
  "NOT_STARTED",
  "DESIGNED",
  "DRY_RUN",
  "SANDBOX_READY",
  "SANDBOX_AUTHORIZED",
  "LIVE_PREPARED",
  "WEBHOOK_CONNECTED",
  "CONFORMANCE_TESTING",
  "CONFORMANT",
  "PRODUCTION",
  "SUSPENDED",
  "REVOKED",
  "DEPRECATED",
]);

export const INTEGRATION_STATE_SET = new Set(INTEGRATION_STATES);

export function isIntegrationState(s) {
  return INTEGRATION_STATE_SET.has(s);
}

/** What each state legally means (used by docs, dashboards, passports). */
export const STATE_MEANING = Object.freeze({
  NOT_STARTED: "no work recorded; the surface is only a boundary declaration",
  DESIGNED: "integration design recorded and reviewed; no runnable artifact claimed",
  DRY_RUN: "runnable offline and deterministic; every record is a dry-run evidence capture",
  SANDBOX_READY: "sandbox capability built: scoped credentials, audit trail, revocation, no real funds",
  SANDBOX_AUTHORIZED: "owner-approved sandbox authorization for a NAMED integrator (L1)",
  LIVE_PREPARED: "live adjudication.prepare() packet accepted by a real adjudication surface (L2)",
  WEBHOOK_CONNECTED: "live webhook stream connected with auth, replay protection, idempotency (L3)",
  CONFORMANCE_TESTING: "integration under the CoreGuard Conformance Suite (no verdict yet)",
  CONFORMANT: "passed the conformance suite for a pinned version (badge-eligible; never endorsement)",
  PRODUCTION: "running a production boundary WITHOUT any automatic settlement authority",
  SUSPENDED: "paused by owner decision; all live steps halted; no authority claimed",
  REVOKED: "authorization revoked; surface closed",
  DEPRECATED: "permanently retired; historical record only",
});

export const STATE_PHASE = Object.freeze({
  NOT_STARTED: "plan",
  DESIGNED: "plan",
  DRY_RUN: "dry",
  SANDBOX_READY: "sandbox",
  SANDBOX_AUTHORIZED: "sandbox",
  LIVE_PREPARED: "live",
  WEBHOOK_CONNECTED: "live",
  CONFORMANCE_TESTING: "live",
  CONFORMANT: "live",
  PRODUCTION: "live",
  SUSPENDED: "off",
  REVOKED: "off",
  DEPRECATED: "off",
});

/** The authority a status legally carries — never exceeds what a recorded,
 *  authorized step proved. */
export const STATE_AUTHORITY = Object.freeze({
  NOT_STARTED: "NONE",
  DESIGNED: "NONE",
  DRY_RUN: "NONE",
  SANDBOX_READY: "NONE",
  SANDBOX_AUTHORIZED: "SANDBOX_ONLY",
  LIVE_PREPARED: "PREPARED",
  WEBHOOK_CONNECTED: "CONNECTED",
  CONFORMANCE_TESTING: "CONNECTED",
  CONFORMANT: "CONNECTED",
  PRODUCTION: "BOUNDARY",
  SUSPENDED: "NONE",
  REVOKED: "NONE",
  DEPRECATED: "NONE",
});

/**
 * The platform-wide adoption ladder. A level is LIVE when at least one
 * adapter reached its state floor AND every named prerequisite is recorded.
 */
export const PLATFORM_LEVELS = Object.freeze([
  {
    id: "L0",
    label: "PUBLIC / REPRODUCIBLE / OFFLINE",
    stateFloor: null,
    requires: ["offlineEvidenceReproducible"],
    description: "evidence generation, deterministic verification, replay, tamper detection, fail-closed semantics, dry-run adapters — all reproducible from a fresh clone.",
  },
  {
    id: "L1",
    label: "AUTHORIZED SANDBOX",
    stateFloor: "SANDBOX_AUTHORIZED",
    requires: ["namedIntegrator", "ownerApproval", "environmentSandboxOnly", "noRealFunds"],
    description: "a partner/integrator holds a limited sandbox credential with scoping, audit trail, and revocation. First real shift from NOT_BUILT.",
  },
  {
    id: "L2",
    label: "LIVE ADJUDICATION PREPARATION",
    stateFloor: "LIVE_PREPARED",
    requires: ["namedIntegrator", "ownerApproval", "adjudicationSurfaceConfirmed", "noSettlementAuthority"],
    description: "a prepared adjudication.prepare() packet is accepted by a real external platform. No automatic settlement.",
  },
  {
    id: "L3",
    label: "LIVE WEBHOOK INTEGRATION",
    stateFloor: "WEBHOOK_CONNECTED",
    requires: ["namedIntegrator", "ownerApproval", "webhookSecurity", "policyBoundaryActive"],
    description: "live adjudication results stream into the verifier via an audited webhook (auth, replay protection, event ids, dead-letter).",
  },
  {
    id: "L4",
    label: "PRODUCTION CONFORMANCE",
    stateFloor: "CONFORMANT",
    requires: ["conformanceSuitePass", "securityCheckPass", "evidenceContractPass"],
    description: "the production integration still conforms to the CoreGuard contract on every release.",
  },
  {
    id: "L5",
    label: "MULTI-PARTNER INTEROPERABILITY",
    stateFloor: "PRODUCTION",
    requires: ["minTwoConformantPartners"],
    description: "CoreGuard acts as the neutral evidence layer between multiple adjudicators — none of them load-bearing.",
  },
  {
    id: "L6",
    label: "VERIFIABLE INFRASTRUCTURE",
    stateFloor: "PRODUCTION",
    requires: ["versionedReceipts", "verificationRegistry", "publicVerificationPages"],
    description: "machine-readable status: versioned evidence receipts, verification registry, integration attestations, compatibility matrix.",
  },
  {
    id: "L7",
    label: "COMMERCIAL INFRASTRUCTURE",
    stateFloor: "PRODUCTION",
    requires: ["firstPaidEngagement"],
    description: "verification service, conformance, evidence gateways — the protocol stays MIT; value is infrastructure/services.",
  },
  {
    id: "L8",
    label: "PARTNER NETWORK",
    stateFloor: "PRODUCTION",
    requires: ["partnerProgramLive"],
    description: "a partner program, adapter marketplace, and ecosystem listings that make IT easy for others to come to us.",
  },
]);

export const PLATFORM_LEVEL_BY_ID = Object.freeze(
  Object.fromEntries(PLATFORM_LEVELS.map((l) => [l.id, l])),
);

export const LEVEL_STATE_FLOOR = Object.freeze(
  Object.fromEntries(PLATFORM_LEVELS.map((l) => [l.id, l.stateFloor])),
);

/**
 * Highest level the CURRENT evidence supports. Deterministic from the adapter
 * registry: a level is reached only when some adapter has a state at least its
 * floor and every listed prerequisite is present in the recorded conditions.
 */
export function currentPlatformLevel(adapters, recordedConditions = {}) {
  const maxStateIndex = (admins) =>
    admins.reduce((m, a) => Math.max(m, INTEGRATION_STATES.indexOf(a.state)), -1);
  const seen = maxStateIndex(adapters);
  let level = "L0";
  for (const lv of PLATFORM_LEVELS) {
    if (lv.stateFloor === null) continue;
    if (INTEGRATION_STATES.indexOf(lv.stateFloor) > seen) break;
    const missing = lv.requires.filter((r) => recordedConditions[r] !== true);
    if (missing.length > 0) break;
    level = lv.id;
  }
  return level;
}

export const HARD_RED_LINE =
  "No live L1/L2/L3 step is ever taken without a named integrator + recorded owner approval + a no-settlement boundary. The repo structurally refuses claiming otherwise.";