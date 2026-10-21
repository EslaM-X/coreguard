/**
 * ledger.mjs — CG-BUD/1, the job-scoped budget ledger.
 *
 * What this is: a per-JOB spend authority. A job owns a ceiling in cents, and
 * every cost that job incurs — an x402 settlement, a metered model call, a
 * sub-agent's share — is drawn against that one ceiling through this ledger.
 *
 * What it is for (the footgun it removes): when the payment key lives in the
 * agent's own settings, the agent and every sub-agent it spawns can spend the
 * whole wallet, and a wallet cap is per-wallet, not per-job. It cannot say
 * "this run gets $5, that research sub-agent gets $2 of that", and it cannot
 * stop two sub-agents paying at the same moment from both taking the last
 * dollar. This ledger answers those three questions and nothing else.
 *
 * The three properties this file is built around:
 *
 *   1. JOB-LEVEL, NOT WALLET-LEVEL. Authority is scoped to a job. A scope
 *      (a sub-agent) may only draw on a share that was carved out of its
 *      parent's remaining budget at allocation time. There is no path from a
 *      scope to the job's unallocated remainder, and no path to any other job.
 *
 *   2. ATOMIC. `reserve()` performs its balance check and its mutation with
 *      no await, no callback, and no I/O between them, so two callers can
 *      never interleave between "does it fit" and "take it". This is why
 *      every method here is synchronous: an async boundary in the middle of a
 *      check-then-act is exactly where a double-spend becomes possible.
 *
 *   3. REFUSE BEFORE SIGN. `reserve()` returns REFUSED and changes nothing
 *      when a cost does not fit. A caller that signs on REFUSED has signed
 *      something the ledger never authorised. `packages/x402` wires this to
 *      its signing step so a payment that does not fit is refused BEFORE a
 *      signature exists.
 *
 * What this is NOT:
 *   - it is NOT a wallet, a key store, or a signer. It never holds a key,
 *     never signs, never moves funds, and has no network call.
 *   - it is NOT a price source. It caps spending; it does not decide what
 *     anything costs. A cost is supplied by the caller.
 *   - it is NOT revenue. `committedCents` counts what this ledger authorised,
 *     which in a DRY-RUN environment is whatever a caller asked for; no money
 *     moved and no settlement happened.
 *   - it is NOT a trustless verifier of work quality. It bounds spend. What
 *     the work was worth is `packages/acceptance`'s question, and its honest
 *     answer for non-deterministic work is UNKNOWN, not a number.
 *
 * The escrow half — budget locked at publish, released only on a disposition
 * — is the same ledger's second view: `hold()` locks an amount, and
 * `disposition()` moves it to RELEASED, REFUNDED, or leaves it HELD. Leaving
 * it HELD is the honest outcome when the acceptance verdict is UNKNOWN: the
 * money is neither paid out nor burned, it is recorded as still locked.
 */

import { createHash } from "node:crypto";

export const BUDGET_VERSION = "CG-BUD/1";

export const BUDGET_JOB_STATES = Object.freeze(["OPEN", "HELD", "RELEASED", "REFUNDED"]);

export const RESERVATION_STATES = Object.freeze(["RESERVED", "COMMITTED", "RELEASED"]);

export const COST_SOURCES = Object.freeze(["SETTLEMENT", "METERED"]);

export const REFUSAL_CODES = Object.freeze([
  "NO_SUCH_JOB",
  "NO_SUCH_SCOPE",
  "SCOPE_CLOSED",
  "UNKNOWN_AMOUNT",
  "EXCEEDS_SCOPE_SHARE",
  "EXCEEDS_JOB_CEILING",
  "NO_SUCH_RESERVATION",
  "RESERVATION_CLOSED",
  "NOTHING_HELD",
  "INVALID_DISPOSITION",
]);

/** The rule, in one line, for surfaces that restate it. Every restatement
 *  must keep the "one ceiling" clause and the "no partial" clause: a second
 *  cost source that does not count against the same ceiling would recreate
 *  the wallet-cap gap this ledger exists to close. */
export const BUDGET_HONESTY_RULE =
  "every cost of a job — settlement or metered — draws on that job's one ceiling; a cost that does not fit is REFUSED and changes nothing; a sub-agent may only draw on a share carved out of its parent's remaining budget.";

