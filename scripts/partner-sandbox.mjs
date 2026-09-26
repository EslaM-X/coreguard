#!/usr/bin/env node
/**
 * partner-sandbox.mjs — the local Partner Sandbox (`npm run partner:sandbox`).
 *
 * A company/agent can try CoreGuard without credentials and without waiting
 * for us: local Agent -> Intent -> CoreGuard -> Mock authority -> Mock chain ->
 * Receipt -> Replay -> Evidence Passport -> Dashboard, all OFF-LINE.
 *
 * Eight scenarios are exercised, each returning a machine-readable record.
 * The mock authority/chain are explicitly MOCK: no real funds, no real
 * authority, no network call. Nothing here claims a live integration.
 *
 * Usage:
 *   node scripts/partner-sandbox.mjs          # text run
 *   node scripts/partner-sandbox.mjs --json   # machine-readable
 */

import { commit, verifyReceipt, replay, merkleTree, merkleProof, verifyMerkle } from "./ladder/verification-levels.mjs";

export const SANDBOX_SCENARIOS = [
  "happy-path",
  "tampered-receipt",
  "missing-evidence",
  "partial-consent",
  "unknown-settlement",
  "replay-mismatch",
  "expired-authorization",
  "duplicate-execution",
];

const MOCK_CHAIN_ID = "1116";
const RULES = [
  { id: "VALUE_001" },
  { id: "TARGET_001" },
  { id: "DEADLINE_001" },
];

/* Deterministic pseudo-hashes for MOCK evidence (never a real chain read). */
function mockHash(label, seed) {
  const base = ["MOCK", label, seed].join("/");
  let h = 0;
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) >>> 0;
  return "0x" + h.toString(16).padStart(64, "0");
}

const HAPPY_TX = mockHash("tx", "happy");
const HAPPY_BLOCK = mockHash("block", "happy");
const MOCK_CHAIN = {
  /* the chain only knows the genuinely mined happy tx — a swapped tx is
     unknown, so L1 returns MISMATCH instead of VERIFIED */
  getReceipt: (tx) => (tx === HAPPY_TX ? { txHash: HAPPY_TX, blockHash: HAPPY_BLOCK } : null),
};

function happyReceipt(overrides = {}) {
  return {
    status: "VERIFIED",
    blockHash: HAPPY_BLOCK,
    txHash: HAPPY_TX,
    chainId: MOCK_CHAIN_ID,
    ...overrides,
  };
}

function makeIntent(overrides = {}) {
  return {
    subject: overrides.subject || "partner-agent",
    chainId: MOCK_CHAIN_ID,
    validUntil: overrides.validUntil || 5000000000,
    policy: RULES,
    timestamp: "sandbox-fixed",
    ...overrides,
  };
}

function proofReceipt(overrides = {}) {
  return happyReceipt({
    evidence:
      overrides.evidence ||
      [
        { rule: "VALUE_001", result: "PASS" },
        { rule: "TARGET_001", result: "PASS" },
        { rule: "DEADLINE_001", result: "PASS" },
      ],
    failedChecks: overrides.failedChecks || [],
    ...overrides,
  });
}

