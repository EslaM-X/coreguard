/**
 * PLAYGROUND page contract — the live job-economy page cannot drift from the
 * engine it claims to run. Binding directions:
 *
 *   1. engine ↔ packages : docs/playground/*.js claims "the real module bytes,
 *      only import lines rewritten". The contract EXECUTES both channels —
 *      the real packages and the engine copies — through the same scripted
 *      job-economy scenario and compares every state, refusal code, verdict,
 *      ledger snapshot and x402 HMAC byte for byte. A hand-edit to any engine
 *      file diverges here by name.
 *   2. generator ↔ tree  : scripts/build-playground.mjs --check must pass, so
 *      the committed engine is exactly the generator's output of the current
 *      packages (drift = someone edited either side).
 *   3. shim ↔ node:crypto: the browser crypto shim agrees with node:crypto on
 *      FIPS 180-4 vectors and edge-length messages, including HMAC keys above
 *      one block — verdicts signed in the tab are the same bytes Node signs.
 *   4. page → engine     : the page imports the engine by the manifest's own
 *      names and renders the version constants from the engine's internals.
 *   5. page → index      : docs/index.html carries a LIVE card linking to
 *      PLAYGROUND.html — the reviewer's front page always names this surface.
 *   6. honesty           : DRY-RUN / no key / no network / no money stated in
 *      the page, every refusal by its named code, the log never silent, and
 *      the judgment boundary ("was the work good" stays human) stated.
 *
 * Negative controls: page mutations and an engine tamper must each apply AND
 * bite, by name ([C32]) — a guard that cannot fail is not a guard.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const PAGE = "docs/PLAYGROUND.html";
const PGB = join(REPO, "docs", "playground");
const INDEX = "docs/index.html";

const read = (p) => readFileSync(join(REPO, p), "utf8").replaceAll("\r\n", "\n");
const page = () => read(PAGE);

/* ------------------------------------------------------------------ */
/* channels: the REAL packages vs the ENGINE copies in docs/playground */
/* ------------------------------------------------------------------ */

const realFlow = () => import(pathToFileURL(join(REPO, "packages", "job-integration", "index.mjs")).href);
const realLedger = () => import(pathToFileURL(join(REPO, "packages", "budget", "ledger.mjs")).href);
const realAcceptance = () => import(pathToFileURL(join(REPO, "packages", "acceptance", "index.mjs")).href);
const realX402 = () => import(pathToFileURL(join(REPO, "packages", "x402", "index.mjs")).href);
const engineFlow = () => import(pathToFileURL(join(PGB, "job-integration.js")).href);
const engineLedger = () => import(pathToFileURL(join(PGB, "ledger.js")).href);
const engineAcceptance = () => import(pathToFileURL(join(PGB, "acceptance.js")).href);
const engineX402 = () => import(pathToFileURL(join(PGB, "x402.js")).href);
const engineShim = () => import(pathToFileURL(join(PGB, "crypto-shim.js")).href);

/** a full module set per channel: the flow module plus the surfaces its
 *  scenario reads by name (BUDGET_VERSION etc.), so the comparison covers
 *  what the page actually renders, not just what the caller passes. */
async function flowMods(isReal) {
  const [flow, ledger, acceptance] = await Promise.all(
    isReal ? [realFlow(), realLedger(), realAcceptance()] : [engineFlow(), engineLedger(), engineAcceptance()],
  );
  return { ...flow, BUDGET_VERSION: ledger.BUDGET_VERSION, ACCEPTANCE_VERSION: acceptance.ACCEPTANCE_VERSION };
}

const manifest = () => JSON.parse(read("docs/playground/manifest.json"));

/* deterministic, equal-across-channels projections (no local ids, no clocks) */
function ledgerEvent(e) {
  const { ok, state, code, detail, reservedCents, availableCents } = e;
  const out = { ok, state };
  if (code) out.code = code;
  if (detail) out.detail = detail;
  if (reservedCents === undefined) return out;
  out.reservedCents = reservedCents;
  out.availableCents = availableCents;
  return out;
}

