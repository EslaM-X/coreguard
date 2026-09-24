#!/usr/bin/env node
/**
 * adversarial-runner.mjs — the DDE/1 gate versus a hostile author.
 *
 * The DDE gate is only trustworthy if every check inside it actually bites.
 * This runner proves that in one command: it loads the honest fixture, applies
 * exactly one named mutation per F/E/B check, runs the full fail-closed gate
 * against every mutant plus an untouched control, and demands that each
 * mutation be caught by ITS OWN check — not by a bystander.
 *
 *   node examples/delivery-fixture/adversarial-runner.mjs
 *   node examples/delivery-fixture/adversarial-runner.mjs --json
 *   node examples/delivery-fixture/adversarial-runner.mjs --fuzz 50 [--seed 424242]
 *     fuzz mode: seed-deterministic random stacks of the ten mutations —
 *     each round stacks a random-size subset (applied in PRNG order) and
 *     demands every member's own check still fire. Same seed ⇒ same rounds.
 *   node examples/delivery-fixture/adversarial-runner.mjs --fuzz 50 --seeds s1,s2,[…]
 *     multi-seed fuzz: every seed runs the full round set in the SAME report,
 *     each labeled with its run number (run i/N · seed s). Wider discovery in
 *     one command; same seeds ⇒ same runs; exit 1 if ANY run has a survivor.
 *   [--budget-ms 250]
 *     per-cycle time budget over ALL gate cycles (control, mutations,
 *     compound batteries, every fuzz round). A cycle over budget prints a
 *     PERF WARNING and the summary counts it — engine slowdown under
 *     combinational load becomes visible. Warnings never flip the
 *     correctness verdict.
 *
 * Exit contract: 0 = every mutation caught by its own check · 1 = a mutation
 * survived or was caught by the wrong check (the gate has a hole — stop) ·
 * 2 = usage error.
 *
 * This script never writes, never authorizes, never broadcasts.
 */

import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyDeliveryFixture,
  BOUNDARY_BANNER,
} from "../../packages/delivery/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const argvRaw = process.argv.slice(2);
const jsonMode = argvRaw.includes("--json");

// ------------------------------------------------------ per-cycle perf budget

// Every gate invocation (control, mutations, compound batteries, fuzz rounds)
// is timed. A cycle over budget prints a PERF WARNING — the runner's way of
// saying the engine got slower under combinational load. Default 250ms is
// ~50x the measured local median (~5ms/cycle): immune to CI noise, catches
// order-of-magnitude regressions. Warnings never change the exit code —
// correctness and performance are reported separately, on purpose.
const BUDGET_DEFAULT_MS = 250;
let perfBudgetMs = BUDGET_DEFAULT_MS;
{
  const budgetIdx = argvRaw.indexOf("--budget-ms");
  if (budgetIdx !== -1) {
    const raw = argvRaw[budgetIdx + 1];
    const v = raw === undefined || raw.startsWith("--") ? NaN : Number(raw);
    if (!Number.isFinite(v) || v <= 0) {
      console.error("usage: --budget-ms needs a positive number of milliseconds (e.g. --budget-ms 250)");
      process.exit(2);
    }
    perfBudgetMs = v;
  }
}

// ---------------------------------------------------------------- fuzz mode options

const FUZZ_DEFAULT_SEED = 424242;
const FUZZ_DEFAULT_ROUNDS = 50;

