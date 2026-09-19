/**
 * Recovery engine failure-injection suite (Gate 5 = F-4 root fix).
 *
 * Simulates every interruption the Gate 4.1 incident class demands:
 *   crash-after-send, crash-during-receipt-read, RPC divergence,
 *   tx-exists-but-event-unexpected, recovery restart, duplicate-tx refusal,
 *   and proves: NO manual reconstruction / NO ambiguous success / NO silent recovery.
 *
 * Self-contained: uses only node:test + node:fs into a temp journal.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createRecoveryRun,
  runRecovery,
  sha256hex,
  TERMINAL_STATES,
} from "../../packages/recovery/index.js";

const tmp = () => mkdtempSync(join(tmpdir(), "cg-rec-"));
const jpath = (dir, name = "journal.json") => join(dir, name);

const BOOTSTRAP = {
  intentId: "intent-1",
  chainId: 1116,
  from: "0x0000000000000000000000000000000000000001",
  nonce: 7,
  calldata: "0xcalldata-raw-bytes",
  evidenceHashPre: sha256hex("evidence-pre-send"),
  expectedEvents: ["CommitIntent(address,bytes32)"],
  minProviders: 2,
};

const receiptOk = ({ txHash, provider }) => ({
  status: "0x1",
  blockNumber: 38827925,
  gasUsed: "0x5208",
  logs: [{ topics: ["CommitIntent(address,bytes32)"] }],
});

const SUCCESS_PROVIDERS = ["coredao", "ankr"];

test("REC-A: happy path -> VERIFIED only with >= minProviders agreement", async () => {
  const dir = tmp();
  const run = createRecoveryRun({ ...BOOTSTRAP, journalPath: jpath(dir) });
  const result = await runRecovery({
    run,
    broadcast: async () => ({ txHash: "0xaaaa", provider: "broadcaster" }),
    readReceiptByTxHash: receiptOk,
    providers: SUCCESS_PROVIDERS,
  });
  assert.strictEqual(result.verdict.state, "VERIFIED");
  assert.ok(result.txHash === "0xaaaa");
  // Journal must be terminal and digest deterministic.
  const again = createRecoveryRun({ ...BOOTSTRAP, journalPath: jpath(dir) });
  assert.strictEqual(again.digest, result.journalDigest, "reopening journal must reproduce identical digest");
  rmSync(dir, { recursive: true, force: true });
});

test("REC-B: crash AFTER send (broadcaster returned hash, process died before receipt) -> restart recovers", async () => {
  const dir = tmp();
  const path = jpath(dir);
  const run = createRecoveryRun({ ...BOOTSTRAP, journalPath: path });
  run.declareSendIntent();
  const txHash = run.recordSendResult({ txHash: "0xbeef", provider: "broadcaster" }).data.txHash;
  // simulate process death: verify() is never called. A NEW process reopens the journal.
  const run2 = createRecoveryRun({ ...BOOTSTRAP, journalPath: path });
  run2.declareSendIntent(); // idempotent, same calldata
  const res = await runRecovery({
    run: run2,
    // broadcaster must NOT be consulted again (txHash already journaled) -> would be duplicate send
    broadcast: async () => {
      throw new Error("DUPLICATE SEND ATTEMPTED");
    },
    readReceiptByTxHash: receiptOk,
    providers: SUCCESS_PROVIDERS,
  });
  assert.strictEqual(res.txHash, txHash, "recovery reuses the journaled txHash, never re-sends");
  assert.strictEqual(res.verdict.state, "VERIFIED");
  rmSync(dir, { recursive: true, force: true });
});

test("REC-C: crash DURING receipt read (second provider throws) -> one errored read, NOT verified", async () => {
  const dir = tmp();
  const run = createRecoveryRun({ ...BOOTSTRAP, journalPath: jpath(dir) });
  const providers = ["coredao", "ankr"];
  await runRecovery({
    run,
    broadcast: async () => ({ txHash: "0xcafe", provider: "broadcaster" }),
    readReceiptByTxHash: async ({ provider }) => {
      if (provider === "ankr") throw new Error("rpc down mid-read");
      return receiptOk({ txHash: "0xcafe", provider });
    },
    providers,
  });
  const verdict = run.journal.last("VERDICT")[0].data;
  // one successful + one erroring read: agreement impossible -> INCONCLUSIVE or CONTRADICTED, NOT VERIFIED
  assert.notStrictEqual(verdict.state, "VERIFIED", "must not claim VERIFIED on partial reads");
  assert.ok(TERMINAL_STATES.includes(verdict.state));
  // errored read must be journaled (no silent hole)
  assert.ok(run.journal.last("RECEIPT_READ").some((e) => e.data.error), "errored read must be journaled");
  rmSync(dir, { recursive: true, force: true });
});

test("REC-D: transaction exists but expected event ABSENT in logs -> CONTRADICTED", async () => {
  const dir = tmp();
  const run = createRecoveryRun({ ...BOOTSTRAP, journalPath: jpath(dir) });
  await runRecovery({
    run,
    broadcast: async () => ({ txHash: "0xdead", provider: "broadcaster" }),
    readReceiptByTxHash: async () => ({
      status: "0x1",
      blockNumber: 38827925,
      logs: [{ topics: ["SomeOtherEvent(address)"] }], // NOT the committed intent event
    }),
    providers: SUCCESS_PROVIDERS,
  });
  const verdict = run.journal.last("VERDICT")[0].data;
  assert.strictEqual(verdict.state, "CONTRADICTED");
  assert.ok(verdict.reasons.some((r) => r.includes("expected event was ABSENT")));
  rmSync(dir, { recursive: true, force: true });
});

test("REC-E: RPC divergence (one 0x1, other 0x0) -> CONTRADICTED, never VERIFIED", async () => {
  const dir = tmp();
  const run = createRecoveryRun({ ...BOOTSTRAP, journalPath: jpath(dir) });
  await runRecovery({
    run,
    broadcast: async () => ({ txHash: "0xd1v", provider: "broadcaster" }),
    readReceiptByTxHash: async ({ provider }) =>
      provider === "ankr"
        ? { status: "0x0", blockNumber: 38827925, logs: [] }
        : receiptOk({ txHash: "0xd1v", provider }),
    providers: SUCCESS_PROVIDERS,
  });
  const verdict = run.journal.last("VERDICT")[0].data;
  assert.strictEqual(verdict.state, "CONTRADICTED");
  rmSync(dir, { recursive: true, force: true });
});

test("REC-F: recovery restart is idempotent and never fabricates a send", async () => {
  const dir = tmp();
  const path = jpath(dir);
  let sendCount = 0;
  const broadcast = async () => {
    sendCount += 1;
    return { txHash: `0x${sendCount}`, provider: "broadcaster" };
  };
  // First pass: full run. Second pass: reopening must do ZERO sends.
  const r1 = createRecoveryRun({ ...BOOTSTRAP, journalPath: path });
  await runRecovery({ run: r1, broadcast, readReceiptByTxHash: receiptOk, providers: SUCCESS_PROVIDERS });
  assert.strictEqual(sendCount, 1);
  const r2 = createRecoveryRun({ ...BOOTSTRAP, journalPath: path });
  const res = await runRecovery({ run: r2, broadcast, readReceiptByTxHash: receiptOk, providers: SUCCESS_PROVIDERS });
  assert.strictEqual(sendCount, 1, "recovery restart must not re-send");
  assert.strictEqual(r2.journal.entries.length, r1.journal.entries.length, "no new journal entries on restart");
  assert.strictEqual(res.verdict.state, "VERIFIED");
  rmSync(dir, { recursive: true, force: true });
});

test("REC-G: events absent and receipt missing -> NOT_PROVEN (fail-closed, never silent success)", async () => {
  const dir = tmp();
  const run = createRecoveryRun({ ...BOOTSTRAP, journalPath: jpath(dir) });
  run.declareSendIntent();
  const txHash = run.recordSendResult({ txHash: "0x1111", provider: "broadcaster" }).data.txHash;
  // No receipt read at all -> resolveVerdict must return NOT_PROVEN (nothing on chain seen).
  const verdict = run.resolveVerdict({ intendedTxHash: txHash });
  assert.strictEqual(verdict.data.state, "NOT_PROVEN");
  assert.ok(verdict.data.reasons.some((r) => r.includes("no provider observed a successful")));
  rmSync(dir, { recursive: true, force: true });
});

test("REC-H: reconstruction is automatic + tagged; there is NO manual success-writer API", async () => {
  const dir = tmp();
  const run = createRecoveryRun({ ...BOOTSTRAP, journalPath: jpath(dir) });
  run.markReconstruction({ reason: "tx found by nonce rescan", foundTxHash: "0xrec0n" });
  const rec = run.journal.last("RECONSTRUCTION")[0];
  assert.strictEqual(rec.data.automatic, true, "reconstruction must be automatic");
  assert.ok(rec.data.reason);
  // No API writes VERIFIED by hand: only resolveVerdict does, and it requires provider reads.
  const methods = Object.keys(run);
  assert.ok(!methods.includes("writeVerdict"), "no manual verdict-writer is exposed");
  rmSync(dir, { recursive: true, force: true });
});

test("REC-I: VERIFIED requires the pre-send evidenceHash expectation to hold", async () => {
  const dir = tmp();
  const path = jpath(dir);
  const r1 = createRecoveryRun({ ...BOOTSTRAP, journalPath: path });
  r1.declareSendIntent();
  r1.recordSendResult({ txHash: "0xe9", provider: "b" }).data;
  // Reopen same journal WITH A DIFFERENT calldata: the persisted calldataHash check must trip.
  const r2 = createRecoveryRun({ ...BOOTSTRAP, journalPath: path, calldata: "0xDIFFERENT-CALLDATA" });
  r2.declareSendIntent();
  await Promise.all(
    SUCCESS_PROVIDERS.map(async (p) =>
      r2.recordReceiptRead({ provider: p, txHash: "0xe9", receipt: receiptOk({ txHash: "0xe9", provider: p }), logTopics: ["CommitIntent(address,bytes32)"] })
    )
  );
  const verdict = r2.resolveVerdict({ intendedTxHash: "0xe9" });
  assert.strictEqual(verdict.data.state, "CONTRADICTED", "mismatched calldata between runs must contradict");
  rmSync(dir, { recursive: true, force: true });
});

test("REC-J: single provider can never flip to VERIFIED (minProviders=2 default)", async () => {
  const dir = tmp();
  const run = createRecoveryRun({ ...BOOTSTRAP, journalPath: jpath(dir) });
  await runRecovery({
    run,
    broadcast: async () => ({ txHash: "0x5ing", provider: "broadcaster" }),
    readReceiptByTxHash: receiptOk,
    providers: ["coredao"],
  });
  const verdict = run.journal.last("VERDICT")[0].data;
  assert.strictEqual(verdict.state, "INCONCLUSIVE", "one provider alone is INCONCLUSIVE at minProviders=2");
  assert.ok(verdict.reasons.some((r) => r.includes("2 required")));
  rmSync(dir, { recursive: true, force: true });
});