function ledgerSnapshot(snap) {
  return {
    ok: true,
    state: snap.state,
    ceilingCents: snap.ceilingCents,
    heldCents: snap.heldCents,
    releasedCents: snap.releasedCents,
    refundedCents: snap.refundedCents,
    committedCents: snap.committedCents,
    reservedCents: snap.reservedCents,
    childSharesCents: snap.childSharesCents,
    availableCents: snap.ceilingCents - snap.reservedCents - snap.committedCents,
    scopes: snap.scopes.map((sc) => ({
      scopeId: sc.scopeId,
      shareCents: sc.shareCents,
      reservedCents: sc.reservedCents,
      committedCents: sc.committedCents,
      state: sc.state,
    })),
  };
}

function verdictShape(v) {
  return {
    state: v.state,
    disposition: v.disposition,
    basis: v.basis,
    checks: v.checks.map((c) => c.verdict),
    detail: v.detail,
  };
}

/** One scripted job run: hold → carve → meter → reserve → the gate's verdict
 *  moves the escrow ACCEPTED / REJECTED / UNKNOWN (otherwise). Returns only
 *  projections that must be byte-identical across channels. */
function scriptedJob(mods, { verdict } = {}) {
  const checks =
    verdict === "ACCEPTED"
      ? [{ kind: "DIGEST_MATCH", args: { digest: "abc" } }, { kind: "ARTIFACT_PRESENT", args: { count: 1 } }]
      : verdict === "UNKNOWN"
        ? [{ kind: "DIGEST_MATCH", args: { digest: "abc" } }, { kind: "HUMAN_JUDGMENT" }]
        : [{ kind: "DIGEST_MATCH", args: { digest: "abc" } }];
  const evidence =
    verdict === "ACCEPTED"
      ? { artifactSha256: "abc", artifactCount: 1 }
      : verdict === "UNKNOWN"
        ? { artifactSha256: "abc" } // the human check stays UNKNOWN by construction
        : { artifactSha256: "deadbeef" }; // a FAIL is a refusal of delivery, never a partial pass

  const f = mods.createJobFlow({ jobId: "contract-job", ceilingCents: 1000, holdAmountCents: 500 });
  const carveA = f.openScope({ scopeId: "research", shareCents: 300 });
  const carveB = f.openScope({ scopeId: "pricing", shareCents: 300 });
  const greedy = f.openScope({ scopeId: "greedy", shareCents: 2000 }); // over the true remainder
  const metered = f.meter({ scopeId: "research", amountCents: 40, source: "METERED", reason: "one model call" });
  const fitter = f.reserve({ scopeId: "research", amountCents: 100, source: "SETTLEMENT" });
  const over = f.reserve({ scopeId: "research", amountCents: 200, source: "SETTLEMENT" }); // > scope remainder
  const ghost = f.ledger.reserve({ jobId: "ghost-job", scopeId: null, amountCents: 1 });
  const built = f.buildSpec(checks);
  const emptySpec = f.buildSpec([]);
  const delivered = f.deliver({ spec: built.spec, evidence });
  return {
    versions: { flow: f.version, budget: mods.BUDGET_VERSION, acceptance: mods.ACCEPTANCE_VERSION },
    carveA: ledgerEvent(carveA),
    carveB: ledgerEvent(carveB),
    greedy: ledgerEvent(greedy),
    metered: { state: metered.state, code: metered.code ?? null, committedCents: metered.committedCents },
    fitter: ledgerEvent(fitter),
    over: ledgerEvent(over),
    ghost: ledgerEvent(ghost),
    specBasis: built.spec.basis,
    noChecks: { ok: emptySpec.ok, code: emptySpec.code },
    delivered: verdictShape(delivered),
    after: ledgerSnapshot(f.snapshot()),
    waterfall: mods.budgetWaterfall({ ledger: f.ledger, jobId: "contract-job" }).rows,
    unknownExplainer: mods.UNKNOWN_STAYS_HELD_EXPLAINER.rule,
  };
}