function isPositiveInt(n) {
  return Number.isInteger(n) && n > 0;
}

function isNonNegativeInt(n) {
  return Number.isInteger(n) && n >= 0;
}

function scopeKey(jobId, scopeId) {
  return `${jobId}::${scopeId}`;
}

function reservationId(jobId, scopeId, seq) {
  return `res_${createHash("sha256").update(`${jobId}|${scopeId}|${seq}`).digest("hex").slice(0, 16)}`;
}

/* The extras are spread FIRST so no caller can clobber the refusal's own
   identity: an extra key named `state` once overwrote `state: "REFUSED"`
   with the job's state, and a refusal that reports a non-refusal state is
   exactly the kind of drift this module exists to prevent. */
function refusal(code, detail, extra = {}) {
  return { ...extra, ok: false, state: "REFUSED", code, detail };
}

export function createBudgetLedger({ currency = "USDC" } = {}) {
  const jobs = new Map();
  const scopes = new Map();
  const reservations = new Map();
  let seq = 0;

  function job(jobId) {
    return jobs.get(jobId) || null;
  }

  function requireJob(jobId) {
    const j = job(jobId);
    if (!j) return refusal("NO_SUCH_JOB", `no job was opened with id ${jobId}`);
    return null;
  }

  function scopeOf(jobId, scopeId) {
    return scopes.get(scopeKey(jobId, scopeId)) || null;
  }

  /**
   * openJob — the job-level authority. The ceiling is the whole point: a
   * wallet cap is per-wallet, this is per-job.
   */
  function openJob({ jobId, ceilingCents } = {}) {
    if (typeof jobId !== "string" || jobId.length === 0) {
      throw new TypeError("openJob: jobId (string) is required");
    }
    if (!isPositiveInt(ceilingCents)) {
      throw new TypeError("openJob: ceilingCents must be a positive integer — a job with no ceiling is not a budget");
    }
    if (jobs.has(jobId)) {
      throw new TypeError(`openJob: job ${jobId} already exists`);
    }
    const record = {
      jobId,
      currency,
      ceilingCents,
      state: "OPEN",
      heldCents: 0,
      releasedCents: 0,
      refundedCents: 0,
      committedCents: 0,
      reservedCents: 0,
      childSharesCents: 0,
      reservations: [],
    };
    jobs.set(jobId, record);
    return {
      ok: true,
      state: "OPEN",
      jobId,
      currency,
      ceilingCents,
      availableCents: ceilingCents,
    };
  }

  /**
   * openScope — carve a share out of a parent's REMAINING budget.
   *
   * The share is allocated, not merely capped: opening a scope debits the
   * parent's available amount, so two sibling scopes can never both reach the
   * same dollar, and a scope can never grow past what its parent still had.
   * `shareCents` may equal the parent's entire remainder (that is the
   * "this run gets $5, its research sub-agent gets $2 of that" case).
   */
  function openScope({ jobId, scopeId, parentScopeId = null, shareCents } = {}) {
    const bad = requireJob(jobId);
    if (bad) return bad;
    if (typeof scopeId !== "string" || scopeId.length === 0) {
      throw new TypeError("openScope: scopeId (string) is required");
    }
    if (!isPositiveInt(shareCents)) {
      throw new TypeError("openScope: shareCents must be a positive integer");
    }
    const key = scopeKey(jobId, scopeId);
    if (scopes.has(key)) {
      throw new TypeError(`openScope: scope ${scopeId} already exists in job ${jobId}`);
    }

    let parentAvailable;
    let parentLabel;
    if (parentScopeId === null) {
      const j = job(jobId);
      parentAvailable = j.ceilingCents - j.childSharesCents - j.reservedCents - j.committedCents;
      parentLabel = jobId;
    } else {
      const parent = scopeOf(jobId, parentScopeId);
      if (!parent) return refusal("NO_SUCH_SCOPE", `no scope ${parentScopeId} exists in job ${jobId}`);
      if (parent.state !== "OPEN") {
        return refusal("SCOPE_CLOSED", `scope ${parentScopeId} is ${parent.state} and cannot allocate`);
      }
      parentAvailable = parent.shareCents - parent.childSharesCents - parent.reservedCents - parent.committedCents;
      parentLabel = parentScopeId;
    }

    if (shareCents > parentAvailable) {
      return refusal("EXCEEDS_JOB_CEILING", `share ${shareCents} exceeds ${parentLabel}'s remaining ${parentAvailable}`, {
        requestedCents: shareCents,
        availableCents: parentAvailable,
        parent: parentLabel,
      });
    }

    if (parentScopeId === null) {
      job(jobId).childSharesCents += shareCents;
    } else {
      scopeOf(jobId, parentScopeId).childSharesCents += shareCents;
    }

    const scope = {
      jobId,
      scopeId,
      parentScopeId,
      shareCents,
      childSharesCents: 0,
      reservedCents: 0,
      committedCents: 0,
      state: "OPEN",
    };
    scopes.set(key, scope);
    return {
      ok: true,
      state: "OPEN",
      jobId,
      scopeId,
      parentScopeId,
      shareCents,
      availableCents: shareCents,
    };
  }

  function scopeAvailable(scope) {
    return scope.shareCents - scope.childSharesCents - scope.reservedCents - scope.committedCents;
  }

  function jobAvailable(j) {
    return j.ceilingCents - j.childSharesCents - j.reservedCents - j.committedCents;
  }

  /**
   * reserve — the atomic check-then-act. Synchronous on purpose: there is no
   * await between the balance check and the mutation, so no second caller can
   * observe a half-applied reservation. On REFUSED nothing is mutated.
   */
  function reserve({ jobId, scopeId = null, amountCents, source = "SETTLEMENT", reason = null } = {}) {
    const bad = requireJob(jobId);
    if (bad) return bad;
    const j = job(jobId);
    if (!COST_SOURCES.includes(source)) {
      throw new TypeError(`reserve: source must be one of ${COST_SOURCES.join(", ")}`);
    }
    if (!isPositiveInt(amountCents)) {
      return refusal("UNKNOWN_AMOUNT", "a cost with no positive integer amount is refused, never rounded, never assumed", {
        requestedCents: amountCents,
      });
    }

    let scope = null;
    if (scopeId !== null) {
      scope = scopeOf(jobId, scopeId);
      if (!scope) return refusal("NO_SUCH_SCOPE", `no scope ${scopeId} exists in job ${jobId}`);
      if (scope.state !== "OPEN") {
        return refusal("SCOPE_CLOSED", `scope ${scopeId} is ${scope.state}`, { scopeState: scope.state });
      }
    }

    const available = scope ? scopeAvailable(scope) : jobAvailable(j);
    if (amountCents > available) {
      return refusal(scope ? "EXCEEDS_SCOPE_SHARE" : "EXCEEDS_JOB_CEILING",
        `cost ${amountCents} does not fit in ${scope ? `scope ${scopeId}` : `job ${jobId}`} (available ${available})`,
        { requestedCents: amountCents, availableCents: available, scopeId });
    }

    seq += 1;
    const id = reservationId(jobId, scopeId || jobId, seq);
    const reservation = {
      reservationId: id,
      jobId,
      scopeId,
      amountCents,
      source,
      reason,
      state: "RESERVED",
    };
    reservations.set(id, reservation);
    j.reservations.push(id);
    j.reservedCents += amountCents;
    if (scope) {
      scope.reservedCents += amountCents;
    }
    return {
      ok: true,
      state: "RESERVED",
      reservationId: id,
      jobId,
      scopeId,
      amountCents,
      source,
      availableCents: scope ? scopeAvailable(scope) : jobAvailable(j),
    };
  }

  /** commit — the cost happened. Reserved becomes committed. */
  function commit({ jobId, reservationId: id } = {}) {
    const bad = requireJob(jobId);
    if (bad) return bad;
    const r = reservations.get(id);
    if (!r || r.jobId !== jobId) {
      return refusal("NO_SUCH_RESERVATION", `no reservation ${id} exists in job ${jobId}`);
    }
    if (r.state !== "RESERVED") {
      return refusal("RESERVATION_CLOSED", `reservation ${id} is ${r.state}`, { reservationState: r.state });
    }
    const j = job(jobId);
    j.reservedCents -= r.amountCents;
    j.committedCents += r.amountCents;
    const scope = r.scopeId === null ? null : scopeOf(jobId, r.scopeId);
    if (scope) {
      scope.reservedCents -= r.amountCents;
      scope.committedCents += r.amountCents;
    }
    r.state = "COMMITTED";
    return { ok: true, state: "COMMITTED", reservationId: id, amountCents: r.amountCents, committedCents: j.committedCents };
  }

  /** release — the cost did not happen. The reservation goes back. */
  function release({ jobId, reservationId: id } = {}) {
    const bad = requireJob(jobId);
    if (bad) return bad;
    const r = reservations.get(id);
    if (!r || r.jobId !== jobId) {
      return refusal("NO_SUCH_RESERVATION", `no reservation ${id} exists in job ${jobId}`);
    }
    if (r.state !== "RESERVED") {
      return refusal("RESERVATION_CLOSED", `reservation ${id} is ${r.state}`, { reservationState: r.state });
    }
    const j = job(jobId);
    j.reservedCents -= r.amountCents;
    const scope = r.scopeId === null ? null : scopeOf(jobId, r.scopeId);
    if (scope) scope.reservedCents -= r.amountCents;
    r.state = "RELEASED";
    return { ok: true, state: "RELEASED", reservationId: id, amountCents: r.amountCents, reservedCents: j.reservedCents };
  }

  /**
   * meter — a cost that is billed the moment it happens (a model call, an API
   * request). Reserve and commit in one synchronous step, because a metered
   * cost has no "signed but not yet spent" phase. It draws on the SAME
   * ceiling as a settlement, which is the point: a second cost source with
   * its own limit is the wallet-cap gap all over again.
   */
  function meter({ jobId, scopeId = null, amountCents, source = "METERED", reason = null } = {}) {
    const held = reserve({ jobId, scopeId, amountCents, source, reason });
    if (!held.ok) return held;
    const done = commit({ jobId, reservationId: held.reservationId });
    if (!done.ok) return done;
    return { ...done, source, availableCents: snapshot({ jobId }).availableCents };
  }

  /**
   * hold — lock an amount for a delivery. This is the escrow half: the budget
   * is locked when the task is published, not when somebody gets around to
   * paying.
   */
  function hold({ jobId, amountCents } = {}) {
    const bad = requireJob(jobId);
    if (bad) return bad;
    const j = job(jobId);
    if (!isPositiveInt(amountCents)) {
      return refusal("UNKNOWN_AMOUNT", "an amount with no positive integer value cannot be locked", { requestedCents: amountCents });
    }
    if (j.heldCents > 0) {
      return refusal("INVALID_DISPOSITION", `job ${jobId} already holds ${j.heldCents} and cannot hold again`, {
        heldCents: j.heldCents,
      });
    }
    if (amountCents > j.ceilingCents - j.committedCents - j.reservedCents) {
      return refusal("EXCEEDS_JOB_CEILING", `cannot lock ${amountCents} against a ceiling of ${j.ceilingCents}`, {
        requestedCents: amountCents,
        availableCents: j.ceilingCents - j.committedCents - j.reservedCents,
      });
    }
    j.heldCents = amountCents;
    j.state = "HELD";
    return { ok: true, state: "HELD", jobId, heldCents: j.heldCents, availableCents: j.ceilingCents - j.heldCents };
  }

  /**
   * disposition — the only way a held amount moves.
   *
   *   RELEASED  the delivery is accepted; the amount becomes payable.
   *   REFUNDED  the delivery is rejected; the amount returns.
   *   HELD      nothing decided; the amount STAYS LOCKED and stays recorded
   *             as locked. This is the honest disposition when the acceptance
   *             verdict is UNKNOWN — the money is neither paid out nor burned.
   */
  function disposition({ jobId, to, amountCents = null, reason = null, evidence = null } = {}) {
    const bad = requireJob(jobId);
    if (bad) return bad;
    const j = job(jobId);
    if (!["RELEASED", "REFUNDED", "HELD"].includes(to)) {
      return refusal("INVALID_DISPOSITION", `disposition must be RELEASED, REFUNDED or HELD`, { to });
    }
    if (j.heldCents === 0) {
      return refusal("NOTHING_HELD", `job ${jobId} holds nothing, so there is nothing to dispose of`, {
        state: j.state,
      });
    }
    const amount = amountCents === null ? j.heldCents : amountCents;
    if (!isPositiveInt(amount) || amount > j.heldCents) {
      return refusal("INVALID_DISPOSITION", `disposition amount ${amountCents} is not a positive amount within the held ${j.heldCents}`, {
        heldCents: j.heldCents,
      });
    }
    if (to === "HELD") {
      return {
        ok: true,
        state: "HELD",
        jobId,
        heldCents: j.heldCents,
        releasedCents: 0,
        refundedCents: 0,
        detail: "the amount stays locked: it is neither payable nor refunded, and that is recorded",
        reason,
      };
    }
    const remaining = j.heldCents - amount;
    j.heldCents = remaining;
    if (to === "RELEASED") {
      j.releasedCents += amount;
      if (remaining === 0) j.state = "RELEASED";
    } else {
      j.refundedCents += amount;
      if (remaining === 0) j.state = "REFUNDED";
    }
    return {
      ok: true,
      state: to,
      jobId,
      heldCents: j.heldCents,
      releasedCents: j.releasedCents,
      refundedCents: j.refundedCents,
      amountCents: amount,
      reason,
      evidence,
    };
  }

  function snapshot({ jobId } = {}) {
    const j = job(jobId);
    if (!j) return { ok: false, state: "REFUSED", code: "NO_SUCH_JOB" };
    const scopeList = [...scopes.values()]
      .filter((s) => s.jobId === jobId)
      .map((s) => ({
        scopeId: s.scopeId,
        parentScopeId: s.parentScopeId,
        shareCents: s.shareCents,
        reservedCents: s.reservedCents,
        committedCents: s.committedCents,
        availableCents: scopeAvailable(s),
        state: s.state,
      }));
    return {
      ok: true,
      jobId,
      currency: j.currency,
      state: j.state,
      ceilingCents: j.ceilingCents,
      heldCents: j.heldCents,
      reservedCents: j.reservedCents,
      committedCents: j.committedCents,
      releasedCents: j.releasedCents,
      refundedCents: j.refundedCents,
      availableCents: jobAvailable(j),
      scopes: scopeList,
    };
  }

  function listReservations({ jobId } = {}) {
    const j = job(jobId);
    if (!j) return [];
    return j.reservations.map((id) => ({ ...reservations.get(id) }));
  }

  return Object.freeze({
    version: BUDGET_VERSION,
    currency,
    openJob,
    openScope,
    reserve,
    commit,
    release,
    meter,
    hold,
    disposition,
    snapshot,
    listReservations,
  });
}