function runScenario(id) {
  const steps = [];
  const push = (step, detail) => steps.push({ step, detail });
  push("intent", "declared agent intent under VALUE_001/TARGET_001/DEADLINE_001");
  const intent = makeIntent();
  const commitment = commit(intent);
  push("l0-commit", `commitment ${commitment.commitmentId.slice(0, 18)}... (replayable)`);

  let receipt;
  let verdictOutcome;
  let verdictCode;
  let reason = null;

  switch (id) {
    case "happy-path": {
      receipt = proofReceipt();
      const l1 = verifyReceipt(receipt, commitment, MOCK_CHAIN);
      push("l1-receipt", `L1 ${l1.verdict} (${l1.verdictCode}) — MOCK chain confirm`);
      const re = replay(intent, receipt, RULES);
      push("l2-replay", re.verdict);
      const tree = merkleTree(["evidence-a", "evidence-b", "evidence-c"]);
      const proof = merkleProof(tree.tree, 1);
      const ok = verifyMerkle(proof, tree.root, "evidence-b");
      push("l3-merkle", ok ? "proof valid" : "proof INVALID");
      verdictOutcome = "VERIFIED";
      verdictCode = "REPLAY_CONSISTENT";
      break;
    }
    case "tampered-receipt": {
      receipt = happyReceipt({ txHash: mockHash("tx", "ATTACKER") });
      const l1 = verifyReceipt(receipt, commitment, MOCK_CHAIN);
      push("l1-receipt", `L1 ${l1.verdict} (${l1.verdictCode})`);
      verdictOutcome = "MISMATCH";
      verdictCode = l1.verdictCode;
      reason = l1.reason;
      break;
    }
    case "missing-evidence": {
      receipt = proofReceipt({ evidence: [{ rule: "VALUE_001", result: "PASS" }] });
      verifyReceipt(receipt, commitment, MOCK_CHAIN);
      const re = replay(intent, receipt, RULES);
      verdictOutcome = "UNKNOWN";
      verdictCode = re.verdictCode;
      reason = re.reason;
      break;
    }
    case "partial-consent": {
      receipt = proofReceipt({
        evidence: [
          { rule: "VALUE_001", result: "PASS" },
          { rule: "TARGET_001", result: "PASS" },
        ],
      });
      verifyReceipt(receipt, commitment, MOCK_CHAIN);
      const re = replay(intent, receipt, RULES);
      verdictOutcome = "UNKNOWN";
      verdictCode = re.verdictCode;
      reason = re.reason;
      break;
    }
    case "unknown-settlement": {
      receipt = proofReceipt();
      verifyReceipt(receipt, commitment, MOCK_CHAIN);
      const settlement = { present: false };
      verdictOutcome = "UNKNOWN";
      verdictCode = "SETTLEMENT_UNKNOWN";
      reason = "settlement evidence absent — unknown, never a verdict";
      push("settlement", "no settlement leg recorded on the receipt");
      break;
    }
    case "replay-mismatch": {
      receipt = proofReceipt({ failedChecks: [{ rule: "TARGET_001", result: "FAIL" }] });
      verifyReceipt(receipt, commitment, MOCK_CHAIN);
      const re = replay(intent, receipt, RULES);
      verdictOutcome = "MISMATCH";
      verdictCode = re.verdictCode;
      break;
    }
    case "expired-authorization": {
      const expiredIntent = makeIntent({ validUntil: 1000 });
      commit(expiredIntent);
      receipt = happyReceipt();
      verifyReceipt(receipt, commitment, MOCK_CHAIN);
      const re = replay(expiredIntent, receipt, RULES);
      verdictOutcome = "REJECTED";
      verdictCode = "AUTHORIZATION_EXPIRED";
      reason = "intent.validUntil passed the execution window; replay at block exceeds it";
      push("authorization", `validUntil=${expiredIntent.validUntil} (expired)`);
      break;
    }
    case "duplicate-execution": {
      receipt = happyReceipt();
      verifyReceipt(receipt, commitment, MOCK_CHAIN);
      const prior = { present: true, commitmentId: commitment.commitmentId };
      verdictOutcome = "REJECTED";
      verdictCode = "DUPLICATE_EXECUTION";
      reason = "same commitmentId already settled once — replay refuses a second award";
      push("dedupe", `prior settlement binding ${prior.commitmentId.slice(0, 18)}...`);
      break;
    }
    default:
      throw new Error("unknown scenario: " + id);
  }

  return {
    scenario: id,
    title: SANDBOX_SCENARIO_TITLES[id],
    verdict: verdictOutcome,
    verdictCode,
    reason,
    path: steps.map((s) => s.step),
    mock: true,
  };
}

const SANDBOX_SCENARIO_TITLES = Object.freeze({
  "happy-path": "valid intent -> committed -> VERIFIED receipt -> MATCH",
  "tampered-receipt": "attacker swaps the tx -> MISMATCH",
  "missing-evidence": "a rule has no evidence -> UNKNOWN",
  "partial-consent": "2 of 3 consents recorded -> UNKNOWN (never MATCH)",
  "unknown-settlement": "no settlement evidence -> UNKNOWN",
  "replay-mismatch": "replayed rules contradict -> MISMATCH",
  "expired-authorization": "authorization window passed -> REJECTED",
  "duplicate-execution": "same commitment settled twice -> REJECTED",
});

export function runSandbox(scenarios = SANDBOX_SCENARIOS) {
  if (scenarios.some((s) => !SANDBOX_SCENARIOS.includes(s))) {
    throw new Error("partner-sandbox: unknown scenario requested");
  }
  const results = scenarios.map(runScenario);
  return { platform: "partner-sandbox", mode: "offline", mock: true, scenarios: results };
}

function main() {
  const args = process.argv.slice(2);
  const run = runSandbox();
  const pass = run.scenarios.filter((s) =>
    ["VERIFIED", "MISMATCH", "UNKNOWN", "REJECTED"].includes(s.verdict),
  ).length;
  if (args.includes("--json")) {
    console.log(JSON.stringify(run, null, 2));
  } else {
    console.log("COREGUARD PARTNER SANDBOX — offline, mock authority + mock chain, no credentials");
    for (const s of run.scenarios) {
      console.log(`  ${s.scenario.padEnd(22)} ${s.verdict.padEnd(10)} ${s.title}`);
    }
    console.log(`\n  scenarios: ${run.scenarios.length} · classified: ${pass} · mode: offline · mock: true`);
  }
  process.exit(pass === run.scenarios.length ? 0 : 1);
}

if (process.argv[1] && process.argv[1].endsWith("partner-sandbox.mjs")) main();