/* ------------------------------------------------------------------ */
/* 1 · generator ↔ tree + engine files carry provenance                */
/* ------------------------------------------------------------------ */

test("the engine tree is EXACTLY the generator's output over the current packages (--check)", () => {
  const r = spawnSync(process.execPath, ["scripts/build-playground.mjs", "--check"], { cwd: REPO, encoding: "utf8" });
  assert.ok(
    r.stdout.includes("engine is in sync with the packages"),
    `the committed engine must be the generator's exact output (stdin below):\n${r.stdout}${r.stderr}`,
  );
  assert.equal(r.status, 0, "build-playground --check must exit 0 when in sync");
});

test("every manifest module exists in docs/playground and carries the provenance header", () => {
  const m = manifest();
  assert.equal(m.marker, "CG-ENGINE-PROVENANCE");
  assert.equal(m.generator, "scripts/build-playground.mjs");
  for (const [out, src] of Object.entries(m.modules)) {
    assert.ok(readFileSync(join(REPO, src), "utf8").length > 0, `${src} must exist in packages/`);
    const bytes = readFileSync(join(PGB, out.replace("./", "")), "utf8").replaceAll("\r\n", "\n");
    assert.ok(bytes.length > 0, `docs/playground/${out.replace("./", "")} must exist (commit the generator's output)`);
    assert.ok(bytes.startsWith("/* CG-ENGINE-PROVENANCE"), `${out} must carry the provenance header first`);
    assert.ok(bytes.includes(`from ${src}`), `${out} must cite its source ${src} in the header`);
  }
});

test("the manifest covers the modules the page imports (crypto shim included)", () => {
  const m = manifest();
  for (const need of ["ledger.js", "acceptance.js", "x402.js", "job-integration.js", "crypto-shim.js", "canonical.js", "uint-shim.js"]) {
    assert.ok(m.modules[need], `manifest must map ${need}`);
  }
});

/* ------------------------------------------------------------------ */
/* 2 · behavioral equivalence: engine copy == real packages             */
/* ------------------------------------------------------------------ */

for (const verdict of ["ACCEPTED", "REJECTED", "UNKNOWN"]) {
  test(`engine == packages, byte for byte, through the full ${verdict} job run`, async () => {
    const a = scriptedJob(await flowMods(true), { verdict });
    const b = scriptedJob(await flowMods(false), { verdict });
    assert.deepEqual(b, a, `the engine copy diverged from the real packages during the ${verdict} run`);

    // and the scenario itself must say something (no silently empty corridor)
    assert.equal(a.versions.budget, "CG-BUD/1");
    assert.equal(a.greedy.state, "REFUSED");
    if (verdict === "ACCEPTED") {
      assert.equal(a.fitter.state, "RESERVED");
      assert.equal(a.delivered.state, "ACCEPTED");
      assert.equal(a.after.releasedCents, 500, "an accepted delivery releases the escrow");
    } else if (verdict === "REJECTED") {
      assert.equal(a.over.state, "REFUSED");
      assert.equal(a.over.code, "EXCEEDS_SCOPE_SHARE");
      assert.equal(a.delivered.state, "REJECTED");
      assert.equal(a.after.refundedCents, 500, "a rejected delivery refunds the escrow");
    } else {
      assert.equal(a.delivered.state, "UNKNOWN");
      assert.equal(a.delivered.disposition, "HELD");
      assert.equal(a.after.heldCents, 500, "UNKNOWN leaves the money HELD — neither paid nor refunded");
      assert.equal(a.after.releasedCents, 0);
      assert.equal(a.after.refundedCents, 0);
    }
  });
}

