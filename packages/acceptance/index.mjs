/**
 * index.mjs — CG-ACC/1, acceptance criteria and disposition.
 *
 * What this is: the layer that answers one question about a delivered piece of
 * work — "did this satisfy the deal?" — and the layer that decides what
 * happens to the money when the answer is not a clean yes.
 *
 * The problem it takes on, stated plainly: "done" is easy to write and hard
 * to verify. For deterministic work the check is mechanical (the digest
 * matches, the replay matches, no forbidden call was made, the budget held).
 * For non-deterministic work — a research answer, a design, a piece of prose —
 * there is no mechanical check, and pretending otherwise is how a payment
 * gets laundered into "delivered" without anyone having checked it.
 *
 * So this module does not solve the hard part, and does not pretend to. It
 * does three things a publisher-oracle system does not:
 *
 *   1. IT SEPARATES THE MACHINE-CHECKABLE FROM THE JUDGMENT. Every check in
 *      a spec declares which kind it is. A spec whose checks are all
 *      mechanical is a machine acceptance; a spec that leans on a publisher
 *      approval or a human judgement is a JUDGMENT basis, and the result
 *      records that fact instead of presenting it as a check.
 *
 *   2. IT NEVER CONVERGES PARTIAL CREDIT INTO SUCCESS. The aggregate rule is
 *      one line: any FAIL is REJECTED, every check PASS is ACCEPTED, and
 *      anything else is UNKNOWN. There is no path from "most checks passed"
 *      to ACCEPTED, and no path from UNKNOWN to ACCEPTED.
 *
 *   3. IT GIVES UNKNOWN A CONSEQUENCE THAT IS NOT A LOSS. When the verdict is
 *      UNKNOWN the money is neither paid out nor refunded: it STAYS LOCKED
 *      and stays recorded as locked. A publisher-oracle system either pays
 *      the publisher's judgement or leaves the worker unpaid with no record;
 *      an auto-refund system burns the worker's cost on a question it could
 *      not answer. Holding is the honest third answer, and it is visible.
 *
 * What this is NOT:
 *   - it is NOT a quality oracle. `HUMAN_JUDGMENT` is a check that can only
 *     ever answer UNKNOWN, by construction, so the module cannot launder a
 *     subjective question into a mechanical PASS.
 *   - it is NOT a payment. It produces a disposition; the money moves only
 *     when a ledger (CG-BUD/1) is handed in and accepts that disposition.
 *   - it is NOT a trustless proof of delivery. The evidence it reads is the
 *     evidence the caller supplies; an unproven claim of delivery is read as
 *     UNKNOWN, never as PASS.
 */

import { createBudgetLedger } from "../budget/ledger.mjs";

export const ACCEPTANCE_VERSION = "CG-ACC/1";

export const ACCEPTANCE_STATES = Object.freeze(["ACCEPTED", "REJECTED", "UNKNOWN"]);

export const CHECK_VERDICTS = Object.freeze(["PASS", "FAIL", "UNKNOWN"]);

export const DISPOSITIONS = Object.freeze(["RELEASED", "REFUNDED", "HELD"]);

/** The checks this module can actually evaluate. A kind outside this list is
 *  not silently ignored — it is an invalid spec, because an unknown check
 *  that quietly became a PASS would be the exact laundering this layer
 *  exists to prevent. */
export const CHECK_KINDS = Object.freeze([
  "DIGEST_MATCH",
  "ARTIFACT_PRESENT",
  "NO_FORBIDDEN_CALLS",
  "BUDGET_WITHIN_CEILING",
  "REPLAY_MATCH",
  "PUBLISHER_APPROVAL",
  "HUMAN_JUDGMENT",
]);

/** The kinds that are NOT machine-checkable. A spec containing any of them
 *  has a JUDGMENT basis, and says so in its result. */
export const JUDGMENT_KINDS = Object.freeze(["PUBLISHER_APPROVAL", "HUMAN_JUDGMENT"]);

export const ACCEPTANCE_HONESTY_RULE =
  "any FAIL is REJECTED, every check PASS is ACCEPTED, and anything else is UNKNOWN; a partial pass never becomes ACCEPTED, and an UNKNOWN verdict leaves the money HELD — locked, recorded, neither paid nor refunded.";

function checkId(index, kind) {
  return `chk-${index + 1}-${kind.toLowerCase().replace(/_/g, "-")}`;
}

