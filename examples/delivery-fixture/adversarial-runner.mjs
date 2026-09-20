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
 *
 * Exit contract: 0 = every mutation caught by its own check · 1 = a mutation
 * survived or was caught by the wrong check (the gate has a hole — stop).
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

const summary = {
  control: controlClean ? "CLEAN (all 10 checks PASS on the honest fixture)" : "BASELINE DIRTY — runner results meaningless until fixed",
  mutations: results.length,
  caught: results.length - survived.length,
  survived: survived.length,
  compoundBatteries: compoundResults.length,
  compoundCaught: compoundResults.length - compoundSurvived.length,
  compoundSurvived: compoundSurvived.length,
};

const allClear = controlClean && survived.length === 0 && compoundSurvived.length === 0;

if (jsonMode) {
  console.log(JSON.stringify({
    runner: "coreguard-dde-adversarial-runner",
    ddeVersion: "DDE/1",
    boundary: BOUNDARY_BANNER.statement,
    controlClean,
    results,
    compoundResults,
    summary,
    verdict: allClear
      ? "ALL MUTATIONS CAUGHT (single + compound) — the gate bites where it claims to"
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
console.log(line);
console.log(`mutations: ${summary.mutations} · caught: ${summary.caught} · survived: ${summary.survived}`);
console.log(`compound : ${summary.compoundBatteries} batteries · caught: ${summary.compoundCaught} · survived: ${summary.compoundSurvived}`);
console.log(allClear
  ? "verdict : ALL MUTATIONS CAUGHT (single + compound) — the boundary enforces itself"
  : "verdict : GATE HOLE — fix the listed checks before citing DDE output");
console.log(`boundary: ${BOUNDARY_BANNER.statement}`);
process.exit(allClear ? 0 : 1);
