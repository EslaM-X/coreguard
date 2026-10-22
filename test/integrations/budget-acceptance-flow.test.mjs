import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  BUDGET_VERSION,
  BUDGET_JOB_STATES,
  REFUSAL_CODES,
  BUDGET_HONESTY_RULE,
  createBudgetLedger,
  selfCheck as budgetSelfCheck,
} from "../../packages/budget/ledger.mjs";
import {
  ACCEPTANCE_VERSION,
  ACCEPTANCE_HONESTY_RULE,
  CHECK_KINDS,
  JUDGMENT_KINDS,
  buildAcceptanceSpec,
  evaluateAcceptance,
  selfCheck as acceptanceSelfCheck,
} from "../../packages/acceptance/index.mjs";
import {
  X402_VERSION,
  createX402Harness,
  selfCheck as x402SelfCheck,
} from "../../packages/x402/index.mjs";
import {
  INTEGRATION_VERSION,
  createJobFlow,
  budgetWaterfall,
  reservationTimeline,
  acceptanceEvidenceBundle,
  deterministicReplay,
  selfCheck as jobFlowSelfCheck,
} from "../../packages/job-integration/index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const SECRET = "test-secret-not-a-real-key";
const OWNER_QUOTE = (cents) => ({ amountCents: cents, lockedByOwner: true, provenance: "owner decision" });

/* ============================================================== CG-BUD/1 */

test("CG-BUD/1: the self-check battery passes and its case count is pinned", () => {
  const r = budgetSelfCheck();
  assert.equal(r.ok, true, JSON.stringify(r.cases.filter(([, p]) => !p)));
  assert.equal(r.cases.length, 24);
  versions();
});

function versions() {
  assert.equal(BUDGET_VERSION, "CG-BUD/1");
  assert.equal(ACCEPTANCE_VERSION, "CG-ACC/1");
  assert.equal(X402_VERSION, "X402/1");
  assert.equal(INTEGRATION_VERSION, "CG-INT/1");
}

test("CG-BUD/1: the one-line honesty rule carries the clauses it is bound by", () => {
  for (const clause of ["one ceiling", "is REFUSED and changes nothing", "carved out of its parent's remaining budget"]) {
    assert.ok(BUDGET_HONESTY_RULE.includes(clause), `the honesty rule must carry its clause: ${clause}`);
  }
  for (const state of BUDGET_JOB_STATES) assert.ok(["OPEN", "HELD", "RELEASED", "REFUNDED"].includes(state));
});

test("CG-BUD/1: every refusal code is real — triggerable by a named probe or documented dead-guard", () => {
  const ledger = createBudgetLedger();
  ledger.openJob({ jobId: "j", ceilingCents: 100 });
  const probes = {
    NO_SUCH_JOB: () => ledger.reserve({ jobId: "ghost", amountCents: 1 }),
    NO_SUCH_SCOPE: () => ledger.reserve({ jobId: "j", scopeId: "ghost", amountCents: 1 }),
    UNKNOWN_AMOUNT: () => ledger.reserve({ jobId: "j", amountCents: 0 }),
    EXCEEDS_SCOPE_SHARE: () => {
      ledger.openScope({ jobId: "j", scopeId: "s", shareCents: 10 });
      return ledger.reserve({ jobId: "j", scopeId: "s", amountCents: 11 });
    },
    EXCEEDS_JOB_CEILING: () => {
      ledger.openJob({ jobId: "j2", ceilingCents: 10 });
      return ledger.reserve({ jobId: "j2", amountCents: 11 });
    },
    NO_SUCH_RESERVATION: () => ledger.commit({ jobId: "j", reservationId: "res_nope" }),
    RESERVATION_CLOSED: () => {
      ledger.openJob({ jobId: "j3", ceilingCents: 100 });
      const r = ledger.reserve({ jobId: "j3", amountCents: 50 });
      ledger.commit({ jobId: "j3", reservationId: r.reservationId });
      return ledger.commit({ jobId: "j3", reservationId: r.reservationId });
    },
    NOTHING_HELD: () => {
      ledger.openJob({ jobId: "j5", ceilingCents: 100 });
      return ledger.disposition({ jobId: "j5", to: "RELEASED" });
    },
    INVALID_DISPOSITION: () => {
      ledger.openJob({ jobId: "j6", ceilingCents: 100 });
      ledger.hold({ jobId: "j6", amountCents: 50 });
      return ledger.disposition({ jobId: "j6", to: "COMMIT" });
    },
    SCOPE_CLOSED: () => null,
  };
  for (const code of REFUSAL_CODES) {
    if (code === "SCOPE_CLOSED") continue; // dead-guard, see below
    const out = probes[code]();
    assert.ok(out && out.state === "REFUSED" && out.code === code, `refusal ${code} must be triggerable by name (got ${out && out.code})`);
    assert.equal(out.ok, false, `${code}: a refusal never reports ok`);
  }
  // Dead-guard honesty: with no public path that closes a scope, SCOPE_CLOSED
  // is a guard whose trigger does not exist in CG-BUD/1. It is named here so
  // either the trigger arrives or the code is removed — it is never silently dead.
  const src = readFileSync(join(REPO, "packages", "budget", "ledger.mjs"), "utf8");
  assert.ok(src.includes(`"SCOPE_CLOSED"`), "SCOPE_CLOSED is shipped and named");
  assert.ok((src.match(/state !== "OPEN"/g) || []).length >= 2, "the SCOPE_CLOSED guards exist in openScope and reserve looking up a parent/scope state");
});