/**
 * buildAcceptanceSpec — validate the spec before anything is measured against
 * it. An empty check list is refused: a spec with no checks would have
 * nothing to fail and would read as ACCEPTED.
 */
export function buildAcceptanceSpec({ jobId, checks, basis = null } = {}) {
  if (typeof jobId !== "string" || jobId.length === 0) {
    throw new TypeError("buildAcceptanceSpec: jobId (string) is required");
  }
  if (!Array.isArray(checks) || checks.length === 0) {
    return { ok: false, code: "NO_CHECKS", detail: "a spec with no checks has nothing to fail and must not read as ACCEPTED" };
  }
  const invalid = checks.filter((c) => !c || !CHECK_KINDS.includes(c.kind));
  if (invalid.length > 0) {
    return {
      ok: false,
      code: "UNKNOWN_CHECK_KIND",
      detail: `check kinds outside ${CHECK_KINDS.join(", ")} are refused, never ignored`,
      unknown: invalid.map((c) => (c && c.kind) || null),
    };
  }
  const ids = new Set();
  for (const c of checks) {
    if (c.id !== undefined && c.id !== null) {
      if (typeof c.id !== "string" || c.id.length === 0) {
        return { ok: false, code: "INVALID_CHECK_ID", detail: "a check id must be a non-empty string" };
      }
      if (ids.has(c.id)) {
        return { ok: false, code: "DUPLICATE_CHECK_ID", detail: `check id ${c.id} appears twice` };
      }
      ids.add(c.id);
    }
  }
  const declaredBasis = basis || (checks.some((c) => JUDGMENT_KINDS.includes(c.kind)) ? "JUDGMENT" : "MACHINE");
  if (!["MACHINE", "JUDGMENT"].includes(declaredBasis)) {
    return { ok: false, code: "INVALID_BASIS", detail: "basis must be MACHINE or JUDGMENT" };
  }
  const normalised = checks.map((c, i) => ({
    id: typeof c.id === "string" && c.id.length > 0 ? c.id : checkId(i, c.kind),
    kind: c.kind,
    args: c.args && typeof c.args === "object" ? c.args : {},
  }));
  return {
    ok: true,
    spec: {
      version: ACCEPTANCE_VERSION,
      jobId,
      basis: declaredBasis,
      checks: normalised,
    },
  };
}

function evaluateCheck(check, evidence, ledger) {
  const args = check.args || {};
  switch (check.kind) {
    case "DIGEST_MATCH": {
      const want = args.digest;
      const got = evidence && evidence.artifactSha256;
      if (typeof want !== "string" || want.length === 0) {
        return { verdict: "UNKNOWN", detail: "the check declares no digest to compare against" };
      }
      if (typeof got !== "string" || got.length === 0) {
        return { verdict: "UNKNOWN", detail: "no artifact digest was supplied — an unproven delivery is not a failed one" };
      }
      return want === got
        ? { verdict: "PASS", detail: "the delivered artifact digest equals the committed digest" }
        : { verdict: "FAIL", detail: "the delivered artifact digest does not equal the committed digest" };
    }
    case "ARTIFACT_PRESENT": {
      const want = args.count;
      const got = evidence && evidence.artifactCount;
      if (!Number.isInteger(want) || want < 0) {
        return { verdict: "UNKNOWN", detail: "the check declares no artifact count" };
      }
      if (!Number.isInteger(got) || got < 0) {
        return { verdict: "UNKNOWN", detail: "no artifact count was supplied" };
      }
      return got >= want
        ? { verdict: "PASS", detail: `${got} artifact(s) present, ${want} required` }
        : { verdict: "FAIL", detail: `${got} artifact(s) present, ${want} required` };
    }
    case "NO_FORBIDDEN_CALLS": {
      const forbidden = Array.isArray(args.forbidden) ? args.forbidden : null;
      const calls = evidence && evidence.calls;
      if (!forbidden) return { verdict: "UNKNOWN", detail: "the check declares no forbidden list" };
      if (!Array.isArray(calls)) return { verdict: "UNKNOWN", detail: "no call log was supplied" };
      const hit = calls.filter((c) => forbidden.includes(c));
      return hit.length === 0
        ? { verdict: "PASS", detail: "no forbidden call appears in the log" }
        : { verdict: "FAIL", detail: `forbidden call(s) in the log: ${hit.join(", ")}` };
    }
    case "BUDGET_WITHIN_CEILING": {
      if (!ledger) return { verdict: "UNKNOWN", detail: "no ledger was supplied, so the ceiling cannot be read" };
      const snap = ledger.snapshot({ jobId: args.jobId });
      if (!snap || snap.ok !== true) return { verdict: "UNKNOWN", detail: "the ledger holds no such job" };
      const over = snap.committedCents > snap.ceilingCents;
      return over
        ? { verdict: "FAIL", detail: `committed ${snap.committedCents} exceeds the ceiling ${snap.ceilingCents}` }
        : { verdict: "PASS", detail: `committed ${snap.committedCents} is within the ceiling ${snap.ceilingCents}` };
    }
    case "REPLAY_MATCH": {
      const got = evidence && evidence.replayState;
      if (got === "MATCH") return { verdict: "PASS", detail: "the replay of intent+receipt matched" };
      if (got === "MISMATCH") return { verdict: "FAIL", detail: "the replay contradicted the commitment" };
      return { verdict: "UNKNOWN", detail: "the replay produced no verdict" };
    }
    case "PUBLISHER_APPROVAL": {
      const got = evidence && evidence.publisherApproved;
      if (got === true) return { verdict: "PASS", detail: "the publisher attested acceptance" };
      if (got === false) return { verdict: "FAIL", detail: "the publisher attested rejection" };
      return { verdict: "UNKNOWN", detail: "the publisher attested nothing" };
    }
    case "HUMAN_JUDGMENT": {
      return {
        verdict: "UNKNOWN",
        detail: "work quality for non-deterministic work has no mechanical check here; this check can never PASS",
      };
    }
    default:
      return { verdict: "UNKNOWN", detail: `unhandled check kind ${check.kind}` };
  }
}

