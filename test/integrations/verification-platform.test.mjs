import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PROTOCOL_SCHEMA,
  commit,
  isReplayableCommitment,
  verifyReceipt,
  replay,
  merkleTree,
  merkleProof,
  verifyMerkle,
  L4_BOUNDARY,
  providerConformance,
} from "../../scripts/ladder/verification-levels.mjs";
import {
  UNKNOWN_RULE,
  INTEGRATION_DOORWAYS,
  evaluateIntegration,
  transitionVerdict,
  fullAuthorizationRecords,
} from "../../scripts/ladder/integration-states.mjs";
import { createAdapter, adapterContractConformance, ADAPTER_STATUS } from "../../packages/adapters/contract.mjs";
import { buildProviders, PROVIDER_SPECS } from "../../packages/adapters/providers.mjs";
import { runSandbox, SANDBOX_SCENARIOS } from "../../scripts/partner-sandbox.mjs";
import { runAttackLab } from "../../scripts/attack-lab.mjs";
import { createSink, EVENT_NAMES, EVENT_NAME_SET } from "../../scripts/observability.mjs";
import { buildPassportV2, PASSPORT_V2_SCHEMA } from "../../scripts/passport-v2.mjs";
import {
  MILESTONE_KINDS,
  MILESTONE_RULE,
  REPUTATION_COUNTERS,
  buildReputation,
} from "../../scripts/ladder/reputation.mjs";
import { buildBoard, boardText } from "../../scripts/ladder/adoption-dashboard.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const SNAPSHOT = JSON.parse(readFileSync(join(REPO, "docs", "state-snapshot.json"), "utf8"));

const RULES = [{ id: "VALUE_001" }, { id: "TARGET_001" }, { id: "DEADLINE_001" }];
const TX = "0x" + "ab".repeat(32);
const BLOCK = "0x" + "cd".repeat(32);
const chainOk = { getReceipt: (tx) => (tx === TX ? { txHash: TX, blockHash: BLOCK } : null) };

test("verification protocol: L0 commit is deterministic, replayable, schema-pinned", () => {
  const intent = { subject: "alice", chainId: "1116", policy: RULES };
  const a = commit(intent);
  const b = commit(intent);
  assert.equal(a.commitmentId, b.commitmentId);
  assert.ok(isReplayableCommitment(a));
  assert.equal(a.schemaVersion, PROTOCOL_SCHEMA);
  assert.equal(a.subject, "alice");
  assert.equal(a.policy[0].id, "VALUE_001");
  assert.throws(() => commit(null), TypeError);
  assert.throws(() => commit({ subject: "x", policy: [] }), TypeError);
});

test("verification protocol: L1 VERIFIED requires chain confirmation never structure alone", () => {
  const commitment = commit({ subject: "alice", chainId: "1116", policy: RULES });
  const good = verifyReceipt({ status: "VERIFIED", blockHash: BLOCK, txHash: TX, chainId: "1116" }, commitment, chainOk);
  assert.equal(good.verdict, "VERIFIED");
  assert.equal(good.verdictCode, "RECEIPT_INTEGRITY");
  const unconfirmed = verifyReceipt({ status: "VERIFIED", blockHash: BLOCK, txHash: TX, chainId: "1116" }, commitment);
  assert.equal(unconfirmed.verdict, "UNKNOWN");
  assert.equal(unconfirmed.verdictCode, "NO_CHAIN_EVIDENCE");
  const forged = verifyReceipt({ status: "VERIFIED", blockHash: "0x" + "ff".repeat(32), txHash: "0x" + "ee".repeat(32), chainId: "1116" }, commitment, chainOk);
  assert.equal(forged.verdict, "MISMATCH");
  assert.equal(forged.verdictCode, "TX_NOT_FOUND");
  const inconsistent = verifyReceipt({ status: "VERIFIED", blockHash: "0x1", txHash: "0x", chainId: "9999" }, commitment, chainOk);
  assert.equal(inconsistent.verdict, "UNKNOWN");
  const missing = verifyReceipt({ status: "VERIFIED" }, commitment, chainOk);
  assert.equal(missing.verdict, "UNKNOWN");
  assert.equal(missing.verdictCode, "REQUIRED_EVIDENCE_MISSING");
});