function parseFuzzOptions(argv) {
  const fuzzIdx = argv.indexOf("--fuzz");
  const seedIdx = argv.indexOf("--seed");
  const seedsIdx = argv.indexOf("--seeds");
  if (seedIdx !== -1 && seedsIdx !== -1) {
    return { error: "--seed and --seeds are mutually exclusive (single run vs multi-seed report)" };
  }
  if (seedIdx !== -1 && fuzzIdx === -1 && seedsIdx === -1) return { error: "--seed is only meaningful together with --fuzz" };
  const roundsFromArg = () => {
    const rawRounds = fuzzIdx + 1 < argv.length && !argv[fuzzIdx + 1].startsWith("--") ? argv[fuzzIdx + 1] : String(FUZZ_DEFAULT_ROUNDS);
    const rounds = Math.floor(Number(rawRounds));
    if (!Number.isFinite(rounds) || rounds < 1) return { error: "--fuzz needs a positive number of rounds (e.g. --fuzz 50)" };
    return { rounds };
  };
  if (seedsIdx !== -1) {
    const raw = seedsIdx + 1 < argv.length && !argv[seedsIdx + 1].startsWith("--") ? argv[seedsIdx + 1] : "";
    if (!raw.trim() || raw.split(",").some((s) => s.trim() === "")) {
      return { error: "--seeds needs a comma-separated list of integers (e.g. --seeds 424242,777,9001)" };
    }
    const seeds = raw.split(",").map((s) => Math.floor(Number(s.trim())));
    if (seeds.some((s) => !Number.isFinite(s))) {
      return { error: "--seeds needs a comma-separated list of integers (e.g. --seeds 424242,777,9001)" };
    }
    if (fuzzIdx !== -1) {
      const rf = roundsFromArg();
      if (rf.error) return rf;
      return { mode: "multi", seeds, rounds: rf.rounds };
    }
    return { mode: "multi", seeds, rounds: FUZZ_DEFAULT_ROUNDS };
  }
  if (fuzzIdx === -1) return { rounds: undefined, seed: undefined };
  const rf = roundsFromArg();
  if (rf.error) return rf;
  const rawSeed = seedIdx !== -1 && seedIdx + 1 < argv.length && !argv[seedIdx + 1].startsWith("--") ? argv[seedIdx + 1] : undefined;
  let seed = FUZZ_DEFAULT_SEED;
  if (rawSeed !== undefined) {
    seed = Math.floor(Number(rawSeed));
    if (!Number.isFinite(seed)) return { error: "--seed needs an integer (e.g. --seed 424242)" };
  }
  return { rounds: rf.rounds, seed };
}

/** mulberry32 — the same deterministic PRNG pattern as scripts/benchmark-10k.mjs:
 *  tiny, fast, and reproducible from a single integer seed. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The shared round generator — one seed, N stacked-mutation rounds. Both
 *  fuzz paths (single-seed report, multi-seed report) drive THIS function,
 *  so a run is byte-identical no matter which report carries it. */
async function fuzzRoundsFor(seed, rounds, contextFn = (i) => `fuzz seed ${seed} round ${i + 1}`) {
  const rand = mulberry32(seed);
  const out = [];
  for (let i = 0; i < rounds; i++) {
    const pool = [...MUTATIONS];
    const size = 1 + Math.floor(rand() * pool.length); // 1..13 mutations stacked
    const members = [];
    for (let k = 0; k < size; k++) {
      members.push(pool.splice(Math.floor(rand() * pool.length), 1)[0].id);
    }
    const fixture = honestFixture();
    for (const id of members) MUTATIONS.find((m) => m.id === id).mutate(fixture);
    const state = await runGate(fixture, contextFn(i));
    const caught = Object.entries(state).filter(([, r]) => r === "FAIL").map(([id]) => id);
    // Survival is judged through each member's DECLARED `hits` (mutation ids
    // and check ids are different namespaces — e.g. F3c's own check is F3;
    // indexing `state` by mutation id silently misses everything that does
    // not share its check's name).
    const hitsOf = (id) => MUTATIONS.find((m) => m.id === id).hits;
    const misses = members.filter((id) => !hitsOf(id).some((h) => state[h] === "FAIL"));
    out.push({
      round: i + 1,
      stack: members,
      caught,
      missedByOwnCheck: misses,
      verdict: misses.length === 0 ? "CAUGHT" : "SURVIVED",
    });
  }
  return out;
}

// ------------------------------------------------------------ honest fixture

const MANIFEST = JSON.parse(readFileSync(join(HERE, "hashes.json"), "utf8"));
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

/** Honest fixture, byte-identical to the pinned records — no re-hashing here:
 *  the CLI verifier (verify-fixture.mjs) owns pin enforcement; the runner
 *  owns mutation coverage. Load order mirrors verify-fixture. */