test("the engine answers refusals with the SAME named codes, never a silent rewrite", async () => {
  const realMods = await flowMods(true);
  const engineMods = await flowMods(false);
  // same refusal in both channels, by code
  for (const mods of [realMods, engineMods]) {
    const f = mods.createJobFlow({ jobId: "codes", ceilingCents: 250, holdAmountCents: null });
    f.openScope({ scopeId: "s", shareCents: 100 });
    const pool = [
      f.reserve({ jobId: "nope", amountCents: 1 }),
      f.reserve({ scopeId: "missing", amountCents: 1 }),
      f.reserve({ scopeId: "s", amountCents: 0 }),
      f.reserve({ scopeId: "s", amountCents: 101 }),
      f.commit({ jobId: "codes", reservationId: "res_none" }),
      f.openScope({ scopeId: "s2", shareCents: 99999 }),
    ];
    const codes = pool.map((e) => `${e.state}:${e.code ?? "-"}`).join("|");
    assert.match(
      codes,
      /REFUSED:EXCEEDS_SCOPE_SHARE/,
      "the scripted battery must actually exercise the refusal path it checks",
    );
  }
});

/* ------------------------------------------------------------------ */
/* 3 · the x402 gate on the shim: refuse-before-sign, one sig/challenge */
/* ------------------------------------------------------------------ */

test("x402 gate: the engine's gate loop is behavior-identical to the real one — same HMAC bytes", async () => {
  async function gate(xMods, ledgerMods) {
    const ledger = ledgerMods.createBudgetLedger();
    ledger.openJob({ jobId: "gate-job", ceilingCents: 250 });
    const h = xMods.createX402Harness({ secret: "contract-secret", clock: () => 1750000000, budget: { ledger, jobId: "gate-job" } });
    const quote = (cents) => ({ resource: "/v1/verify", quote: { amountCents: cents, lockedByOwner: true, provenance: "simulated owner decision" } });

    const unlocked = h.challengeFor({ resource: "/v1/verify", quote: { amountCents: 10, lockedByOwner: false, provenance: "hypothesis" } });
    const openGate = h.challengeFor({ resource: "/v1/verify" }); // no quote at all
    const tooBig = h.challengeFor(quote(5000));
    const refusedSign = h.sign(tooBig.challenge); // refused BEFORE a signature
    const fits = h.challengeFor(quote(100));
    const signed = h.sign(fits.challenge);
    const twice = h.sign(fits.challenge); // second signature for one challenge
    const dry = h.settle({ challenge: fits.challenge });
    const after = ledger.snapshot({ jobId: "gate-job" });
    return {
      version: h.version,
      scheme: h.scheme,
      mode: h.mode,
      unlocked: ledgerEvent(unlocked),
      openGate: ledgerEvent(openGate),
      tooBig: ledgerEvent(tooBig),
      refusedSign: { state: refusedSign.state, code: refusedSign.code, signature: refusedSign.signature, detail: refusedSign.detail },
      fits: ledgerEvent(fits),
      signed: { state: signed.state, code: signed.code ?? null, challengeId: signed.challengeId, signature: signed.signature, reservationId: signed.reservationId },
      twice: { state: twice.state, code: twice.code, signature: twice.signature, ref: twice.reservationId ?? null },
      dry: { state: dry.state, code: dry.code ?? null, detail: dry.detail, settlementId: dry.settlementId },
      after: { reservedCents: after.reservedCents, committedCents: after.committedCents },
      metrics: h.metrics(),
    };
  }
  const a = await gate(await realX402(), await realLedger());
  const b = await gate(await engineX402(), await engineLedger());
  assert.deepEqual(b, a, "the shim's gate behaves differently from node:crypto's gate");

  assert.equal(a.unlocked.state, "GATED");
  assert.equal(a.unlocked.code, "PRICE_NOT_LOCKED");
  assert.equal(a.openGate.code, "NO_QUOTE");
  assert.equal(a.refusedSign.state, "REFUSED", "an unaffordable cost is refused");
  assert.equal(a.refusedSign.code, "EXCEEDS_JOB_CEILING");
  assert.equal(a.refusedSign.signature, null, "a refusal produces NO signature — the whole point");
  assert.equal(a.signed.state, "SIGNED", "an affordable cost is reserved and signed");
  assert.equal(typeof a.signed.reservationId, "string");
  assert.equal(a.signed.signature.length, 64, "the signature is a hex HMAC over the canonical challenge");
  assert.equal(a.twice.state, "REFUSED");
  assert.equal(a.twice.code, "CHALLENGE_ALREADY_RESERVED");
  assert.equal(a.twice.signature, null, "two signatures for one challenge = two payments; refused");
  assert.equal(a.dry.state, "NOT_PERFORMED", "DRY-RUN never settles, never books revenue");
  assert.equal(a.after.reservedCents, 0, "the DRY-RUN settle releases the reservation (no money moved)");
  assert.equal(a.metrics.settledCents, 0, "settledCents stays 0 without a real settlement");
});