/**
 * evaluateAcceptance — the verdict and the disposition.
 *
 * @param {object}   opts
 * @param {object}   opts.spec      a spec from buildAcceptanceSpec
 * @param {object}   [opts.evidence] the delivery evidence the caller supplies
 * @param {object}   [opts.ledger]   a CG-BUD/1 ledger, for the budget check
 *                                   and for applying the disposition
 */
export function evaluateAcceptance({ spec, evidence = null, ledger = null } = {}) {
  if (!spec || !Array.isArray(spec.checks) || spec.checks.length === 0) {
    return {
      ok: false,
      state: "UNKNOWN",
      disposition: "HELD",
      code: "NO_SPEC",
      detail: "no spec was supplied, so nothing can be accepted",
      checks: [],
    };
  }
  const results = spec.checks.map((check) => {
    const outcome = evaluateCheck(check, evidence, ledger);
    return { id: check.id, kind: check.kind, verdict: outcome.verdict, detail: outcome.detail };
  });

  const anyFail = results.some((r) => r.verdict === "FAIL");
  const anyUnknown = results.some((r) => r.verdict === "UNKNOWN");
  const state = anyFail ? "REJECTED" : anyUnknown ? "UNKNOWN" : "ACCEPTED";
  const disposition = state === "ACCEPTED" ? "RELEASED" : state === "REJECTED" ? "REFUNDED" : "HELD";

  const basis = spec.basis || (spec.checks.some((c) => JUDGMENT_KINDS.includes(c.kind)) ? "JUDGMENT" : "MACHINE");

  let applied = null;
  if (ledger && spec.jobId) {
    const out = ledger.disposition({
      jobId: spec.jobId,
      to: disposition,
      reason: `acceptance verdict ${state}`,
    });
    applied = out.ok ? { ok: true, state: out.state, heldCents: out.heldCents } : { ok: false, code: out.code, detail: out.detail };
  }

  return {
    ok: true,
    state,
    disposition,
    dispositionApplied: applied,
    basis,
    jobId: spec.jobId,
    checks: results,
    counts: {
      pass: results.filter((r) => r.verdict === "PASS").length,
      fail: results.filter((r) => r.verdict === "FAIL").length,
      unknown: results.filter((r) => r.verdict === "UNKNOWN").length,
      total: results.length,
    },
    detail:
      state === "ACCEPTED"
        ? "every check passed"
        : state === "REJECTED"
          ? "at least one check failed; a partial pass never becomes ACCEPTED"
          : "at least one check is UNKNOWN; the amount stays HELD — locked, recorded, neither paid nor refunded",
  };
}

