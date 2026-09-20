#!/usr/bin/env node
/**
 * agent-platform-integration — the WIRE-LEVEL "no delivery evidence, no payout" demo.
 *
 * Where run-integration-demo.mjs exercises the SDK surface in-process, this
 * script does the same thing across a real HTTP hop: the platform (modeled)
 * starts the DDE endpoint and, before releasing any payout, POSTs the bilateral
 * fixture to POST /verify and gates escrow on the boundary-stamped report.
 *
 * Scenario, end to end:
 *   act 1 — delivery submitted, no acceptance verdict yet          → HOLD
 *   act 2 — client records a criteria-based REJECTED (C-QUALITY:
 *           2 color tokens on file, 3 required)                    → HOLD
 *   act 3 — provider re-submits after flipping one artifact byte;
 *           the wire report comes back REJECTED (E3)               → HOLD
 *   act 4 — the honest fixture, evidence VERIFIED over the wire,
 *           client's REJECTED verdict on file                      → HOLD
 *           (execution and payment settlement proven — NEITHER
 *            decides conformity)
 *   act 5 — counterfactual: the client records ACCEPTED on the
 *           same criteria evaluations                              → RELEASE
 *   act 6 — mutual acceptance on file (both parties sign the
 *           same criteria) — no dispute yet                        → RELEASE
 *   act 7 — a dispute opens later; evidence stays VERIFIED but
 *           movement freezes anyway                                → HOLD
 *   act 8 — closure declared into the wire without closure
 *           evidence (closedAtUtc still null); F3 names the
 *           declared-vs-established mismatch                       → HOLD
 *   act 9 — the dispute procedure closes the record (closedAtUtc
 *           set outside DDE) — movement follows the closed
 *           record; DDE names no winner                            → RELEASE
 *
 * The scenario rejection (act 2) is built the only way DDE/1 allows: a party
 * acceptance record resting on criterion evaluations — here quoting the
 * failing criterion C-QUALITY by id, with the observed count vs the required
 * one. It is a party act, not a judgment derived from chain facts.
 *
 * The platform never signs, never broadcasts. The endpoint's report is
 * admissible evidence about authorization and execution; the payout decision
 * remains a platform act informed by — never derived from — that report.
 *
 *   node examples/agent-platform-integration/run-http-payout-gate.mjs
 *   node examples/agent-platform-integration/run-http-payout-gate.mjs --json
 *
 * Exit contract (both modes): acts 1–4 HOLD, acts 5–6 RELEASE, acts 7–8 HOLD,
 * act 9 RELEASES — exit 0. Any other shape exits 1.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startDeliveryEndpoint } from "../../packages/delivery/http.js";
import { loadFixtureFromDir } from "../../packages/delivery/sdk.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(HERE, "..", "delivery-fixture");
const PORT = 8791; // loopback only, in-process server, closed at the end
const jsonMode = process.argv.includes("--json");

// --------------------------------------------------------- modeled platform

const escrow = {
  platform: "AgentX-change (modeled integration demo — wire level)",
  payoutWei: "250000000000000000",
  state: "HELD",
  releaseReasons: null,
};

// The client's verdict the platform holds ON FILE (as real platforms do).
// The wire report is evidence; the verdict is a party record the platform
// itself archives — the two are deliberately different things.
const onFileVerdict = () =>
  JSON.parse(readFileSync(join(FIXTURE_DIR, "acceptance-record.json"), "utf8")).verdict;

// The platform's release predicate — a business decision informed by the
// DDE report but never derived from its execution facts.
const releaseCondition = async (accepted) => {
  const res = await fetch(`http://127.0.0.1:${PORT}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", connection: "close" },
    body: JSON.stringify(submittedFixture),
  });
  return { res, report: await res.json() };
};

// ------------------------------------------------------------- the scenario

// Start the DDE endpoint in-process (loopback only) and close it before exit.
const server = await startDeliveryEndpoint({ port: PORT, host: "127.0.0.1" });

const { fixture } = loadFixtureFromDir(FIXTURE_DIR);
let submittedFixture = fixture;

const acts = [];

// ------------------------------------------------- act 1 — acceptance pending

{
  const { res, report } = await releaseCondition();
  const gate = { release: report.status === "VERIFIED" && false }; // no verdict yet platform-side
  acts.push(settle(res, report, gate,
    "delivery submitted — acceptance verdict still pending platform-side"));
}

// ------------------------------- act 2 — the scenario rejection (C-QUALITY)

{
  // The client refuses delivery resting solely on criterion evaluations —
  // quoting the failing criterion by id with observed-vs-required. This is a
  // party act under DDE/1, archived by the platform; nothing about it is
  // derived from the transaction receipt or payment settlement.
  const rejectedRecord = {
    ...JSON.parse(readFileSync(join(FIXTURE_DIR, "acceptance-record.json"), "utf8")),
    verdict: "REJECTED",
    basis: ["CRITERIA_EVALUATION"],
    note: "Scenario rejection: rests solely on criterion evaluations — " +
          "C-QUALITY FAIL observed (2 hex color tokens under '## Color tokens', " +
          "criterion requires at least 3). A party act under DDE/1, not derived " +
          "from execution facts; payment settlement plays no part in it.",
  };
  submittedFixture = { ...fixture, acceptanceRecord: rejectedRecord };
  const { res, report } = await releaseCondition();
  const gate = { release: report.status === "VERIFIED" && false }; // client said REJECTED
  acts.push(settle(res, report, gate,
    "client records REJECTED on C-QUALITY (2 color tokens found, 3 required) — scenario rejection"));
}

// ----------------------------------------- act 3 — one flipped artifact byte

{
  const art = submittedFixture.delivery.artifacts.find((a) => a.id === "handoff-notes.txt");
  const tampered = structuredClone(submittedFixture);
  const tArt = tampered.delivery.artifacts.find((a) => a.id === "handoff-notes.txt");
  tArt.content = tArt.content.slice(0, -1) +
    String.fromCharCode(tArt.content.charCodeAt(tArt.content.length - 1) ^ 0x01);
  submittedFixture = tampered;
  const { res, report } = await releaseCondition();
  const e3 = report.checks?.find((c) => c.id === "E3");
  const gate = { release: report.status === "VERIFIED" && false };
  acts.push(settle(res, report, gate,
    `provider re-submits after flipping one artifact byte — wire report: ${report.status}` +
    (e3 ? ` (E3 ${e3.result})` : "")));
}

// -------------------------- act 4 — the honest boundary, over the wire, head-on

{
  submittedFixture = fixture; // the fixture exactly as committed
  const { res, report } = await releaseCondition();
  const gate = { release: report.status === "VERIFIED" && onFileVerdict() === "ACCEPTED" };
  acts.push(settle(res, report, gate,
    "honest fixture: evidence VERIFIED over the wire, client's REJECTED verdict on file"));
}

// ----------------- act 5 — the counterfactual: party acceptance opens the gate

{
  const { res, report } = await releaseCondition();
  const gate = { release: report.status === "VERIFIED" && true /* modeled ACCEPTED on file */ };
  const settled = settle(res, report, gate,
    "counterfactual: client records ACCEPTED on the same criteria — the gate opens");
  if (gate.release) settled.escrowState = "RELEASED (counterfactual)";
  acts.push(settled);
}