test("verification protocol: L2 replay is MATCH/MISMATCH/UNKNOWN with no partial-to-MATCH", () => {
  const intent = { subject: "alice", chainId: "1116", policy: RULES };
  const match = replay(intent, { evidence: RULES.map((r) => ({ rule: r.id, result: "PASS" })) }, RULES);
  assert.equal(match.verdict, "MATCH");
  const partial = replay(intent, { evidence: [{ rule: "VALUE_001", result: "PASS" }] }, RULES);
  assert.equal(partial.verdict, "UNKNOWN");
  const contradiction = replay(intent, { evidence: RULES.map((r) => ({ rule: r.id, result: "PASS" })), failedChecks: [{ rule: "VALUE_001", result: "FAIL" }] }, RULES);
  assert.equal(contradiction.verdict, "MISMATCH");
});

test("verification protocol: L3 merkle proofs are honest in both directions", () => {
  const tree = merkleTree(["a", "b", "c", "d"]);
  const proof = merkleProof(tree.tree, 1);
  assert.ok(verifyMerkle(proof, tree.root, "b"));
  assert.ok(!verifyMerkle(proof, tree.root, "x"));
  const single = merkleTree(["only"]);
  assert.equal(single.root, single.leaves[0]);
});

test("verification protocol: L4 stays RESEARCH with a frozen interface boundary", () => {
  assert.equal(L4_BOUNDARY.status, "RESEARCH");
  assert.ok(L4_BOUNDARY.contract.includes("RESEARCH"));
  assert.ok(providerConformance({ commit(){}, verifyReceipt(){}, replay(){}, merkleVerify(){}, zkVerify(){} }).status === "VERIFIED");
  assert.equal(providerConformance({}).verdictCode, "PROVIDER_INCOMPLETE");
});

test("integration machine: every doorway record has entry/exit/verdict/evidence fields", () => {
  const states = Object.keys(INTEGRATION_DOORWAYS);
  assert.equal(states.length, 13, "the 13-state space must be complete");
  for (const s of ["NOT_STARTED", "DRY_RUN", "SANDBOX_AUTHORIZED", "LIVE_PREPARED", "WEBHOOK_CONNECTED", "CONFORMANT", "PRODUCTION", "REVOKED"]) {
    assert.ok(states.includes(s), `${s} must be a doorway state`);
  }
  for (const s of states) {
    const d = INTEGRATION_DOORWAYS[s];
    assert.ok(d.entryCriteria, `${s} needs entryCriteria`);
    assert.ok(Array.isArray(d.requiredEvidence), `${s} needs requiredEvidence`);
    assert.ok(d.verificationCommand, `${s} needs verificationCommand`);
    assert.ok(d.exitCriteria, `${s} needs exitCriteria`);
    assert.ok(d.failureState, `${s} needs failureState`);
    assert.ok(d.unknownState, `${s} needs unknownState`);
    assert.ok(d.auditRecord, `${s} needs auditRecord`);
  }
});

test("integration machine: evaluateIntegration produces a machine record, never prose", () => {
  const rec = evaluateIntegration({
    state: "DRY_RUN",
    integrationStatus: "NOT_BUILT",
    networkCall: "PERFORMED",
  });
  assert.equal(typeof rec, "object");
  assert.equal(rec.state, "DRY_RUN");
  assert.equal(rec.status, "UNKNOWN", "a performed network call never upgrades a NOT_BUILT integration");
  assert.equal(rec.verifiedAt, null, "records are deterministic, timestamps stay null");
  assert.ok(Array.isArray(rec.claims) && rec.claims.length === 0, "no claims without recorded evidence");
  assert.ok(rec.unknowns.length >= 1, "unknowns must be explicit");
});