function honestFixture() {
  const f = {};
  for (const [file, key] of Object.entries(FILE_TO_KEY)) {
    f[key] = JSON.parse(readFileSync(join(HERE, file), "utf8"));
  }
  f.origin = MANIFEST.fixture.origin;
  f.lifecycleState = MANIFEST.fixture.lifecycleState;
  return f;
}

const evm = await import("../../packages/evm/index.js");

// ---------------------------------------------------------------- mutations

/** One mutation per check. `hits` names the ONLY check allowed to catch it. */
const MUTATIONS = [
  {
    id: "F0",
    label: 'delete retention-policy record (a mandatory record vanishes)',
    hits: ["F0"],
    mutate: (x) => { delete x.retentionPolicy; },
  },
  {
    id: "F1",
    label: 'acceptance grounds quote execution facts ("payment settled in full")',
    hits: ["F1"],
    mutate: (x) => { x.acceptanceRecord.note = "payment settled in full — accepted"; },
  },
  {
    id: "F2",
    label: "silently skip the C-QUALITY evaluation (no invented pass)",
    hits: ["F2"],
    mutate: (x) => {
      x.acceptanceRecord.evaluations = x.acceptanceRecord.evaluations
        .filter((e) => e.criterionId !== "C-QUALITY");
    },
  },
  {
    id: "F3",
    label: 'declare lifecycleState "DRAFT" while records show DISPUTE_OPEN',
    hits: ["F3"],
    mutate: (x) => { x.lifecycleState = "DRAFT"; },
  },
  {
    id: "E3",
    label: "flip one byte of handoff-notes.txt after its SHA-256 pin",
    hits: ["E3"],
    mutate: (x) => {
      const art = x.delivery.artifacts.find((a) => a.id === "handoff-notes.txt");
      art.content = art.content.slice(0, -1) +
        String.fromCharCode(art.content.charCodeAt(art.content.length - 1) ^ 0x01);
    },
  },
  {
    id: "E4",
    label: "delivery claims a different agreement (broken authorization chain)",
    hits: ["E4"],
    mutate: (x) => { x.delivery.agreementRef = "DDE-FIXTURE-999-AGREEMENT"; },
  },
  {
    id: "E5",
    label: "swap a consent grant's grantor to the other party (replay must catch it)",
    hits: ["E5"],
    mutate: (x) => {
      x.consentAndDisclosure.redactionGrants[0].grantor =
        x.consentAndDisclosure.redactionGrants[1].grantor;
    },
  },
  {
    id: "B1",
    label: 'acceptance basis = ["PAYMENT_SETTLED"] — payment as acceptance ground',
    hits: ["B1"],
    mutate: (x) => { x.acceptanceRecord.basis = ["PAYMENT_SETTLED"]; },
  },
  {
    id: "B2",
    label: "ACCEPTED verdict with zero criterion evaluations",
    hits: ["B2"],
    mutate: (x) => {
      x.acceptanceRecord.verdict = "ACCEPTED";
      x.acceptanceRecord.evaluations = [];
    },
  },
  {
    id: "B3",
    label: 'requested remedy outside the closed vocabulary ("BAN THE PROVIDER")',
    hits: ["B3"],
    mutate: (x) => { x.disputeRecord.partyB.requestedRemedy = "BAN THE PROVIDER"; },
  },

  // ---- closure-chain mutations (the F3 closedAtUtc series)
  // The closure chain has its own ordered rule: closure can only FOLLOW an
  // opening record. Each mutation below attacks one direction of that rule;
  // `hits` names the only check allowed to catch it. Live-proved before
  // being added: F3c exploited a real engine hole (closure without opening
  // stayed PASS) that this series flushed out — the engine now fails it
  // closed.
  {
    id: "F3b",
    label: "closure precedes its own opening (closedAtUtc before openedAtUtc)",
    hits: ["F3"],
    mutate: (x) => { x.disputeRecord.closedAtUtc = "2025-01-01T00:00:00Z"; },
  },
  {
    id: "F3c",
    label: "closed record with no opening record (closure without an opening)",
    hits: ["F3"],
    mutate: (x) => {
      delete x.disputeRecord.openedAtUtc;
      x.disputeRecord.closedAtUtc = "2026-01-02T00:00:00Z";
      x.lifecycleState = "RECORD_CLOSED";
    },
  },
  {
    id: "F3d",
    label: 'declare RECORD_CLOSED with no closedAtUtc anywhere (closure asserted, never recorded)',
    hits: ["F3"],
    mutate: (x) => { x.lifecycleState = "RECORD_CLOSED"; },
  },
];