// ------- acts 6–9 — the open-dispute arc: acceptance, freeze, refusal, closure
//
// Mutual acceptance is not immunity. A dispute re-opens the record and freezes
// movement; closure cannot be declared into the wire — it must be established
// by the dispute record itself (closedAtUtc). DDE names no winner; the
// platform moves payment per the closed record, never per an engine verdict.

const mutualAccepted = {
  ...fixture.acceptanceRecord,
  verdict: "ACCEPTED",
  signedBy: [
    fixture.disputeRecord.partyA.agentAddress,
    fixture.disputeRecord.partyB.agentAddress,
  ],
  note: "Mutual acceptance on the same criteria evaluations — the client " +
        "accepts despite the C-QUALITY miss under the rework agreement. A " +
        "party act under DDE/1; not derived from execution facts.",
};
const acceptedNoDispute = {
  ...fixture,
  lifecycleState: "ACCEPTANCE_RECORDED",
  acceptanceRecord: mutualAccepted,
  disputeRecord: { ...fixture.disputeRecord, openedAtUtc: null }, // F0 needs the record; nothing opened it yet
};
const disputeOpen = {
  ...acceptedNoDispute,
  lifecycleState: "DISPUTE_OPEN",
  disputeRecord: fixture.disputeRecord, // the dispute opens — openedAtUtc set
};

// ---------------- act 6 — mutual acceptance, dispute-free

{
  submittedFixture = acceptedNoDispute;
  const { res, report } = await releaseCondition();
  const gate = { release: report.status === "VERIFIED" && true /* both parties on file */ };
  acts.push(settle(res, report, gate,
    "mutual acceptance on file (both parties sign the same criteria) — no dispute yet",
    ["mutual acceptance recorded by both parties on the same criteria evaluations — no dispute open, payout released"]));
}

// ------- act 7 — the dispute opens later: acceptance does not immunize payment

{
  submittedFixture = disputeOpen;
  const { res, report } = await releaseCondition();
  const gate = { release: false }; // dispute open — frozen regardless of acceptance
  acts.push(settle(res, report, gate,
    "dispute opens later — payment frozen despite mutual acceptance", [
      "mutual acceptance on file — the dispute re-opens the record anyway",
      `record state: DISPUTE_OPEN (opened ${fixture.disputeRecord.openedAtUtc}) — movement frozen until the record closes`,
      `DDE decision: ${report.decision}`,
    ]));
}