test("integration machine: no silent pass — a forbidden live jump without authorization is REJECTED", () => {
  const v = transitionVerdict("DRY_RUN", "SANDBOX_AUTHORIZED", {});
  assert.equal(v.outcome, "REJECTED");
  assert.ok(v.missing.length >= 1);
  const live = transitionVerdict("DRY_RUN", "PRODUCTION", {});
  assert.equal(live.outcome, "REJECTED", "stepping into a live state without records is never allowed");
});

test("integration machine: UNKNOWN rule is binding and the 13 authorization records exist", () => {
  assert.ok(UNKNOWN_RULE.includes("UNKNOWN"));
  assert.ok(UNKNOWN_RULE.includes("FAILED"));
  assert.ok(UNKNOWN_RULE.includes("VERIFIED"));
  const records = fullAuthorizationRecords();
  assert.equal(Object.keys(records).length, 13);
});

test("adapters: DRY_RUN execution is never claimed", () => {
  const a = createAdapter({ id: "X402", runMode: "DRY_RUN" });
  const out = a.execute({ intent: "x" });
  assert.equal(out.ok, false);
  assert.equal(out.status, "NOT_PERFORMED");
  assert.ok(out.reason.startsWith("dry-run"));
  assert.equal(a.verify({ receipt: null }).verdict, "UNKNOWN");
  assert.equal(a.status().verdictCode, "NO_CREDENTIALS");
});

test("adapters: contract conformance validates the six-method topology", () => {
  const a = createAdapter({ id: "X402", runMode: "DRY_RUN" });
  const ok = adapterContractConformance(a);
  assert.equal(ok.status, "VERIFIED");
  assert.equal(ok.verdictCode, "CONTRACT_COMPLETE");
  assert.equal(adapterContractConformance({}).status, "UNKNOWN", "a partial adapter is CONTRACT_INCOMPLETE, never conformant");
  assert.ok(ADAPTER_STATUS.includes("DRY_RUN"));
  assert.ok(ADAPTER_STATUS.includes("VERIFIED"));
});

test("adapters: every provider stays DRY_RUN, contract-conformant, status UNKNOWN, integration NOT_BUILT", () => {
  const providers = buildProviders();
  assert.equal(providers.length, PROVIDER_SPECS.length);
  for (const p of providers) {
    assert.equal(p.contract, "VERIFIED", `${p.id} must satisfy the adapter contract`);
    assert.equal(p.status.runMode, "DRY_RUN", `${p.id} must not claim a live mode`);
    assert.equal(p.status.verdictCode, "NO_CREDENTIALS", `${p.id} without credentials reports NO_CREDENTIALS`);
    assert.equal(p.status.integrationStatus, "NOT_BUILT");
  }
});

test("partner sandbox: all eight scenarios classify with the honest verdicts, offline + mock", () => {
  const run = runSandbox();
  assert.equal(run.mode, "offline");
  assert.equal(run.mock, true);
  const map = Object.fromEntries(run.scenarios.map((s) => [s.scenario, s.verdict]));
  assert.equal(map["happy-path"], "VERIFIED");
  assert.equal(map["tampered-receipt"], "MISMATCH");
  assert.equal(map["missing-evidence"], "UNKNOWN");
  assert.equal(map["partial-consent"], "UNKNOWN");
  assert.equal(map["unknown-settlement"], "UNKNOWN");
  assert.equal(map["replay-mismatch"], "MISMATCH");
  assert.equal(map["expired-authorization"], "REJECTED");
  assert.equal(map["duplicate-execution"], "REJECTED");
  assert.deepEqual(run.scenarios.map((s) => s.scenario), SANDBOX_SCENARIOS);
});

