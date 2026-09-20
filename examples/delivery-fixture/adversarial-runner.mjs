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
 *
 * Exit contract: 0 = every mutation caught by its own check · 1 = a mutation
 * survived or was caught by the wrong check (the gate has a hole — stop) ·
 * 2 = usage error.
 *
 * This script never writes, never authorizes, never broadcasts.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyDeliveryFixture,
  BOUNDARY_BANNER,
} from "../../packages/delivery/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const jsonMode = process.argv.includes("--json");

// ---------------------------------------------------------------- fuzz mode options

const FUZZ_DEFAULT_SEED = 424242;
const FUZZ_DEFAULT_ROUNDS = 50;

function parseFuzzOptions(argv) {
  const fuzzIdx = argv.indexOf("--fuzz");
  const seedIdx = argv.indexOf("--seed");
  if (seedIdx !== -1 && fuzzIdx === -1) return { error: "--seed is only meaningful together with --fuzz" };
  if (fuzzIdx === -1) return { rounds: undefined, seed: undefined };
  const rawRounds = fuzzIdx + 1 < argv.length && !argv[fuzzIdx + 1].startsWith("--") ? argv[fuzzIdx + 1] : String(FUZZ_DEFAULT_ROUNDS);
  const rounds = Math.floor(Number(rawRounds));
  if (!Number.isFinite(rounds) || rounds < 1) return { error: "--fuzz needs a positive number of rounds (e.g. --fuzz 50)" };
  const rawSeed = seedIdx !== -1 && seedIdx + 1 < argv.length && !argv[seedIdx + 1].startsWith("--") ? argv[seedIdx + 1] : undefined;
  let seed = FUZZ_DEFAULT_SEED;
  if (rawSeed !== undefined) {
    seed = Math.floor(Number(rawSeed));
    if (!Number.isFinite(seed)) return { error: "--seed needs an integer (e.g. --seed 424242)" };
  }
  return { rounds, seed };
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

async function runGate(fixture) {
  const rep = await verifyDeliveryFixture(fixture, evm);
  return Object.fromEntries(rep.checks.map((c) => [c.id, c.result]));
}

const results = [];

// Control: the honest fixture must stay clean — a runner whose baseline
// already fails proves nothing.
const control = await runGate(honestFixture());
const controlClean = Object.values(control).every((r) => r === "PASS");

for (const m of MUTATIONS) {
  const fixture = honestFixture();
  m.mutate(fixture);
  const state = await runGate(fixture);
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
  const state = await runGate(fixture);
  const caught = Object.entries(state).filter(([, r]) => r === "FAIL").map(([id]) => id);
  const misses = battery.members.filter((id) => state[id] !== "FAIL");
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

// Random-size, random-order stacks of the ten mutations — a fuzzer that hits
// combinations the hand-written batteries never thought of. Determinism:
// mulberry32 over the seed means the same seed replays the exact same rounds
// (CI-comparable, bug-reproducible). A round SURVIVES if any member's own
// check stayed PASS — the same blinding standard as the compound batteries.
let fuzzReport = undefined;
{
  const fuzzOpts = parseFuzzOptions(process.argv.slice(2));
  if (fuzzOpts.error) {
    console.error(`usage: ${fuzzOpts.error}`);
    process.exit(2);
  }
  if (fuzzOpts.rounds !== undefined) {
    const rand = mulberry32(fuzzOpts.seed);
    const rounds = [];
    for (let i = 0; i < fuzzOpts.rounds; i++) {
      const pool = [...MUTATIONS];
      const size = 1 + Math.floor(rand() * pool.length); // 1..10 mutations stacked
      const members = [];
      for (let k = 0; k < size; k++) {
        members.push(pool.splice(Math.floor(rand() * pool.length), 1)[0].id);
      }
      const fixture = honestFixture();
      for (const id of members) MUTATIONS.find((m) => m.id === id).mutate(fixture);
      const state = await runGate(fixture);
      const caught = Object.entries(state).filter(([, r]) => r === "FAIL").map(([id]) => id);
      const misses = members.filter((id) => state[id] !== "FAIL");
      rounds.push({
        round: i + 1,
        stack: members,
        caught,
        missedByOwnCheck: misses,
        verdict: misses.length === 0 ? "CAUGHT" : "SURVIVED",
      });
    }
    const fuzzSurvived = rounds.filter((r) => r.verdict === "SURVIVED");
    fuzzReport = { seed: fuzzOpts.seed, rounds: rounds.length, survived: fuzzSurvived.length, results: rounds };
  }
}
const fuzzAllClear = fuzzReport ? fuzzReport.survived === 0 : true;

const summary = {
  control: controlClean ? "CLEAN (all 10 checks PASS on the honest fixture)" : "BASELINE DIRTY — runner results meaningless until fixed",
  mutations: results.length,
  caught: results.length - survived.length,
  survived: survived.length,
  compoundBatteries: compoundResults.length,
  compoundCaught: compoundResults.length - compoundSurvived.length,
  compoundSurvived: compoundSurvived.length,
  ...(fuzzReport ? { fuzzSeed: fuzzReport.seed, fuzzRounds: fuzzReport.rounds, fuzzSurvived: fuzzReport.survived } : {}),
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
    summary,
    verdict: allClear
      ? (fuzzReport
          ? "ALL MUTATIONS CAUGHT (single + compound + fuzz) — the gate bites where it claims to"
          : "ALL MUTATIONS CAUGHT (single + compound) — the gate bites where it claims to")
      : "GATE HOLE — see results",
  }, null, 2));
  process.exit(allClear ? 0 : 1);
}

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
console.log(line);
console.log(`mutations: ${summary.mutations} · caught: ${summary.caught} · survived: ${summary.survived}`);
console.log(`compound : ${summary.compoundBatteries} batteries · caught: ${summary.compoundCaught} · survived: ${summary.compoundSurvived}`);
if (fuzzReport) console.log(`fuzz     : seed ${summary.fuzzSeed} · ${summary.fuzzRounds} stacks · survived: ${summary.fuzzSurvived}`);
console.log(allClear
  ? (fuzzReport
      ? "verdict : ALL MUTATIONS CAUGHT (single + compound + fuzz) — the boundary enforces itself"
      : "verdict : ALL MUTATIONS CAUGHT (single + compound) — the boundary enforces itself")
  : "verdict : GATE HOLE — fix the listed checks before citing DDE output");
console.log(`boundary: ${BOUNDARY_BANNER.statement}`);
process.exit(allClear ? 0 : 1);