// ------------------------------------------------------ compound attacks

/**
 * Compound attacks — a hostile author does not send one defect at a time.
 * Each battery stacks several mutations from different layers and demands
 * that every stacked mutation still be caught by its own check. A compound
 * battery "survives" if ANY member's check stayed PASS — i.e. a stacked
 * defect hid another's firing. The point: coverage is per-check AND
 * per-combination; one blinding another is a gate hole.
 */
const COMPOUND_BATTERIES = [
  {
    id: "X1",
    label: "financially-framed attack: payment-as-basis + flipped artifact byte",
    members: ["B1", "E3"],
  },
  {
    id: "X2",
    label: "paper-trail attack: skipped criterion + lifecycle lie",
    members: ["F2", "F3"],
  },
  {
    id: "X3",
    label: "identity attack: broken authorization chain + swapped consent grantor",
    members: ["E4", "E5"],
  },
  {
    id: "X4",
    label: "verdict forgery: ACCEPTED on payment grounds + zero evaluations + off-vocabulary remedy",
    members: ["B1", "B2", "B3"],
  },
  {
    id: "X5",
    label: "kitchen sink: record deletion + forged grounds + tampered bytes + broken chain + forged verdict",
    members: ["F0", "F1", "E3", "E4", "B2"],
  },
];

// ------------------------------------------------------------------- attack

const line = "─".repeat(76);

// Per-cycle timing: every gate invocation is measured against the budget.
// A cycle over budget emits a PERF WARNING (once per cycle, with the caller
// supplied context naming WHERE it happened) and is counted in the summary.
// Warnings never change the verdict — a slow gate is still an enforcing gate;
// the report separates correctness from performance on purpose.
const perf = { budgetMs: perfBudgetMs, overBudget: [], count: 0, totalMs: 0, maxMs: 0 };

async function runGate(fixture, context = "gate cycle") {
  const t0 = performance.now();
  const rep = await verifyDeliveryFixture(fixture, evm);
  const ms = performance.now() - t0;
  perf.count += 1;
  perf.totalMs += ms;
  if (ms > perf.maxMs) perf.maxMs = ms;
  if (ms > perf.budgetMs) {
    perf.overBudget.push({ context, ms: Math.round(ms * 10) / 10 });
    console.error(`PERF WARNING: ${context} took ${ms.toFixed(1)}ms — over the ${perf.budgetMs}ms per-cycle budget (engine slowdown under combinational load?)`);
  }
  return Object.fromEntries(rep.checks.map((c) => [c.id, c.result]));
}

const results = [];

// Warm-up, deliberately unmeasured: the control cycle is the FIRST gate call
// in this process, so its timing is cold-start (JIT compile + module load +
// page-in), not the gate's real cost — it flapped past the 250ms budget
// (300–400ms cold vs 80–160ms warm) while every later cycle sat at a fraction
// of it [C20]. Warming up before the measured control keeps the budget honest
// about the gate, not about process birth.
await verifyDeliveryFixture(honestFixture(), evm);

// Control: the honest fixture must stay clean — a runner whose baseline
// already fails proves nothing.
const control = await runGate(honestFixture(), "control (honest fixture)");
const controlClean = Object.values(control).every((r) => r === "PASS");