test("attack lab: every tamper lands fail-closed and the valid control verifies", () => {
  const { sequence, control } = runAttackLab();
  assert.equal(sequence.length, 10);
  assert.equal(sequence.filter((a) => !a.pass).length, 0);
  assert.ok(control.pass);
  assert.equal(control.verdict, "VERIFIED");
  const fail = sequence.filter((a) => a.expected === "FAIL").length;
  const unknown = sequence.filter((a) => a.expected === "UNKNOWN").length;
  assert.ok(fail >= 5 && unknown >= 3, "the lab must cover both FAIL and UNKNOWN classes");
});

test("observability: known events only, correlation fields attached, unknown rejected", () => {
  assert.equal(EVENT_NAMES.length, 10);
  assert.ok(EVENT_NAME_SET.has("commitment_created"));
  const sink = createSink();
  const e = sink.emit("verification_passed", { caseId: "case-1", adapterId: "PEOPLES_COURT", level: "L1" });
  assert.equal(sink.count(), 1);
  assert.ok(e.correlationId);
  assert.equal(e.caseId, "case-1");
  assert.equal(e.adapterId, "PEOPLES_COURT");
  assert.equal(e.level, "L1");
  assert.throws(() => sink.emit("not_a_real_event"));
});

test("evidence passport v2: deterministic unified object with honest unknowns", () => {
  const a = buildPassportV2();
  const b = buildPassportV2();
  assert.equal(JSON.stringify(a), JSON.stringify(b), "passport must be deterministic");
  assert.equal(a.schemaVersion, PASSPORT_V2_SCHEMA);
  assert.equal(a.subject, "coreguard-verification-platform");
  assert.equal(a.verificationLevel, "L0");
  assert.deepEqual(a.receipts, []);
  assert.deepEqual(a.proofs, []);
  assert.equal(a.reputationScore, 0);
  assert.equal(a.engineering.testsTotal, SNAPSHOT.testsTotal);
  assert.equal(a.engineering.filesScanned, SNAPSHOT.boundaryAudit.filesScanned);
  assert.ok(a.unknowns.length >= 1, "unknowns must be explicit");
});

test("reputation: milestone kinds keep internal evidence out of the score", () => {
  assert.ok(MILESTONE_RULE.length > 40);
  assert.equal(MILESTONE_KINDS.TESTS_PASSING.klass, "internal");
  assert.equal(MILESTONE_KINDS.EXTERNAL_VERIFIER.klass, "external");
  const internal = buildReputation({ milestones: [
    { kind: "TESTS_PASSING" },
    { kind: "CONFORMANCE_PASS" },
    { kind: "REPLAY_VERIFIED" },
  ] });
  assert.equal(internal.score, 0, "a million green CI runs never raise reputation");
  assert.equal(internal.internalRecorded.length, 3);
  const external = buildReputation({ milestones: [
    { kind: "EXTERNAL_VERIFIER" },
    { kind: "SANDBOX_INTEGRATION" },
    { kind: "LIVE_RECEIPT" },
  ] });
  assert.equal(external.score, 3, "external-class events raise the score");
  assert.ok(REPUTATION_COUNTERS.includes("sandboxIntegrations"));
  assert.ok(REPUTATION_COUNTERS.includes("liveReceipts"));
  const unknownKind = buildReputation({ milestones: [{ kind: "madeUpBonus" }] });
  assert.equal(unknownKind.score, 0, "unknown kinds never invent reputation");
});

test("control plane: derived-only numbers, zeroes explicit, no fabricated percentages", () => {
  const board = buildBoard();
  assert.ok(board.controlPlane, "board must carry the control-plane block");
  assert.equal(board.controlPlane.verification.length, 5);
  assert.equal(board.controlPlane.verification[0].level, "L0");
  assert.equal(board.controlPlane.verification[4].level, "L4");
  assert.equal(board.controlPlane.commercial.revenue, "$0");
  assert.equal(board.controlPlane.commercial.customers, "0 verified");
  const txt = boardText(board);
  assert.ok(txt.includes("Control plane"));
  assert.ok(txt.includes("$0"), "the dashboard text must show the honest revenue zero");
  assert.ok(txt.includes("UNPROVEN"), "the honest reputation grade stays visible");
});