export function selfCheck() {
  const cases = [];
  const ledger = createBudgetLedger();

  const opened = ledger.openJob({ jobId: "job-1", ceilingCents: 500 });
  cases.push(["a job opens with a ceiling", opened.ok && opened.availableCents === 500]);

  const research = ledger.openScope({ jobId: "job-1", scopeId: "research", shareCents: 200 });
  cases.push(["a sub-agent share is carved out of the job", research.ok && research.availableCents === 200]);
  cases.push(["the job's remainder drops by the allocated share", ledger.snapshot({ jobId: "job-1" }).availableCents === 300]);

  const over = ledger.openScope({ jobId: "job-1", scopeId: "greedy", shareCents: 400 });
  cases.push(["a share larger than the parent's remainder is REFUSED", over.state === "REFUSED" && over.code === "EXCEEDS_JOB_CEILING"]);
  cases.push(["a refused allocation changes nothing", ledger.snapshot({ jobId: "job-1" }).scopes.length === 1]);

  const first = ledger.reserve({ jobId: "job-1", scopeId: "research", amountCents: 120, source: "SETTLEMENT" });
  cases.push(["a cost that fits is RESERVED", first.ok && first.state === "RESERVED"]);
  const second = ledger.reserve({ jobId: "job-1", scopeId: "research", amountCents: 120, source: "SETTLEMENT" });
  cases.push(["a second cost that does not fit is REFUSED and nothing is taken", second.state === "REFUSED" && second.code === "EXCEEDS_SCOPE_SHARE"]);
  cases.push(["the refused reservation left the balance intact", ledger.snapshot({ jobId: "job-1" }).scopes[0].availableCents === 80]);

  const metered = ledger.meter({ jobId: "job-1", scopeId: "research", amountCents: 30, source: "METERED" });
  cases.push(["a metered cost draws on the SAME ceiling", metered.ok && ledger.snapshot({ jobId: "job-1" }).scopes[0].committedCents === 30]);
  cases.push(["the metered cost ate into the same share", ledger.snapshot({ jobId: "job-1" }).scopes[0].availableCents === 50]);

  const unknown = ledger.reserve({ jobId: "job-1", scopeId: "research", amountCents: 0, source: "SETTLEMENT" });
  cases.push(["a zero or unknown cost is REFUSED, never rounded", unknown.state === "REFUSED" && unknown.code === "UNKNOWN_AMOUNT"]);

  const committed = ledger.commit({ jobId: "job-1", reservationId: first.reservationId });
  cases.push(["a reservation commits", committed.ok && committed.state === "COMMITTED"]);
  const double = ledger.commit({ jobId: "job-1", reservationId: first.reservationId });
  cases.push(["a committed reservation cannot commit twice", double.state === "REFUSED" && double.code === "RESERVATION_CLOSED"]);

  const other = ledger.openJob({ jobId: "job-2", ceilingCents: 100 });
  cases.push(["a second job opens independently", other.ok && ledger.snapshot({ jobId: "job-2" }).availableCents === 100]);
  const crossJob = ledger.reserve({ jobId: "job-2", scopeId: "research", amountCents: 10, source: "SETTLEMENT" });
  cases.push(["a scope of one job is invisible to another job", crossJob.state === "REFUSED" && crossJob.code === "NO_SUCH_SCOPE"]);

  const escrow = ledger.openJob({ jobId: "job-3", ceilingCents: 400 });
  cases.push(["an escrow job opens", escrow.ok]);
  const emptyJob = ledger.openJob({ jobId: "job-4", ceilingCents: 100 });
  cases.push(["a second escrow job opens", emptyJob.ok]);
  const nothing = ledger.disposition({ jobId: "job-4", to: "RELEASED" });
  cases.push(["nothing held means nothing to dispose of", nothing.state === "REFUSED" && nothing.code === "NOTHING_HELD"]);
  const held = ledger.hold({ jobId: "job-3", amountCents: 400 });
  cases.push(["a published budget is locked", held.ok && held.state === "HELD" && held.heldCents === 400]);
  const stayHeld = ledger.disposition({ jobId: "job-3", to: "HELD", reason: "acceptance verdict is UNKNOWN" });
  cases.push(["an undecided delivery leaves the amount LOCKED", stayHeld.ok && stayHeld.heldCents === 400]);
  cases.push(["a locked amount is still locked after being left alone", ledger.snapshot({ jobId: "job-3" }).heldCents === 400]);
  const released = ledger.disposition({ jobId: "job-3", to: "RELEASED", reason: "acceptance ACCEPTED" });
  cases.push(["an accepted delivery releases the locked amount", released.ok && released.releasedCents === 400]);
  cases.push(["nothing is held after the release", ledger.snapshot({ jobId: "job-3" }).heldCents === 0]);
  const refunded = ledger.openJob({ jobId: "job-5", ceilingCents: 100 });
  ledger.hold({ jobId: "job-5", amountCents: 100 });
  const back = ledger.disposition({ jobId: "job-5", to: "REFUNDED", reason: "acceptance REJECTED" });
  cases.push(["a rejected delivery refunds the locked amount", back.ok && back.refundedCents === 100]);

  const ok = cases.every(([, pass]) => pass);
  return { ok, cases };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-check") || args.length === 0) {
    const result = selfCheck();
    console.log(`BUDGET LEDGER — ${BUDGET_VERSION} (per-job spend authority, no key, no signer, no funds movement)`);
    for (const [label, pass] of result.cases) console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}`);
    console.log(`\nBUDGET SELF-CHECK: ${result.ok ? "PASS" : "FAIL"}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (args.includes("--status")) {
    console.log(`BUDGET ${BUDGET_VERSION} — per-job ceiling · one ceiling for settlement and metered costs · no key, no signer, no funds movement`);
    return;
  }
  console.log("usage: node packages/budget/ledger.mjs --self-check | --status");
  process.exitCode = 2;
}

if (process.argv[1] && process.argv[1].endsWith("ledger.mjs")) main();