test("CG-BUD/1: sibling scopes cannot both take the last dollar, and an exact fit is honoured", () => {
  const ledger = createBudgetLedger();
  const opened = ledger.openJob({ jobId: "job", ceilingCents: 100 });
  assert.ok(opened.ok && opened.availableCents === 100);
  const a = ledger.openScope({ jobId: "job", scopeId: "a", shareCents: 60 });
  ledger.openScope({ jobId: "job", scopeId: "b", shareCents: 60 });
  assert.ok(a.ok, "the first sibling carves its share");
  const snapA = ledger.snapshot({ jobId: "job" });
  assert.equal(snapA.scopes[0].shareCents, 60);
  assert.equal(snapA.availableCents, 40, "the allocation debit leaves the remainder");
  assert.equal(ledger.snapshot({ jobId: "job" }).scopes.length, 1, "a refused share leaves no scope behind");
  const b2 = ledger.openScope({ jobId: "job", scopeId: "b2", shareCents: 1 });
  assert.ok(b2.ok, "a share within the remainder is honoured — the ceiling forbids, the remainder permits");
  assert.equal(b2.availableCents, 1, "the share opens as spendable amount — opening debits the parent, not the child");
  assert.equal(ledger.snapshot({ jobId: "job" }).availableCents, 39, "the second sibling's share is debited from the whole remainder");
  const exact = ledger.openScope({ jobId: "job", scopeId: "c", shareCents: 39 });
  assert.ok(exact.ok && exact.availableCents === 39, "an exact-fit share carves the remaining money");
  assert.equal(ledger.snapshot({ jobId: "job" }).availableCents, 0, "the ceiling is fully allocated — no scope can grow past it");
  const nest = ledger.openScope({ jobId: "job", scopeId: "gc", parentScopeId: "c", shareCents: 39 });
  assert.ok(nest.ok, "a parent scope's share is carvable by its child");
  const more = ledger.openScope({ jobId: "job", scopeId: "mc", parentScopeId: "c", shareCents: 1 });
  assert.equal(more.state, "REFUSED", "a second child cannot reach the parent's spent share");
  assert.equal(more.code, "EXCEEDS_JOB_CEILING");
});

test("CG-BUD/1: one ceiling serves settlement AND metered costs — the wallet-cap gap never reopens", () => {
  const ledger = createBudgetLedger();
  ledger.openJob({ jobId: "mix", ceilingCents: 100 });
  ledger.openScope({ jobId: "mix", scopeId: "sub", shareCents: 70 });
  const settle = ledger.reserve({ jobId: "mix", scopeId: "sub", amountCents: 30, source: "SETTLEMENT" });
  const metered = ledger.meter({ jobId: "mix", scopeId: "sub", amountCents: 30, source: "METERED" });
  assert.ok(settle.ok, "settlement reserves on the shared ceiling");
  assert.ok(metered.ok && metered.state === "COMMITTED", "metered commits in the same synchronous step");
  const third = ledger.reserve({ jobId: "mix", scopeId: "sub", amountCents: 11 });
  assert.equal(third.state, "REFUSED", "the third cost is refused on the SAME arithmetic");
  assert.equal(third.code, "EXCEEDS_SCOPE_SHARE");
  const snap = ledger.snapshot({ jobId: "mix" });
  assert.equal(snap.scopes[0].reservedCents, 30, "the settlement reserve is held, not silently committed");
  assert.equal(snap.scopes[0].committedCents, 30, "only the metered cost is committed — reserve and commit are distinct steps");
  ledger.openJob({ jobId: "ghost", ceilingCents: 100 });
  const reach = ledger.reserve({ jobId: "ghost", scopeId: "sub", amountCents: 1 });
  assert.equal(reach.state, "REFUSED");
  assert.equal(reach.code, "NO_SUCH_SCOPE", "another job cannot reach job A's scopes");
  const release = ledger.release({ jobId: "mix", reservationId: settle.reservationId });
  assert.ok(release.ok, "a reservation that did not spend releases");
  assert.equal(ledger.snapshot({ jobId: "mix" }).scopes[0].availableCents, 40, "the metered commit stays; the released reserve returns");
});

