import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  INTEGRATION_STATES,
  INTEGRATION_STATE_SET,
  STATE_AUTHORITY,
  STATE_MEANING,
  STATE_PHASE,
  PLATFORM_LEVELS,
  currentPlatformLevel,
  HARD_RED_LINE,
  isIntegrationState,
} from "../../scripts/ladder/states.mjs";
import {
  TRANSITIONS,
  evaluateTransition,
  fullAuthorizationRecords,
  requiresFor,
  GUARDS,
} from "../../scripts/ladder/state-machine.mjs";
import {
  ADAPTER_REGISTRY,
  TRACK_REGISTRY,
  registrySummary,
} from "../../scripts/ladder/adapters.mjs";
import {
  CONFORMANCE_SUITE_FIELDS,
  CONFORMANCE_SUITE_VERSION,
  evaluateConformance,
  conformanceEligible,
  badgeStatement,
  VERIFIED_BADGE,
} from "../../scripts/ladder/conformance.mjs";
import { build } from "../../scripts/ladder/evidence-passport.mjs";
import { buildBoard, boardText } from "../../scripts/ladder/adoption-dashboard.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

const allTrue = Object.fromEntries(CONFORMANCE_SUITE_FIELDS.map((f) => [f, true]));

test("state space: 13 distinct, all valid, meanings/authority/phase cover every state", () => {
  assert.equal(INTEGRATION_STATES.length, 13);
  assert.equal(new Set(INTEGRATION_STATES).size, 13);
  for (const s of INTEGRATION_STATES) {
    assert.ok(isIntegrationState(s));
    assert.ok(STATE_MEANING[s], `meaning missing for ${s}`);
    assert.ok(STATE_PHASE[s], `phase missing for ${s}`);
    assert.ok(STATE_AUTHORITY[s], `authority missing for ${s}`);
  }
  for (const s of ["NOT_STARTED", "DRY_RUN"]) {
    assert.equal(STATE_AUTHORITY[s], "NONE", `${s} must carry no authority`);
  }
  assert.equal(STATE_AUTHORITY.PRODUCTION, "BOUNDARY");
});

test("forward corridor NOT_STARTED→PRODUCTION is fully allowed ONLY with all records", () => {
  const path = ["NOT_STARTED", "DESIGNED", "DRY_RUN", "SANDBOX_READY", "SANDBOX_AUTHORIZED", "LIVE_PREPARED", "WEBHOOK_CONNECTED", "CONFORMANCE_TESTING", "CONFORMANT", "PRODUCTION"];
  for (let i = 0; i < path.length - 1; i += 1) {
    const r = evaluateTransition(path[i], path[i + 1], fullAuthorizationRecords());
    assert.ok(r.allowed, `${path[i]}→${path[i + 1]} should be allowed with full records: ${r.missing.join(",")}`);
  }
  // minimal empty corridor: with no records, the DRY_RUN mechanics still run
  assert.ok(evaluateTransition("NOT_STARTED", "DESIGNED", {}).allowed);
  assert.ok(evaluateTransition("DESIGNED", "DRY_RUN", {}).allowed);
});

test("every live gate requires namedIntegrator + ownerApproval by default", () => {
  const r = evaluateTransition("SANDBOX_AUTHORIZED", "LIVE_PREPARED", {});
  assert.equal(r.allowed, false);
  for (const g of [GUARDS.INTEGRATOR, GUARDS.APPROVAL, GUARDS.ADJUDICATION_SURFACE, GUARDS.NO_SETTLEMENT]) {
    assert.ok(r.missing.includes(g), `missing should include ${g}`);
  }
  assert.equal(requiresFor("CONFORMANT", "PRODUCTION").includes(GUARDS.PARTNER_APPROVAL), true);
});

test("CONFORMANT→PRODUCTION fails without the five production records", () => {
  const r = evaluateTransition("CONFORMANT", "PRODUCTION", { conformanceSuitePass: true });
  assert.equal(r.allowed, false);
  for (const g of [GUARDS.SECURITY_PASS, GUARDS.EVIDENCE_CONTRACT_PASS, GUARDS.PARTNER_APPROVAL, GUARDS.DEPLOYMENT_SCOPE]) {
    assert.ok(r.missing.includes(g), `missing should include ${g}`);
  }
  const ok = evaluateTransition("CONFORMANT", "PRODUCTION", fullAuthorizationRecords());
  assert.equal(ok.allowed, true);
});

test("non-states, illegal edges, and terminal states behave fail-closed", () => {
  assert.equal(evaluateTransition("NOT_STARTED", "PRODUCTION", {}).missing.includes("noTransition"), true);
  assert.equal(evaluateTransition("NOPE", "PRODUCTION", {}).allowed, false);
  const rev = evaluateTransition("REVOKED", "DEPRECATED", {});
  assert.equal(rev.allowed, true);
  assert.equal(evaluateTransition("DEPRECATED", "PRODUCTION", {}).allowed, false);
  // PRODUCTION has no forward living edges
  for (const t of TRANSITIONS.PRODUCTION) {
    assert.ok(["CONFORMANCE_TESTING", "SUSPENDED", "REVOKED"].includes(t.to), `PRODUCTION must not move to ${t.to}`);
  }
  // resume requires approval
  assert.equal(evaluateTransition("SUSPENDED", "PRODUCTION", {}).allowed, false);
  assert.ok(evaluateTransition("SUSPENDED", "PRODUCTION", { ownerApproval: true }).allowed);
});

