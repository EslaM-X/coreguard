#!/usr/bin/env node
/**
 * agent-platform-integration — the "no delivery evidence, no payout" demo.
 *
 * A modeled agent platform holds a client's payout in escrow. It will only
 * release when CoreGuard's DDE layer says the fixture is VERIFIED *and* the
 * platform's own acceptance predicate holds (client's acceptance record is a
 * party-signed REJECTED/ACCEPTED resting on criteria evaluations). The demo
 * runs the full story against the repository's own synthetic fixture:
 *
 *   act 1 — delivery submitted, acceptance pending        → HOLD (no verdict yet)
 *   act 2 — client records a criteria-based REJECTED      → HOLD (predicate not met)
 *   act 3 — tamper with a delivered artifact post-pin     → HOLD (E3 catches the byte)
 *   act 4 — honest fixture as delivered (REJECTED record) → the boundary shown honestly:
 *           verification PASSES, the payment gate stays CLOSED because the
 *           client's recorded acceptance is REJECTED — execution evidence and
 *           payment settlement never decide conformity.
 *
 * This is a schema exercise with synthetic parties and a real public mainnet
 * anchor. The platform in this demo never signs, never broadcasts; the payout
 * decision is a platform act, informed by — never derived from — DDE reports.
 *
 *   node examples/agent-platform-integration/run-integration-demo.mjs
 *   node examples/agent-platform-integration/run-integration-demo.mjs --json
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyFixture, releaseWhen } from "../../packages/delivery/sdk.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(HERE, "..", "delivery-fixture");
const jsonMode = process.argv.includes("--json");

// --------------------------------------------------- modeled platform state

const escrow = {
  platform: "AgentX-change (modeled integration demo)",
  payoutWei: "250000000000000000",
  state: "HELD",
  releaseReasons: null,
};

function settle(gate, label) {
  escrow.state = gate.release ? "RELEASED" : "HELD";
  escrow.releaseReasons = gate.release ? ["acceptance condition met — payout released to the provider"] : gate.reasons;
  return { label, escrowState: escrow.state, reasons: escrow.releaseReasons };
}

/** The platform's OWN acceptance predicate — a business decision, informed by
 *  the DDE report but never derived from its execution facts. */
const clientAccepted = (report) => {
  const rec = report?.fixture?.acceptanceRecord; // not provided over verify(); see below
  return rec ? rec.verdict === "ACCEPTED" : false;
};

// The SDK envelope does not embed the raw fixture; the platform keeps its own
// copy of the acceptance record it holds on file (as real platforms do).
const onFileAcceptanceVerdict = () =>
  JSON.parse(readFileSync(join(FIXTURE_DIR, "acceptance-record.json"), "utf8")).verdict;

// The release condition the platform actually uses: VERIFIED report + the
// on-file acceptance record says ACCEPTED.
const releaseCondition = async () => {
  const report = await verifyFixture({ fixtureDir: FIXTURE_DIR });
  const accepted = onFileAcceptanceVerdict() === "ACCEPTED";
  return { report, gate: releaseWhen(report, () => accepted) };
};

const acts = [];

// ------------------------------------------------------------ act 1 — pending

{
  // Model "delivery submitted, no acceptance yet": strip the acceptance record.
  const report = await verifyFixture({ fixtureDir: FIXTURE_DIR });
  const noVerdictYet = report.status === "VERIFIED" && onFileAcceptanceVerdict() === "REJECTED";
  const gate = releaseWhen(report, () => false); // acceptance still pending platform-side
  acts.push(settle(gate, "delivery submitted — acceptance pending platform-side"));
}

// ------------------------------------------- act 2 — criteria-based REJECTED

{
  const { gate } = await releaseCondition();
  acts.push(settle(gate, "client's recorded acceptance: REJECTED on C-QUALITY (criteria evaluations)"));
}

// ---------------------------------------------- act 3 — one tampered artifact

{
  // Simulate post-pin tampering by re-verifying with the artifact mutated in
  // memory: the SDK mirrors the CLI's in-memory tamper semantics.
  const { loadFixtureFromDir } = await import("../../packages/delivery/sdk.js");
  const { fixture } = loadFixtureFromDir(FIXTURE_DIR);
  const art = fixture.delivery.artifacts.find((a) => a.id === "handoff-notes.txt");
  art.content = art.content.slice(0, -1) + String.fromCharCode(art.content.charCodeAt(art.content.length - 1) ^ 0x01);
  const report = await verifyFixture({ fixture });
  const gate = releaseWhen(report, () => onFileAcceptanceVerdict() === "ACCEPTED");
  acts.push(settle(gate, "provider re-submits after flipping one artifact byte (E3 must catch it)"));
}

// ------------------------------- act 4 — the honest boundary, shown head-on

{
  const { report, gate } = await releaseCondition();
  acts.push({
    label: "honest fixture: VERIFIED evidence, client's REJECTED verdict on file",
    escrowState: gate.release ? "RELEASED" : "HELD",
    reasons: gate.release ? escrow.releaseReasons : [
      "release predicate not satisfied — the client's recorded acceptance is REJECTED",
      `DDE report: ${report.status} — ${report.decision}`,
      "execution evidence is admissible; payment settlement is proven; NEITHER decides conformity",
    ],
  });
}

// ------------------ act 5 — the counterfactual: client accepts, payout flows

{
  // Same evidence, same platform predicate — the only change is the client's
  // recorded verdict becoming ACCEPTED (modeled in memory: a party act under
  // DDE/1, resting on the same criteria evaluations). This is the release
  // path the first four acts deliberately withhold.
  const report = await verifyFixture({ fixtureDir: FIXTURE_DIR });
  const gate = releaseWhen(report, () => true /* modeled ACCEPTED on file */);
  acts.push(settle(gate, "counterfactual: client records ACCEPTED on the same criteria — the gate opens"));
  if (gate.release) escrow.state = "RELEASED (counterfactual)";
}

// ------------------------------------------------------------------- output

if (jsonMode) {
  console.log(JSON.stringify({ demo: "coreguard-agent-platform-integration", acts, escrowFinal: escrow }, null, 2));
  // Contract: acts 1–4 HOLD (no conformity from execution), act 5 RELEASES
  // (explicit party acceptance — the only thing that opens the gate).
  const ok = acts.slice(0, 4).every((a) => a.escrowState === "HELD") && acts[4].escrowState.startsWith("RELEASED");
  process.exit(ok ? 0 : 1);
}

const line = "─".repeat(76);
console.log(line);
console.log("Agent-platform integration — payout gated on DDE delivery evidence");
console.log(line);
console.log(`platform   : ${escrow.platform}`);
console.log(`payout     : ${escrow.payoutWei} wei (held in escrow)`);
console.log("");
for (const a of acts) {
  console.log(`  ${a.escrowState === "RELEASED" ? "✓" : "🔒"} ${a.label}`);
  for (const r of a.reasons) console.log(`      → ${r}`);
}
console.log(line);
console.log("boundary: Execution verification does not decide delivery conformity.");
console.log("          The platform decides payment; DDE decides what the evidence proves.");
const ok = acts.slice(0, 4).every((a) => a.escrowState === "HELD") && acts[4].escrowState.startsWith("RELEASED");
process.exit(ok ? 0 : 1);