test("CG-BUD/1: the hold/disposition matrix — RELEASED, REFUNDED, HELD, and nothing moves unauthorised", () => {
  const ledger = createBudgetLedger();
  for (const id of ["acc", "rej", "unk"]) {
    ledger.openJob({ jobId: id, ceilingCents: 400 });
    assert.ok(ledger.hold({ jobId: id, amountCents: 400 }).ok, `${id} locks its budget at publish`);
  }
  assert.equal(ledger.hold({ jobId: "acc", amountCents: 100 }).code, "INVALID_DISPOSITION", "a second hold is refused");
  const stay = ledger.disposition({ jobId: "unk", to: "HELD", reason: "verdict UNKNOWN" });
  assert.ok(stay.ok && stay.state === "HELD", "an undecided verdict leaves the money locked");
  assert.equal(ledger.snapshot({ jobId: "unk" }).heldCents, 400);
  const rel = ledger.disposition({ jobId: "acc", to: "RELEASED", reason: "verdict ACCEPTED" });
  assert.ok(rel.ok && rel.releasedCents === 400, "acceptance makes the locked amount payable");
  assert.equal(ledger.snapshot({ jobId: "acc" }).heldCents, 0);
  const ref = ledger.disposition({ jobId: "rej", to: "REFUNDED", reason: "verdict REJECTED" });
  assert.ok(ref.ok && ref.refundedCents === 400, "rejection returns the locked amount");
  const snap = ledger.snapshot({ jobId: "acc" });
  assert.equal(snap.state, "RELEASED", "the job record keeps its final disposition");
});

/* ============================================================== CG-ACC/1 */

test("CG-ACC/1: the self-check battery passes and its case count is pinned", () => {
  const r = acceptanceSelfCheck();
  assert.equal(r.ok, true, JSON.stringify(r.cases.filter(([, p]) => !p)));
  assert.equal(r.cases.length, 12);
});

test("CG-ACC/1: the acceptance honesty rule carries the aggregation and the HELD consequence", () => {
  for (const clause of ["any FAIL is REJECTED", "every check PASS is ACCEPTED", "anything else is UNKNOWN", "leaves the money HELD"]) {
    assert.ok(ACCEPTANCE_HONESTY_RULE.includes(clause), `the acceptance rule must carry: ${clause}`);
  }
});

test("CG-ACC/1: the spec builder contract — empty, unknown-kind, duplicate-id and invalid-basis specs are refused", () => {
  assert.equal(buildAcceptanceSpec({ jobId: "j", checks: [] }).code, "NO_CHECKS");
  assert.equal(buildAcceptanceSpec({ jobId: "j", checks: [{ kind: "VIBES" }] }).code, "UNKNOWN_CHECK_KIND");
  const dupe = buildAcceptanceSpec({
    jobId: "j",
    checks: [
      { id: "same", kind: "DIGEST_MATCH", args: { digest: "a" } },
      { id: "same", kind: "ARTIFACT_PRESENT", args: { count: 1 } },
    ],
  });
  assert.equal(dupe.code, "DUPLICATE_CHECK_ID");
  assert.equal(buildAcceptanceSpec({ jobId: "j", checks: [{ kind: "ARTIFACT_PRESENT", args: { count: 1 } }], basis: "ORACLE" }).code, "INVALID_BASIS");
  const ids = buildAcceptanceSpec({
    jobId: "j",
    checks: [{ kind: "DIGEST_MATCH", args: { digest: "a" } }, { kind: "ARTIFACT_PRESENT", args: { count: 1 } }],
  });
  assert.ok(ids.ok, "a machine spec builds");
  assert.equal(ids.spec.basis, "MACHINE");
  assert.notEqual(ids.spec.checks[0].id, ids.spec.checks[1].id, "generated check ids are distinct");
  const judgment = buildAcceptanceSpec({ jobId: "j", checks: [{ kind: "PUBLISHER_APPROVAL" }] });
  assert.equal(judgment.spec.basis, "JUDGMENT", "leaning on a judgment check declares the basis");
  for (const kind of JUDGMENT_KINDS) assert.ok(CHECK_KINDS.includes(kind), "judgment kinds are a subset of real kinds");
});