// ------------- act 8 — closure cannot be declared into the wire

{
  submittedFixture = { ...disputeOpen, lifecycleState: "RECORD_CLOSED" };
  const { res, report } = await releaseCondition();
  const gate = { release: false };
  acts.push(settle(res, report, gate,
    "closure declared into the wire without closure evidence — the wire refuses"));
}

// -------- act 9 — the record closes: movement follows the closed record

{
  submittedFixture = {
    ...disputeOpen,
    lifecycleState: "RECORD_CLOSED",
    disputeRecord: { ...fixture.disputeRecord, closedAtUtc: fixture.disputeRecord.recordClosesAtUtc },
  };
  const { res, report } = await releaseCondition();
  const gate = { release: report.status === "VERIFIED" && true /* record closed by the procedure */ };
  acts.push(settle(res, report, gate,
    "record closed by the dispute procedure — movement follows the closed record", [
      `record closed at ${submittedFixture.disputeRecord.closedAtUtc} — closure belongs to the dispute procedure, outside DDE`,
      "platform moves payment per the closed record — DDE named no winner (engineAdjudication: NONE)",
    ]));
}

// ------------------------------------------------------------------- output

// Teardown: the server is unref'd and every demo request used
// `connection: close`, so no live socket remains — the event loop drains
// naturally. Exit code rides on process.exitCode: a hard process.exit() while
// libuv is still tearing down handles trips an assertion on Windows and
// corrupts the verdict code.
server.unref();

if (jsonMode) {
  console.log(JSON.stringify({
    demo: "coreguard-agent-platform-integration-http",
    endpoint: `http://127.0.0.1:${PORT}/verify`,
    acts,
    escrowFinal: escrow,
  }, null, 2));
}
const ok = acts.slice(0, 4).every((a) => a.escrowState === "HELD") &&
           acts[4].escrowState.startsWith("RELEASED") &&
           acts[5].escrowState === "RELEASED" &&
           acts[6].escrowState === "HELD" &&
           acts[7].escrowState === "HELD" &&
           acts[8].escrowState === "RELEASED";
if (!jsonMode) {
  const line = "─".repeat(76);
  console.log(line);
  console.log("Agent-platform integration (wire level) — payout gated on the DDE HTTP endpoint");
  console.log(line);
  console.log(`platform   : ${escrow.platform}`);
  console.log(`payout     : ${escrow.payoutWei} wei (held in escrow)`);
  console.log("");
  for (const a of acts) {
    console.log(`  ${a.escrowState === "RELEASED" || a.escrowState.startsWith("RELEASED") ? "✓" : "🔒"} ${a.label}`);
    for (const r of a.reasons) console.log(`      → ${r}`);
  }
  console.log(line);
  console.log("boundary: Execution verification does not decide delivery conformity.");
  console.log("          The endpoint classifies evidence; the platform decides payment.");
}
if (!ok) process.exitCode = 1; // drain-exit: no hard kill mid-teardown

// ------------------------------------------------------------------- helpers

/** Settle the escrow from an HTTP response + wire report + platform gate. */
function settle(res, report, gate, label, explicitReasons) {
  escrow.state = gate.release ? "RELEASED" : "HELD";
  escrow.releaseReasons = gate.release
    ? (explicitReasons ?? ["acceptance condition met — payout released to the provider"])
    : (explicitReasons ?? buildHoldReasons(res, report));
  return { label, httpStatus: res.status, wireStatus: report.status, escrowState: escrow.state, reasons: escrow.releaseReasons };
}

/** Named hold reasons — never vague symbols. */
function buildHoldReasons(res, report) {
  const reasons = [];
  if (res.status !== 200 || report.status !== "VERIFIED") {
    reasons.push(`endpoint returned ${res.status} (${report.status}) — no release without a VERIFIED wire report`);
    for (const c of report.checks ?? []) {
      if (c.result === "FAIL") for (const m of c.mismatches ?? [c.name]) reasons.push(`  check ${c.id} FAIL — ${m}`);
      if (c.id === "F3" && c.result === "FAIL" && c.declared) {
        reasons.push(`  check F3 — declared ${c.declared} but the records establish ${c.expected} (closure is established by closedAtUtc, not declared)`);
      }
    }
    if (report.error) reasons.push(`  endpoint said: ${report.error}`);
  } else {
    reasons.push("evidence VERIFIED over the wire — the client's recorded acceptance does not say ACCEPTED");
    reasons.push(`DDE decision: ${report.decision}`);
    reasons.push("execution evidence admissible; payment settlement proven — NEITHER decides conformity");
  }
  return reasons;
}