test("platform levels: 9 levels, L0 today, higher floors need state + records", () => {
  assert.equal(PLATFORM_LEVELS.length, 9);
  assert.equal(PLATFORM_LEVELS[0].id, "L0");
  assert.equal(PLATFORM_LEVELS[8].id, "L8");
  assert.equal(currentPlatformLevel(ADAPTER_REGISTRY, { offlineEvidenceReproducible: true }), "L0");
  // even a CONFORMANT-state adapter cannot reach L4 without the recorded conditions
  assert.equal(
    currentPlatformLevel([{ state: "CONFORMANT" }], { conformanceSuitePass: true }),
    "L0",
  );
  const fullPathRecords = {
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
  };
  assert.equal(currentPlatformLevel([{ state: "CONFORMANT" }], fullPathRecords), "L4");
  assert.ok(HARD_RED_LINE.length > 40);
});

test("registry honesty: every adapter is NOT_BUILT / NOT_PERFORMED and never live", () => {
  assert.ok(ADAPTER_REGISTRY.length >= 3);
  for (const a of ADAPTER_REGISTRY) {
    assert.ok(INTEGRATION_STATE_SET.has(a.state), `state not in enum: ${a.id}`);
    assert.equal(a.integrationStatus, "NOT_BUILT", `${a.id} must stay honest`);
    assert.equal(a.networkCall, "NOT_PERFORMED", `${a.id} must not claim a call`);
    assert.ok(a.lastVerification === "NOT_RECORDED", `${a.id} must not claim verification`);
    assert.ok(!["LIVE_PREPARED", "WEBHOOK_CONNECTED", "CONFORMANT", "PRODUCTION"].includes(a.state), `${a.id} must not be live`);
  }
  const sum = registrySummary(ADAPTER_REGISTRY);
  assert.equal(sum.dryRun, 3);
  assert.equal(sum.live, 0);
  assert.equal(sum.notBuilt, 3);
});

test("tracks: six Phase B rails, all NOT_STARTED, letters B1–B6", () => {
  assert.equal(TRACK_REGISTRY.length, 6);
  assert.deepEqual(TRACK_REGISTRY.map((t) => t.letter), ["B1", "B2", "B3", "B4", "B5", "B6"]);
  for (const t of TRACK_REGISTRY) assert.equal(t.state, "NOT_STARTED");
});

test("conformance: verdicts distinguish absent from failed; badge never endorses", () => {
  const ok = evaluateConformance(allTrue);
  assert.equal(ok.verdict, "CONFORMANT");
  assert.equal(ok.checks.length, 6);
  assert.equal(conformanceEligible(allTrue), true);

  const missing = evaluateConformance({});
  assert.equal(missing.verdict, "INCOMPLETE_EVIDENCE");
  assert.equal(missing.missing.length, 6);

  const failed = evaluateConformance({ ...allTrue, securityCheckPass: false });
  assert.equal(failed.verdict, "NOT_CONFORMANT");
  assert.deepEqual(failed.failed, ["securityCheckPass"]);
  assert.equal(conformanceEligible({ ...allTrue, securityCheckPass: false }), false);

  const stmt = badgeStatement("CONFORMANT", ok);
  assert.ok(stmt && stmt.includes("not an endorsement"));
  assert.equal(badgeStatement("DRY_RUN", ok), null);
  assert.equal(badgeStatement("CONFORMANT", failed), null);
  for (const m of VERIFIED_BADGE.neverMeans) assert.ok(m.length > 10);
  assert.equal(CONFORMANCE_SUITE_VERSION, "CG-CS/1");
});

test("passport: deterministic build, honest platform + adapter fields", () => {
  const a = build();
  const b = build();
  assert.equal(JSON.stringify(a), JSON.stringify(b), "passport must be deterministic");
  assert.ok(a.platform.platformLevel === "L0");
  assert.equal(a.platform.conformanceSuite, "CG-CS/1");
  const pc = a.adapters.find((x) => x.id === "PEOPLES_COURT_ADAPTER");
  assert.ok(pc);
  assert.equal(pc.integrationStatus, "NOT_BUILT");
  assert.equal(pc.networkCall, "NOT_PERFORMED");
  assert.ok(pc.environment.includes("OFFLINE"));
  assert.equal(a.tracks.length, 6);
});

test("dashboard: reads committed sources, zero external counters by policy", () => {
  const board = buildBoard();
  const snap = JSON.parse(readFileSync(join(REPO, "docs", "state-snapshot.json"), "utf8"));
  assert.equal(board.engineering.testsTotal, snap.testsTotal);
  assert.equal(board.engineering.filesScanned, snap.boundaryAudit.filesScanned);
  assert.equal(board.external.externalVerifiers, 0);
  assert.equal(board.external.paidEngagements, 0);
  assert.ok(board.platformLevel === "L0");
  const txt = boardText(board);
  assert.ok(txt.includes("External milestones"));
  assert.ok(txt.includes("never invented upward"));
});