test("CG-ACC/1: aggregation is the honesty rule — one FAIL rejects, the partial pass is visible but never ACCEPTED, and no evidence is UNKNOWN", () => {
  const spec = buildAcceptanceSpec({
    jobId: "agg",
    checks: [
      { kind: "DIGEST_MATCH", args: { digest: "aa11" } },
      { kind: "ARTIFACT_PRESENT", args: { count: 2 } },
      { kind: "REPLAY_MATCH" },
      { kind: "NO_FORBIDDEN_CALLS", args: { forbidden: ["selfTransfer"] } },
    ],
  }).spec;
  const full = { artifactSha256: "aa11", artifactCount: 2, replayState: "MATCH", calls: [] };
  const good = evaluateAcceptance({ spec, evidence: full });
  assert.equal(good.state, "ACCEPTED");
  assert.equal(good.disposition, "RELEASED");
  assert.deepEqual(good.counts, { pass: 4, fail: 0, unknown: 0, total: 4 });

  const tampered = evaluateAcceptance({ spec, evidence: { ...full, artifactSha256: "zz99" } });
  assert.equal(tampered.state, "REJECTED", "one FAIL rejects even with three passes");
  assert.equal(tampered.disposition, "REFUNDED");
  assert.equal(tampered.counts.pass, 3, "the partial pass is visible — but a partial pass is not ACCEPTED");

  const noEvidence = evaluateAcceptance({ spec, evidence: {} });
  assert.equal(noEvidence.state, "UNKNOWN", "an unproven delivery is not a failed one — it is unanswered");
  assert.equal(noEvidence.disposition, "HELD");

  const forbiddenHit = evaluateAcceptance({ spec, evidence: { ...full, calls: ["selfTransfer"] } });
  assert.equal(forbiddenHit.state, "REJECTED", "a forbidden call rejects — a clean digest does not launder it");

  const noSpec = evaluateAcceptance({ spec: null });
  assert.equal(noSpec.ok, false, "no spec means nothing can be accepted");
});

test("CG-ACC/1: an UNKNOWN verdict leaves the money HELD — in the ledger, by name", () => {
  const ledger = createBudgetLedger();
  ledger.openJob({ jobId: "escrow-unknown", ceilingCents: 250 });
  assert.ok(ledger.hold({ jobId: "escrow-unknown", amountCents: 250 }).ok);
  const spec = buildAcceptanceSpec({
    jobId: "escrow-unknown",
    checks: [{ kind: "ARTIFACT_PRESENT", args: { count: 1 } }, { kind: "HUMAN_JUDGMENT" }],
  }).spec;
  const evaluated = evaluateAcceptance({ spec, evidence: { artifactCount: 1 }, ledger });
  assert.equal(evaluated.state, "UNKNOWN");
  assert.equal(evaluated.disposition, "HELD");
  const snap = ledger.snapshot({ jobId: "escrow-unknown" });
  assert.equal(snap.heldCents, 250, "the locked amount is still locked after UNKNOWN");
  assert.equal(snap.releasedCents + snap.refundedCents, 0, "nothing was paid out and nothing was burned");
  const humanOnly = evaluateAcceptance({
    spec: buildAcceptanceSpec({ jobId: "h", checks: [{ kind: "HUMAN_JUDGMENT" }] }).spec,
    evidence: {},
  });
  assert.equal(humanOnly.checks[0].verdict, "UNKNOWN", "the HUMAN_JUDGMENT check never PASSES, by construction");
  assert.equal(humanOnly.state, "UNKNOWN");
});