for (const m of MUTATIONS) {
  const fixture = honestFixture();
  m.mutate(fixture);
  const state = await runGate(fixture, `mutation ${m.id}`);
  const caught = Object.entries(state).filter(([, r]) => r === "FAIL").map(([id]) => id);
  const precise = m.hits.every((h) => state[h] === "FAIL");
  results.push({
    id: m.id,
    mutation: m.label,
    caught,
    ownCheckFired: precise,
    allMutantFailsOwned: caught.every((id) => m.hits.includes(id)),
    verdict: controlClean && precise && caught.length > 0 ? "CAUGHT" : "SURVIVED",
  });
}

const survived = results.filter((r) => r.verdict === "SURVIVED");

// ------------------------------------------- compound attacks (stacked)

const compoundResults = [];
for (const battery of COMPOUND_BATTERIES) {
  const fixture = honestFixture();
  for (const id of battery.members) {
    MUTATIONS.find((m) => m.id === id).mutate(fixture);
  }
  const state = await runGate(fixture, `compound battery ${battery.id}`);
  const caught = Object.entries(state).filter(([, r]) => r === "FAIL").map(([id]) => id);
  // Same hits-mediated survival rule as the fuzz paths (see fuzzRoundsFor).
  const hitsOfC = (id) => MUTATIONS.find((m) => m.id === id).hits;
  const misses = battery.members.filter((id) => !hitsOfC(id).some((h) => state[h] === "FAIL"));
  compoundResults.push({
    id: battery.id,
    battery: battery.label,
    members: battery.members,
    caught,
    missedByOwnCheck: misses,
    verdict: misses.length === 0 ? "CAUGHT" : "SURVIVED",
  });
}
const compoundSurvived = compoundResults.filter((r) => r.verdict === "SURVIVED");

// ------------------------------------------ fuzz mode (seed-deterministic stacks)

// Random-size, random-order stacks of the shipped mutations — a fuzzer that
// hits combinations the hand-written batteries never thought of. Determinism:
// mulberry32 over the seed means the same seed replays the exact same rounds
// (CI-comparable, bug-reproducible). A round SURVIVES if any member's own
// check (its declared `hits`) stayed PASS — the same blinding standard as
// the compound batteries. Note: mutation ids and CHECK ids are different
// namespaces (F3c's own check is F3); survival is hits-mediated, never a
// direct id lookup.
let fuzzReport = undefined;
let multiSeedReport = undefined;
{
  const fuzzOpts = parseFuzzOptions(process.argv.slice(2));
  if (fuzzOpts.error) {
    console.error(`usage: ${fuzzOpts.error}`);
    process.exit(2);
  }
  if (fuzzOpts.mode === "multi") {
    const runs = [];
    for (let i = 0; i < fuzzOpts.seeds.length; i++) {
      const results = await fuzzRoundsFor(fuzzOpts.seeds[i], fuzzOpts.rounds, (i) => `fuzz seed ${fuzzOpts.seeds[i]} run ${i + 1}/${fuzzOpts.seeds.length} round ${i + 1}`);
      const survived = results.filter((r) => r.verdict === "SURVIVED");
      runs.push({
        runNumber: i + 1,
        runCount: fuzzOpts.seeds.length,
        seed: fuzzOpts.seeds[i],
        rounds: results.length,
        survived: survived.length,
        results,
      });
    }
    multiSeedReport = {
      seeds: fuzzOpts.seeds,
      roundsPerSeed: fuzzOpts.rounds,
      runs,
      totalSurvived: runs.reduce((acc, r) => acc + r.survived, 0),
    };
  } else if (fuzzOpts.rounds !== undefined) {
    const results = await fuzzRoundsFor(fuzzOpts.seed, fuzzOpts.rounds);
    const fuzzSurvived = results.filter((r) => r.verdict === "SURVIVED");
    fuzzReport = { seed: fuzzOpts.seed, rounds: results.length, survived: fuzzSurvived.length, results };
  }
}
const fuzzAllClear =
  (fuzzReport ? fuzzReport.survived === 0 : true) &&
  (multiSeedReport ? multiSeedReport.totalSurvived === 0 : true);