export function selfCheck() {
  const cases = [];

  const empty = buildAcceptanceSpec({ jobId: "j", checks: [] });
  cases.push(["a spec with no checks is refused", empty.ok === false && empty.code === "NO_CHECKS"]);

  const badKind = buildAcceptanceSpec({ jobId: "j", checks: [{ kind: "VIBES" }] });
  cases.push(["an unknown check kind is refused, never ignored", badKind.ok === false && badKind.code === "UNKNOWN_CHECK_KIND"]);

  const machine = buildAcceptanceSpec({
    jobId: "j1",
    checks: [
      { kind: "DIGEST_MATCH", args: { digest: "abc123" } },
      { kind: "ARTIFACT_PRESENT", args: { count: 1 } },
    ],
  });
  cases.push(["a machine spec is accepted as a spec", machine.ok && machine.spec.basis === "MACHINE"]);

  const good = evaluateAcceptance({
    spec: machine.spec,
    evidence: { artifactSha256: "abc123", artifactCount: 1 },
  });
  cases.push(["every check passing is ACCEPTED", good.state === "ACCEPTED" && good.disposition === "RELEASED"]);

  const tampered = evaluateAcceptance({
    spec: machine.spec,
    evidence: { artifactSha256: "zzz999", artifactCount: 1 },
  });
  cases.push(["one failing check is REJECTED", tampered.state === "REJECTED" && tampered.disposition === "REFUNDED"]);

  const partial = evaluateAcceptance({
    spec: machine.spec,
    evidence: { artifactSha256: "abc123" },
  });
  cases.push(["a missing artifact is UNKNOWN, not a partial pass", partial.state === "UNKNOWN" && partial.disposition === "HELD"]);

  const judgment = buildAcceptanceSpec({
    jobId: "j2",
    checks: [{ kind: "PUBLISHER_APPROVAL" }, { kind: "HUMAN_JUDGMENT" }],
  });
  cases.push(["a spec leaning on judgement declares a JUDGMENT basis", judgment.ok && judgment.spec.basis === "JUDGMENT"]);

  const approved = evaluateAcceptance({ spec: judgment.spec, evidence: { publisherApproved: true } });
  cases.push(["a publisher approval with a human check stays UNKNOWN", approved.state === "UNKNOWN" && approved.disposition === "HELD"]);

  const humanOnly = buildAcceptanceSpec({ jobId: "j3", checks: [{ kind: "HUMAN_JUDGMENT" }] });
  const human = evaluateAcceptance({ spec: humanOnly.spec, evidence: {} });
  cases.push(["work quality alone can never be ACCEPTED", human.state === "UNKNOWN" && human.checks[0].verdict === "UNKNOWN"]);

  const ledger = createLedgerForSelfCheck();
  const escrow = buildAcceptanceSpec({ jobId: "escrow-1", checks: [{ kind: "ARTIFACT_PRESENT", args: { count: 1 } }] });
  const held = evaluateAcceptance({ spec: escrow.spec, evidence: {}, ledger });
  cases.push(["an UNKNOWN verdict leaves the money HELD", held.state === "UNKNOWN" && held.disposition === "HELD"]);
  cases.push(["the held amount is still locked after the verdict", ledger.snapshot({ jobId: "escrow-1" }).heldCents === 400]);

  const paid = evaluateAcceptance({ spec: escrow.spec, evidence: { artifactCount: 1 }, ledger });
  cases.push(["an ACCEPTED verdict releases the held amount", paid.state === "ACCEPTED" && ledger.snapshot({ jobId: "escrow-1" }).releasedCents === 400]);

  const ok = cases.every(([, pass]) => pass);
  return { ok, cases };
}

function createLedgerForSelfCheck() {
  const ledger = createBudgetLedger();
  ledger.openJob({ jobId: "escrow-1", ceilingCents: 400 });
  ledger.hold({ jobId: "escrow-1", amountCents: 400 });
  return ledger;
}

export function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-check") || args.length === 0) {
    const result = selfCheck();
    console.log(`ACCEPTANCE — ${ACCEPTANCE_VERSION} (verdict + disposition, no quality oracle, no payment)`);
    for (const [label, pass] of result.cases) console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}`);
    console.log(`\nACCEPTANCE SELF-CHECK: ${result.ok ? "PASS" : "FAIL"}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  console.log("usage: node packages/acceptance/index.mjs --self-check");
  process.exitCode = 2;
}

if (process.argv[1] && process.argv[1].endsWith("index.mjs")) main();