test("CG-ACC/1: the disposition lands in a real ledger — ACCEPTED releases, REJECTED refunds", () => {
  const ledger = createBudgetLedger();
  ledger.openJob({ jobId: "escrow-paid", ceilingCents: 300 });
  ledger.hold({ jobId: "escrow-paid", amountCents: 300 });
  const spec = buildAcceptanceSpec({ jobId: "escrow-paid", checks: [{ kind: "ARTIFACT_PRESENT", args: { count: 1 } }] }).spec;
  const ok = evaluateAcceptance({ spec, evidence: { artifactCount: 1 }, ledger });
  assert.equal(ok.dispositionApplied.state, "RELEASED", "the applied disposition is reported, not implied");
  assert.equal(ledger.snapshot({ jobId: "escrow-paid" }).releasedCents, 300);

  const rejectLedger = createBudgetLedger();
  rejectLedger.openJob({ jobId: "escrow-bad", ceilingCents: 300 });
  rejectLedger.hold({ jobId: "escrow-bad", amountCents: 300 });
  const bad = evaluateAcceptance({
    spec: buildAcceptanceSpec({ jobId: "escrow-bad", checks: [{ kind: "REPLAY_MATCH" }] }).spec,
    evidence: { replayState: "MISMATCH" },
    ledger: rejectLedger,
  });
  assert.equal(bad.state, "REJECTED");
  assert.equal(rejectLedger.snapshot({ jobId: "escrow-bad" }).refundedCents, 300);
});

/* ============================================ X402: refused before sign */

test("X402: the self-check battery passes and its case count is pinned", () => {
  const r = x402SelfCheck();
  assert.equal(r.ok, true, JSON.stringify(r.cases.filter(([, p]) => !p)));
  assert.equal(r.cases.length, 18);
});

test("X402: a sub-agent share gates the signature — REFUSED leaves no signature and no cents reserved", () => {
  const ledger = createBudgetLedger();
  ledger.openJob({ jobId: "job-flow", ceilingCents: 400 });
  ledger.openScope({ jobId: "job-flow", scopeId: "research", shareCents: 200 });
  const harness = createX402Harness({
    secret: SECRET,
    budget: { ledger, jobId: "job-flow", scopeId: "research" },
  });
  const built = harness.challengeFor({ resource: "/v1/verify", quote: OWNER_QUOTE(300) });
  assert.equal(built.state, "CHALLENGE_BUILT", "building the challenge is gated on price only — budget bites at sign");
  const signed = harness.sign(built.challenge);
  assert.equal(signed.state, "REFUSED", "a cost that exceeds the sub-agent share is refused BEFORE a signature exists");
  assert.equal(signed.code, "EXCEEDS_SCOPE_SHARE");
  assert.equal(signed.signature, null, "no signature for a refused cost");
  assert.equal(ledger.snapshot({ jobId: "job-flow" }).scopes[0].reservedCents, 0, "the refused signature cost the share nothing");
  const fits = harness.challengeFor({ resource: "/v1/verify", quote: OWNER_QUOTE(50) });
  const ok = harness.sign(fits.challenge);
  assert.equal(ok.state, "SIGNED", "an authorised cost reserves and signs");
  assert.equal(ledger.snapshot({ jobId: "job-flow" }).scopes[0].reservedCents, 50, "the reservation is visible on the job");
  const again = harness.sign(fits.challenge);
  assert.equal(again.state, "REFUSED");
  assert.equal(again.code, "CHALLENGE_ALREADY_RESERVED", "two signatures for one challenge is one payment too many");
});

test("X402: settle closes the reservation honestly — DRY_RUN releases, a real settlement commits, forgery is rejected", () => {
  const ledger = createBudgetLedger();
  ledger.openJob({ jobId: "s-flow", ceilingCents: 100 });
  const dry = createX402Harness({ secret: SECRET, budget: { ledger, jobId: "s-flow" } });
  const challenge = dry.challengeFor({ resource: "/v1/verify", quote: OWNER_QUOTE(50) }).challenge;
  dry.sign(challenge);
  assert.equal(ledger.snapshot({ jobId: "s-flow" }).reservedCents, 50);
  const result = dry.settle({ challenge });
  assert.equal(result.state, "NOT_PERFORMED", "DRY_RUN attempts no settlement and books no revenue");
  assert.equal(ledger.snapshot({ jobId: "s-flow" }).reservedCents, 0, "no money moved, so the reservation releases");
  assert.equal(dry.metrics().settledCents, 0, "DRY_RUN books zero revenue");

  const live = createX402Harness({
    secret: SECRET,
    mode: "LIVE",
    settler: ({ challenge: c }) => ({ settlementId: `SETTLE-${c.id.slice(0, 8)}` }),
    budget: { ledger, jobId: "s-flow" },
  });
  const realChallenge = live.challengeFor({ resource: "/v1/verify", quote: OWNER_QUOTE(60) }).challenge;
  const sig = live.sign(realChallenge).signature;
  const settled = live.settle({ challenge: realChallenge, envelope: { signature: sig } });
  assert.equal(settled.state, "SETTLED", "a settlement that names itself commits");
  assert.equal(settled.settledCents, 60);
  assert.equal(ledger.snapshot({ jobId: "s-flow" }).committedCents, 60, "the committed cost draws on the job ceiling");

  const forgeLedger = createBudgetLedger();
  forgeLedger.openJob({ jobId: "forged", ceilingCents: 100 });
  const forge = createX402Harness({
    secret: "k1",
    mode: "LIVE",
    settler: () => ({ settlementId: "SETTLE-FAKE" }),
    budget: { ledger: forgeLedger, jobId: "forged" },
  });
  const forgedChallenge = forge.challengeFor({ resource: "/v1/verify", quote: OWNER_QUOTE(40) }).challenge;
  forge.sign(forgedChallenge);
  const rejected = forge.settle({ challenge: forgedChallenge, envelope: { signature: "0".repeat(64) } });
  assert.equal(rejected.state, "REJECTED", "a forged envelope is rejected before the settler runs");
  assert.equal(rejected.code, "BAD_ENVELOPE_SIGNATURE");
  assert.equal(forge.metrics().settled, 0, "a forged envelope books no settlement");
  assert.equal(forgeLedger.snapshot({ jobId: "forged" }).reservedCents, 0, "the reservation of a rejected envelope releases");
});