const summary = {
  control: controlClean ? "CLEAN (all 10 checks PASS on the honest fixture)" : "BASELINE DIRTY — runner results meaningless until fixed",
  mutations: results.length,
  caught: results.length - survived.length,
  survived: survived.length,
  compoundBatteries: compoundResults.length,
  compoundCaught: compoundResults.length - compoundSurvived.length,
  compoundSurvived: compoundSurvived.length,
  ...(fuzzReport ? { fuzzSeed: fuzzReport.seed, fuzzRounds: fuzzReport.rounds, fuzzSurvived: fuzzReport.survived } : {}),
  ...(multiSeedReport
    ? {
        multiSeed: multiSeedReport.seeds,
        multiSeedRoundsPerSeed: multiSeedReport.roundsPerSeed,
        multiSeedRuns: multiSeedReport.runs.map((r) => ({ runNumber: r.runNumber, seed: r.seed, rounds: r.rounds, survived: r.survived })),
        multiSeedTotalSurvived: multiSeedReport.totalSurvived,
      }
    : {}),
  perf: {
    budgetMs: perf.budgetMs,
    cycles: perf.count,
    totalMs: Math.round(perf.totalMs),
    maxCycleMs: Math.round(perf.maxMs * 10) / 10,
    overBudget: perf.overBudget.length,
    ...(perf.overBudget.length ? { overBudgetCycles: perf.overBudget } : {}),
  },
};

const allClear = controlClean && survived.length === 0 && compoundSurvived.length === 0 && fuzzAllClear;

if (jsonMode) {
  console.log(JSON.stringify({
    runner: "coreguard-dde-adversarial-runner",
    ddeVersion: "DDE/1",
    boundary: BOUNDARY_BANNER.statement,
    controlClean,
    results,
    compoundResults,
    ...(fuzzReport ? { fuzzResults: fuzzReport.results } : {}),
    ...(multiSeedReport
      ? { multiSeedResults: multiSeedReport.runs.map((r) => ({ runNumber: r.runNumber, seed: r.seed, results: r.results })) }
      : {}),
    summary,
    verdict: allClear
      ? (multiSeedReport
          ? `ALL MUTATIONS CAUGHT (single + compound + fuzz x${multiSeedReport.seeds.length} seeds) — the gate bites where it claims to`
          : fuzzReport
            ? "ALL MUTATIONS CAUGHT (single + compound + fuzz) — the gate bites where it claims to"
            : "ALL MUTATIONS CAUGHT (single + compound) — the gate bites where it claims to")
      : "GATE HOLE — see results",
  }, null, 2));
  // Exit naturally (process.exitCode, NOT process.exit): after a big report,
  // piped stdout is still draining asynchronously — process.exit() would
  // truncate the report tail on Linux. Set the code and let the loop drain.
  process.exitCode = allClear ? 0 : 1;
}