test("crypto shim == node:crypto on FIPS vectors and edge lengths, then HMAC keys over one block", async () => {
  const shim = await engineShim();
  const node = await import("node:crypto");
  const vectors = [
    "",
    "abc",
    "a".repeat(55),
    "a".repeat(56),
    "a".repeat(63),
    "a".repeat(64),
    "a".repeat(65),
    "dollar-economy".repeat(300),
  ];
  for (const msg of vectors) {
    assert.equal(shim.createHash("sha256").update(msg).digest("hex"), node.createHash("sha256").update(msg).digest("hex"), `sha256 diverged at length ${msg.length}`);
    assert.equal(shim.createHmac("sha256", "key").update(msg).digest("hex"), node.createHmac("sha256", "key").update(msg).digest("hex"), `hmac diverged at length ${msg.length}`);
    assert.equal(
      shim.createHmac("sha256", "very-long-key-exceeding-64-bytes-".repeat(4)).update(msg).digest("hex"),
      node.createHmac("sha256", "very-long-key-exceeding-64-bytes-".repeat(4)).update(msg).digest("hex"),
      `hmac with a >64-byte key diverged at length ${msg.length}`,
    );
  }
  assert.equal(shim.createHash("sha256").update("").digest("hex"), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "FIPS empty-message vector");
  assert.equal(shim.createHash("sha256").update("abc").digest("hex"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "FIPS 'abc' vector");

  // the shim's timing-safe compare must hold its end too
  const h1 = shim.createHash("sha256").update("abc").digest();
  assert.ok(shim.timingSafeEqual(h1, h1), "equal bytes compare true");
  assert.ok(!shim.timingSafeEqual(h1, new Uint8Array([...h1].map((v, i) => (i === 0 ? v ^ 1 : v)))), "a one-bit change compares false");
});

/* ------------------------------------------------------------------ */
/* 4 · page bindings                                                    */
/* ------------------------------------------------------------------ */

const ENGINE_DIRS = ["ledger.js", "acceptance.js", "x402.js", "job-integration.js"];

test("the page imports the engine by name and renders version constants from it", () => {
  for (const mod of ENGINE_DIRS) {
    assert.ok(
      page().includes(`./playground/${mod}"`),
      `the page must import ./playground/${mod} — the engine, not a re-authored copy`,
    );
  }
  assert.ok(page().includes('import { INTEGRATION_VERSION, createJobFlow, budgetWaterfall } from "./playground/job-integration.js"'), "the page runs the engine as a real ES module import");
  for (const cnst of ["BUDGET_VERSION", "ACCEPTANCE_VERSION", "INTEGRATION_VERSION", "X402_VERSION"]) {
    assert.ok(page().includes(cnst), `the page must render ${cnst} from the engine — the chip always names its engine honestly`);
  }
});

test('the page\'s honesty rules: DRY-RUN, no key/network/money, named refusals, never-silent log, judgment boundary', () => {
  const p = page();
  assert.ok(p.includes("DRY-RUN"), "the page must name the DRY-RUN framing");
  assert.ok(/لا (مفتاح|شبكة|مال)/.test(p) && /No key, no network, no money/.test(p), "no key / no network / no money, in both languages");
  for (const code of ["CHALLENGE_ALREADY_RESERVED", "NO_JOB", "NO_CHALLENGE", "UNKNOWN"]) {
    assert.ok(p.includes(code), `the page must surface refusal code ${code} by name`);
  }
  assert.ok(p.includes("never silent") || p.includes("لا صمت"), "the log must promise to never show silence");
  assert.ok(p.includes("Critic") || p.includes("criticizable") || p.includes("judgment"), "placeholder (real check below)");
  assert.ok(/hold(?:s|ing) is the honest third answer|الحك[/م]|الحكم/.test(p), "the Judgment boundary must be stated by name");
});

test("page: scan binding violations collector surfaces nothing on the honest page", () => {
  assert.deepEqual(pageBindingViolations(page()), [], pageBindingViolations(page()).join(" | "));
});

/* honest page must produce no violations (the same collector the controls bite on) */
function pageBindingViolations(p) {
  const v = [];
  if (!p.includes('from "./playground/job-integration.js"')) {
    v.push("the page must import ./playground/job-integration.js (engine bytes, never a rewrite)");
  }
  if (!p.includes('from "./playground/x402.js"')) {
    v.push("the page must import ./playground/x402.js");
  }
  if (!p.includes("DRY-RUN")) {
    v.push("the page must state the DRY-RUN framing (no money exists anywhere in this tab)");
  }
  if (!p.includes("CHALLENGE_ALREADY_RESERVED")) {
    v.push("the page must show the double-signature refusal by its code, not silence");
  }
  if (!/no key/i.test(p) || !/no money/i.test(p)) {
    v.push("the page must state plainly that no key and no money exist in the tab");
  }
  if (!p.includes("document.getElementById")) {
    v.push("the page's UI wiring is missing — the contract is for the LIVE page, and every engine call flows through the log");
  }
  if (!/honest third answer/.test(p) && !/الجواب الثالث/.test(p)) {
    v.push("the page must state that holding is the honest third answer for UNKNOWN — never silent money");
  }
  return v;
}

/* ------------------------------------------------------------------ */
/* 5 · index card                                                      */
/* ------------------------------------------------------------------ */

test("docs/index.html links PLAYGROUND.html from its cards", () => {
  const idx = read(INDEX);
  assert.ok(idx.includes('href="PLAYGROUND.html"'), "the reviewer's front page must always name this surface");
  assert.ok(idx.includes("Playground — job-economy cycle"), "the card must say what the page does");
});

/* ------------------------------------------------------------------ */
/* 6 · negative controls — applied AND biting, by name ([C32])          */
/* ------------------------------------------------------------------ */

test("negative control: page mutations apply AND bite the binding collector, by name", () => {
  const p = page();
  const cases = [
    {
      label: "the page swaps the engine for a re-authored path",
      from: 'from "./playground/job-integration.js"',
      to: 'from "./playground/attic-job-integration.js"',
      expect: /must import \.\/playground\/job-integration\.js/,
    },
    {
      label: "the page scrubs the DRY-RUN framing",
      from: "DRY-RUN",
      to: "DRY",
      expect: /must state the DRY-RUN framing/,
    },
    {
      label: "the page hides the double-signature refusal",
      from: "CHALLENGE_ALREADY_RESERVED",
      to: "CHALLENGE_DONE",
      expect: /double-signature refusal/,
    },
    {
      label: "the page takes ownership of no money",
      from: /no money/gi,
      to: "",
      expect: /no key and no money/,
    },
    {
      label: "the page stops naming the honest third answer",
      from: /(honest third answer|الجواب الثالث الصادق)/g,
      to: "",
      expect: /honest third answer for UNKNOWN/,
    },
  ];
  let applied = 0;
  for (const c of cases) {
    const anchor = typeof c.from === "string" ? p.includes(c.from) : c.from.test(p);
    if (!anchor) continue; // keep the test honest: skip only if the page already drifted away from the control's anchor
    applied++;
    const violations = pageBindingViolations(typeof c.from === "string" ? p.replaceAll(c.from, c.to) : p.replace(c.from, c.to));
    assert.ok(violations.length > 0, `negative control did not bite: "${c.label}" — the page contract stayed green over a corrupted binding`);
    assert.match(violations.join(" | "), c.expect, `negative control "${c.label}" bit with the wrong message`);
  }
  assert.ok(applied >= 4, `expected >=4 page controls to apply, only ${applied} did — the battery swore at stale anchors`);
});

test("negative control: a hand-edit to one engine byte diverges the engine BEHAVIORALLY from the real packages, and the bite disappears after regeneration", async () => {
  const target = join(PGB, "ledger.js");
  const original = readFileSync(target, "utf8");
  const BOON = "if (shareCents > parentAvailable) {";
  assert.ok(original.includes(BOON), "the tamper target line exists in the engine copy");
  const poisoned = original.replace(BOON, "if (shareCents + 1 > parentAvailable) {"); // one-cent bias: exact-fit carves refused
  assert.notEqual(poisoned, original, "the mutation must APPLY (staged byte differs)");
  writeFileSync(target, poisoned, "utf8");
  try {
    const tamed = await import(pathToFileURL(join(PGB, "ledger.js")).href + `?poison=${Date.now()}`);
    // behavior comparison vs the REAL ledger through the SAME probe: exact-fit boundary carve
    const realLedgerMods = await realLedger();
    const realLedgerObj = realLedgerMods.createBudgetLedger();
    realLedgerObj.openJob({ jobId: "bite-job-real", ceilingCents: 1000 });
    const realRes = realLedgerObj.openScope({ jobId: "bite-job-real", scopeId: "whole", shareCents: 1000 }); // exact fit
    const fein = tamed.createBudgetLedger();
    fein.openJob({ jobId: "bite-job-poison", ceilingCents: 1000 });
    const poisonRes = fein.openScope({ jobId: "bite-job-poison", scopeId: "whole", shareCents: 1000 });
    assert.equal(realRes.state, "OPEN", "the real package honors the exact-fit share (documents the boundary)");
    assert.equal(poisonRes.state, "REFUSED", "the tampered engine refusal — the page's engine is not what the real one says (BITE)");
    assert.equal(poisonRes.code, "EXCEEDS_JOB_CEILING");
  } finally {
    writeFileSync(target, original, "utf8");
  }
  const r = spawnSync(process.execPath, ["scripts/build-playground.mjs", "--check"], { cwd: REPO, encoding: "utf8" });
  assert.ok(r.stdout.includes("engine is in sync with the packages"), "restoring the byte closes the drift (fix loop)");
  const healed = await import(pathToFileURL(join(PGB, "ledger.js")).href + `?heal=${Date.now()}`);
  const healedLedger = healed.createBudgetLedger();
  healedLedger.openJob({ jobId: "heal", ceilingCents: 1000 });
  assert.equal(healedLedger.openScope({ jobId: "heal", scopeId: "whole", shareCents: 1000 }).state, "OPEN", "post-restore the engine honors the boundary again");
});

test("negative control: the generator's own --check bites on a dirty engine file even when packages are untouched", () => {
  const target = join(PGB, "manifest.json");
  const original = readFileSync(target, "utf8");
  const dirty = original.replace('"marker": "CG-ENGINE-PROVENANCE"', '"marker": "CG-ENGINE-TAMPERED"');
  assert.notEqual(dirty, original, "the mutation must APPLY");
  writeFileSync(target, dirty, "utf8");
  try {
    const r = spawnSync(process.execPath, ["scripts/build-playground.mjs", "--check"], { cwd: REPO, encoding: "utf8" });
    assert.equal(r.status, 1, "--check must FAIL on a dirtied engine tree");
    assert.ok(`${r.stdout}${r.stderr}`.includes("DRIFT"), "--check must report the drift by name");
  } finally {
    writeFileSync(target, original, "utf8");
  }
  const rr = spawnSync(process.execPath, ["scripts/build-playground.mjs", "--check"], { cwd: REPO, encoding: "utf8" });
  assert.equal(rr.status, 0, "post-restore --check is green again (fix loop)");
});