/* ============================================================== CG-INT/1 */

test("CG-INT/1: the self-check battery passes and its case count is pinned", () => {
  const r = jobFlowSelfCheck();
  assert.equal(r.ok, true, JSON.stringify(r.cases.filter(([, p]) => !p)));
  assert.equal(r.cases.length, 10);
});

test("CG-INT/1: the end-to-end job flow — open, lock, carve, deliver; UNKNOWN stays held", () => {
  const flow = createJobFlow({ jobId: "real-job", ceilingCents: 1000, holdAmountCents: 430 });
  assert.equal(flow.snapshot().heldCents, 430, "publish locks the money before work starts");
  const scope = flow.openScope({ scopeId: "researcher", shareCents: 300 });
  assert.ok(scope.ok && scope.availableCents === 300);
  const metered = flow.meter({ scopeId: "researcher", amountCents: 120, source: "METERED", reason: "model calls" });
  assert.ok(metered.ok, "the sub-agent's model calls spend its carved share");
  const greedy = flow.meter({ scopeId: "researcher", amountCents: 181, source: "METERED" });
  assert.equal(greedy.state, "REFUSED", "the share never becomes a hole into the parent's unallocated money");
  assert.equal(greedy.code, "EXCEEDS_SCOPE_SHARE");
  const spec = flow.buildSpec([
    { kind: "DIGEST_MATCH", args: { digest: "b7c1" } },
    { kind: "BUDGET_WITHIN_CEILING", args: { jobId: "real-job" } },
  ]);
  const accepted = flow.deliver({ spec: spec.spec, evidence: { artifactSha256: "b7c1" } });
  assert.equal(accepted.state, "ACCEPTED", "the deterministic delivery is accepted");
  assert.equal(flow.snapshot().releasedCents, 430, "acceptance releases the locked amount");

  const unknownFlow = createJobFlow({ jobId: "soft-job", ceilingCents: 500, holdAmountCents: 500 });
  const softSpec = unknownFlow.buildSpec([{ kind: "DIGEST_MATCH", args: { digest: "zz" } }, { kind: "HUMAN_JUDGMENT" }]);
  const verdict = unknownFlow.deliver({ spec: softSpec.spec, evidence: { artifactSha256: "zz" } });
  assert.equal(verdict.state, "UNKNOWN");
  const snap = unknownFlow.snapshot();
  assert.equal(snap.heldCents, 500, "UNKNOWN leaves the money locked, neither paid nor burned");
  assert.equal(snap.releasedCents + snap.refundedCents, 0);
});