// The text report lives in a labeled block: --json mode set its exit code
// above and breaks straight past it (top-level ESM cannot `return`).
textReport: {
  if (jsonMode) break textReport;
console.log(line);
console.log("CoreGuard DDE — Adversarial Runner (one mutation per fail-closed check)");
console.log(line);
console.log(`control : ${summary.control}`);
console.log("");
const pad = (s, w) => s + " ".repeat(Math.max(0, w - s.length));
for (const r of results) {
  const mark = r.verdict === "CAUGHT" ? "✓" : "✗";
  console.log(`  ${mark} ${pad(r.id, 4)} ${r.mutation}`);
  console.log(`      → caught by [${r.caught.join(", ") || "NOTHING"}]` +
    (r.verdict === "SURVIVED" ? "  ← SURVIVED: the gate has a hole" : ""));
}
console.log(line);
console.log("compound attacks — stacked mutations from different layers at once:");
for (const r of compoundResults) {
  const mark = r.verdict === "CAUGHT" ? "✓" : "✗";
  console.log(`  ${mark} ${pad(r.id, 4)} [${r.members.join(" + ")}] ${r.battery}`);
  console.log(`      → caught by [${r.caught.join(", ") || "NOTHING"}]` +
    (r.verdict === "SURVIVED" ? `  ← SURVIVED: ${r.missedByOwnCheck.join(", ")} stayed PASS` : ""));
}
if (fuzzReport) {
  console.log(`fuzz — seed ${fuzzReport.seed}: ${fuzzReport.rounds} random stacks (deterministic replay: same seed ⇒ same rounds):`);
  for (const r of fuzzReport.results) {
    const mark = r.verdict === "CAUGHT" ? "✓" : "✗";
    console.log(`  ${mark} round ${pad(String(r.round), 3)} [${r.stack.join(" + ")}]`);
    console.log(`      → caught by [${r.caught.join(", ") || "NOTHING"}]` +
      (r.verdict === "SURVIVED" ? `  ← SURVIVED: ${r.missedByOwnCheck.join(", ")} stayed PASS` : ""));
  }
}
if (multiSeedReport) {
  console.log(`fuzz x${multiSeedReport.seeds.length} seeds — ${multiSeedReport.roundsPerSeed} stacks per seed, every seed labeled with its run (deterministic replay per seed):`);
  for (const run of multiSeedReport.runs) {
    console.log(`  run ${run.runNumber}/${run.runCount} — seed ${run.seed}: ${run.rounds} stacks · survived ${run.survived}`);
    for (const r of run.results) {
      const mark = r.verdict === "CAUGHT" ? "✓" : "✗";
      console.log(`    ${mark} round ${pad(String(r.round), 3)} [${r.stack.join(" + ")}]`);
      console.log(`        → caught by [${r.caught.join(", ") || "NOTHING"}]` +
        (r.verdict === "SURVIVED" ? `  ← SURVIVED: ${r.missedByOwnCheck.join(", ")} stayed PASS` : ""));
    }
  }
}
console.log(line);
console.log(`mutations: ${summary.mutations} · caught: ${summary.caught} · survived: ${summary.survived}`);
console.log(`compound : ${summary.compoundBatteries} batteries · caught: ${summary.compoundCaught} · survived: ${summary.compoundSurvived}`);
if (fuzzReport) console.log(`fuzz     : seed ${summary.fuzzSeed} · ${summary.fuzzRounds} stacks · survived: ${summary.fuzzSurvived}`);
if (multiSeedReport) {
  console.log(`fuzz x${multiSeedReport.seeds.length}   : ${multiSeedReport.roundsPerSeed} stacks/seed over seeds [${multiSeedReport.seeds.join(", ")}] · survived total: ${multiSeedReport.totalSurvived}`);
}
console.log(`perf     : ${perf.count} gate cycles · budget ${perf.budgetMs}ms/cycle · max ${perf.maxMs.toFixed(1)}ms · total ${Math.round(perf.totalMs)}ms · over budget: ${perf.overBudget.length}`);
if (perf.overBudget.length) {
  for (const o of perf.overBudget) console.log(`  ⚠ ${o.context}: ${o.ms}ms (budget ${perf.budgetMs}ms)`);
}
console.log(allClear
  ? (multiSeedReport
      ? `verdict : ALL MUTATIONS CAUGHT (single + compound + fuzz x${multiSeedReport.seeds.length} seeds) — the boundary enforces itself`
      : fuzzReport
        ? "verdict : ALL MUTATIONS CAUGHT (single + compound + fuzz) — the boundary enforces itself"
        : "verdict : ALL MUTATIONS CAUGHT (single + compound) — the boundary enforces itself")
  : "verdict : GATE HOLE — fix the listed checks before citing DDE output");
if (perf.overBudget.length) {
  console.log(`perf verdict: ${perf.overBudget.length} cycle(s) over the ${perf.budgetMs}ms per-cycle budget — engine slowdown under combinational load (correctness verdict above is unaffected)`);
}
console.log(`boundary: ${BOUNDARY_BANNER.statement}`);
// Natural exit — same stdout-drain rule as the JSON branch above. The perf
// budget line and the verdict itself live at the tail of a piped report;
// process.exit() here silently truncates them on Linux (caught live by the
// reviewer-table contract test on CI).
process.exitCode = allClear ? 0 : 1;
}