test("CG-INT/1: the reviewer surfaces — waterfall, timeline, evidence bundle, deterministic replay", () => {
  const flow = createJobFlow({ jobId: "wf-job", ceilingCents: 900, holdAmountCents: 100 });
  flow.openScope({ scopeId: "a", shareCents: 400 });
  flow.openScope({ scopeId: "b", shareCents: 400 });
  flow.meter({ scopeId: "b", amountCents: 150, source: "METERED" });
  const waterfall = budgetWaterfall({ ledger: flow.ledger, jobId: "wf-job" });
  assert.ok(waterfall.ok);
  assert.equal(waterfall.rows.length, 3, "one row for the job, one per scope");
  assert.equal(waterfall.rows[0].level, "job");
  assert.equal(waterfall.rows[1].level, "scope");
  assert.equal(waterfall.rows[2].level, "scope");
  assert.equal(waterfall.rows[2].availableCents, 250, "each scope's remaining money is stated");
  const timeline = reservationTimeline({ ledger: flow.ledger, jobId: "wf-job" });
  assert.equal(timeline.reservations.length, 1, "the metered cost lands on the timeline");
  const bundle = acceptanceEvidenceBundle({
    spec: flow.buildSpec([{ kind: "ARTIFACT_PRESENT", args: { count: 1 } }]).spec,
    evidence: { artifactCount: 1 },
    ledger: flow.ledger,
    jobId: "wf-job",
  });
  assert.equal(bundle.ok, true, "the evidence bundle renders for the reviewer");
  assert.equal(bundle.state, "ACCEPTED", "the bundle states its own verdict");
  assert.ok(bundle.ledgerSnapshot.ok, "the bundle carries the ledger snapshot");
  const replay = deterministicReplay({ ledger: flow.ledger, jobId: "wf-job" });
  assert.ok(replay.ok && replay.deterministic, "replaying decisions uses no network and no keys");
});

/* ===================== Mutation laboratory: apply AND bite, by name */

test("mutation battery: the six named mutations each APPLY to the staged source and BITE on their discriminator — and the REAL modules set off none of them", async () => {
  const REAL = { budget: { createBudgetLedger }, acceptance: { buildAcceptanceSpec, evaluateAcceptance }, x402: { createX402Harness } };

  // Baseline: the shipped modules never violate their own detectors.
  for (const m of MUTATIONS) {
    const violations = await m.probe(REAL);
    assert.deepEqual(violations, [], `${m.name}: the REAL module must not set off its own detector`);
  }

  // Apply-and-bite, per name.
  for (const m of MUTATIONS) {
    const names = pkgsFor(m);
    const { root, hits } = stageTree({ names, mutate: m });
    try {
      assert.ok(hits > 0, `${m.name}: mutation must APPLY (needle found in ${m.pkg}/${m.file})`);
      const mutated = await loadMutated(root, names);
      const violations = await m.probe(mutated);
      assert.ok(violations.length > 0 && typeof violations[0] === "string", `${m.name}: mutation must BITE on its discriminator`);
    } finally {
      rmSync(dirname(root), { recursive: true, force: true });
    }
  }
});

/* Each mutation: name, packages to stage, file to mutate, exact needle, replacement.
   The probe returns a violations list; the battery asserts the needle exists,
   the mutated module exhibits the violation, and the REAL module does not. */
const MUTATIONS = [
  {
    name: "budget: refusing the exact fit (endpoint off by one)",
    pkg: "budget",
    file: "ledger.mjs",
    needle: "if (amountCents > available) {",
    replacement: "if (amountCents >= available) {",
    probe: async ({ budget }) => {
      const l = budget.createBudgetLedger();
      l.openJob({ jobId: "x", ceilingCents: 100 });
      const out = l.reserve({ jobId: "x", amountCents: 100 });
      return out.ok ? [] : ["EXACT_FIT_REFUSED"];
    },
  },
  {
    name: "budget: a second hold overwrites the first (escrow double-bind)",
    pkg: "budget",
    file: "ledger.mjs",
    needle: "if (j.heldCents > 0) {",
    replacement: "if (j.heldCents < 0) {",
    probe: async ({ budget }) => {
      const l = budget.createBudgetLedger();
      l.openJob({ jobId: "x", ceilingCents: 400 });
      l.hold({ jobId: "x", amountCents: 400 });
      const second = l.hold({ jobId: "x", amountCents: 200 });
      const snap = l.snapshot({ jobId: "x" });
      return !second.ok && snap.heldCents === 400 ? [] : ["SECOND_HOLD_MUTATED"];
    },
  },
  {
    name: "acceptance: the any-UNKNOWN aggregation is short-circuited to false (partial pass becomes ACCEPTED)",
    pkg: "acceptance",
    file: "index.mjs",
    needle: 'const anyUnknown = results.some((r) => r.verdict === "UNKNOWN");',
    replacement: "const anyUnknown = false;",
    probe: async ({ acceptance }) => {
      const spec = acceptance.buildAcceptanceSpec({
        jobId: "p",
        checks: [{ kind: "DIGEST_MATCH", args: { digest: "aa" } }, { kind: "REPLAY_MATCH" }],
      }).spec;
      const out = acceptance.evaluateAcceptance({ spec, evidence: { artifactSha256: "aa" } });
      return out.state === "UNKNOWN" && out.disposition === "HELD" ? [] : ["UNKNOWN_CONVERTED"];
    },
  },
  {
    name: "acceptance: the UNKNOWN disposition becomes an auto-refund (worker burned on an unanswered question)",
    pkg: "acceptance",
    file: "index.mjs",
    needle: '"REFUNDED" : "HELD";',
    replacement: '"REFUNDED" : "REFUNDED";',
    probe: async ({ acceptance, budget }) => {
      const l = budget.createBudgetLedger();
      l.openJob({ jobId: "p", ceilingCents: 250 });
      l.hold({ jobId: "p", amountCents: 250 });
      const spec = acceptance.buildAcceptanceSpec({ jobId: "p", checks: [{ kind: "REPLAY_MATCH" }] }).spec;
      const out = acceptance.evaluateAcceptance({ spec, evidence: {}, ledger: l });
      const snap = l.snapshot({ jobId: "p" });
      return out.disposition === "HELD" && snap.heldCents === 250 && snap.refundedCents === 0 ? [] : ["UNKNOWN_AUTO_REFUNDED"];
    },
  },
  {
    name: "x402: the refusal gate is bypassed — a signature exists for a cost the ledger never authorised",
    pkg: "x402",
    file: "index.mjs",
    needle: "if (!held.ok) {",
    replacement: "if (false) {",
    probe: async ({ x402, budget }) => {
      const l = budget.createBudgetLedger();
      l.openJob({ jobId: "x", ceilingCents: 100 });
      const h = x402.createX402Harness({ secret: "s", budget: { ledger: l, jobId: "x" } });
      const ch = h.challengeFor({ resource: "/r", quote: { amountCents: 500, lockedByOwner: true, provenance: "owner decision" } }).challenge;
      const out = h.sign(ch);
      const snap = l.snapshot({ jobId: "x" });
      return out.state === "REFUSED" && out.signature === null && snap.reservedCents === 0 ? [] : ["SIGNED_ON_REFUSED"];
    },
  },
  {
    name: "x402: the DRY_RUN settle commits the reservation (phantom revenue)",
    pkg: "x402",
    file: "index.mjs",
    needle: 'settleReservation(challengeId, "release");',
    replacement: 'settleReservation(challengeId, "commit");',
    probe: async ({ x402, budget }) => {
      const l = budget.createBudgetLedger();
      l.openJob({ jobId: "x", ceilingCents: 100 });
      const h = x402.createX402Harness({ secret: "s", budget: { ledger: l, jobId: "x" } });
      const ch = h.challengeFor({ resource: "/r", quote: { amountCents: 50, lockedByOwner: true, provenance: "owner decision" } }).challenge;
      h.sign(ch);
      h.settle({ challenge: ch });
      const snap = l.snapshot({ jobId: "x" });
      return snap.committedCents === 0 && h.metrics().settledCents === 0 ? [] : ["DRY_RUN_PHANTOM_COMMIT"];
    },
  },
];

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

function stageTree({ names, mutate = null }) {
  const root = join(mkdtempSync(join(tmpdir(), "stk-mut-")), "packages");
  for (const name of names) {
    cpSync(join(REPO, "packages", name), join(root, name), { recursive: true });
  }
  if (mutate) {
    const target = join(root, mutate.pkg, mutate.file);
    const src = readFileSync(target, "utf8");
    const hits = countOccurrences(src, mutate.needle);
    assert.ok(hits > 0, `mutation ${mutate.name}: needle no longer exists in the source (drift)`);
    writeFileSync(target, src.split(mutate.needle).join(mutate.replacement), "utf8");
    return { root, hits };
  }
  return { root, hits: 0 };
}

function pkgsFor(m) {
  if (m.pkg === "budget") return ["budget"];
  if (m.pkg === "acceptance") return ["acceptance", "budget"];
  return ["x402", "canonical", "budget"];
}

async function loadMutated(root, names) {
  const ns = {};
  for (const name of names) {
    const dir = join(root, name);
    const entry = ["index.mjs", "index.js", "ledger.mjs"].find((c) => existsSync(join(dir, c)));
    assert.ok(entry, `${name}: staged package has no entry module`);
    ns[name] = await import(pathToFileURL(join(dir, entry)).href);
  }
  return ns;
}
