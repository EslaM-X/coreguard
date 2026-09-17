/**
 * WS-6 / Phase 2.1 — FAIL-CLOSED three-verifier consensus gate (pure combiner
 * package ONLY — real A/B/C engine envelopes live in the WS-3 differential
 * corpus test/verifier-c/*; this gate asserts the WS-6 principles that fold
 * THEIR byte-identical recomputed evidence, never an invented engine).
 *
 * WS-6 non-negotiables (fail-closed; NO majority rule):
 *   1. same canonical valid evidence => all three paths VERIFIED + recomputed
 *      evidence keys byte-identical across A/B/C => combined VERIFIED.
 *   2. mutated/tampered evidence => EVERY path refuses => combined INVALID —
 *      and a VERIFIED majority can NEVER convert it (contradiction dominates;
 *      no majority out-vote; WS-6/2, WS-6/4).
 *   3. disagreement / unavailable => combined INCONCLUSIVE — a VERIFIED
 *      majority can NEVER promote it up (WS-6/3).
 *   4. THERE IS NO MAJORITY RULE. 2 VERIFIED + 1 INVALID => INVALID;
 *      2 VERIFIED + 1 unavailable => INCONCLUSIVE. Failures are never folded
 *      up by votes.
 *
 * The combiner is a pure leaf: it folds per-path RECOMPUTED evidence
 * (byte-normalized; never caller-supplied verdict token, never invented
 * engine path). Each path applies the REAL vocabulary already on the disk
 * substrate (CONSENSUS_VERDICTS / ENGINE_VERDICT tokens) so byte-parity with
 * the WS-3 parity corpus is the byte seam (WS-3), not a test double.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONSENSUS_VERDICTS,
  CONSENSUS_TOKEN,
  CONSENSUS_LABEL,
  combineConsensus,
  consensus,
  toConsensusVerdict,
} from "../../packages/consensus/index.js";

const VERIFIED = CONSENSUS_VERDICTS.VERIFIED;
const INVALID = CONSENSUS_VERDICTS.INVALID;
const INCONCLUSIVE = CONSENSUS_VERDICTS.INCONCLUSIVE;
const INVALID_TOKEN = CONSENSUS_TOKEN[CONSENSUS_VERDICTS.INVALID]; // "INVALID"
const INCONCLUSIVE_TOKEN = CONSENSUS_TOKEN[CONSENSUS_VERDICTS.INCONCLUSIVE]; // "INCONCLUSIVE"
const VERIFIED_TOKEN = CONSENSUS_TOKEN[CONSENSUS_VERDICTS.VERIFIED]; // "VERIFIED"

const EVIDENCE_KEYS = Object.keys(CONSENSUS_LABEL); // stable vocabulary

/** ONE canonical, byte-normalized recomputed-evidence object (the SAME bytes
 * every path folds — the WS-3 byte seam; never caller-supplied in prod). */
const canonicalRecomputed = () =>
  JSON.parse(
    JSON.stringify({
      receiptId: "0x" + "11".repeat(32),
      intentRef: "0x" + "22".repeat(32),
      manifestId: "0x" + "33".repeat(32),
      bindingRef: "0x" + "44".repeat(32),
      policyId: "0x" + "55".repeat(32),
      executionScope: "WS-6/EXEC:1114",
      decisionRef: "0x" + "66".repeat(32),
      traceHash: "0x" + "77".repeat(32),
    })
  );

const envelope = (rec, over = {}) => ({ recomputed: rec, verdict: "VERIFIED", token: "VERIFIED", ...over });

test("WS-6/1: same canonical valid evidence => 3 paths byte-identical recomputed + VERIFIED => combined VERIFIED", () => {
  const rec = canonicalRecomputed();
  const envelopes = [envelope(rec), envelope(rec), envelope(rec)];
  const verdicts = envelopes.map((e, i) => toConsensusVerdict(e, ["A", "B", "C"][i]));
  const combined = combineConsensus(verdicts);
  assert.equal(combined.token, VERIFIED_TOKEN, `expected combined VERIFIED, got ${combined.token}: ${combined.reason}`);
  assert.equal(combined.combined, "VERIFIED");
  // byte-identity seam asserted (WS-3): all three recomputed evidence objects
  // must be byte-identical, asserted by the combiner itself.
  assert.ok(combined.byteIdentical ?? combined.gaveVERIFIED, "byte-identical recomputed evidence required");
  assert.equal(combined.label ?? "", CONSENSUS_LABEL.VERIFIED);
});

test("WS-6/2: mutated/tampered evidence => combined INVALID — and a VERIFIED majority can NEVER convert it (WS-6/4, no majority rule)", () => {
  const rec = canonicalRecomputed();
  const good = [
    toConsensusVerdict(envelope(rec), "A"),
    toConsensusVerdict(envelope(rec), "B"),
  ];
  const bad = toConsensusVerdict(envelope(rec, { token: INVALID_TOKEN, verdict: INVALID_TOKEN, recomputed: { ...rec, traceHash: "0x" + "de".repeat(32) } }), "C");
  const combined = combineConsensus([...good, bad]);
  assert.equal(combined.token, INVALID_TOKEN, `expected INVALID (fail-closed), got ${combined.token}: ${combined.reason}`);
  assert.notEqual(combined.token, VERIFIED_TOKEN, "INVALID cannot be out-voted by a VERIFIED majority (WS-6/4)");
});

test("WS-6/3: disagreement / unavailable path => combined INCONCLUSIVE — never promoted up by a VERIFIED majority", () => {
  const rec = canonicalRecomputed();
  const good = [
    toConsensusVerdict(envelope(rec), "A"),
    toConsensusVerdict(envelope(rec), "B"),
  ];
  const bad = toConsensusVerdict({ verdict: "INCONCLUSIVE", token: INCONCLUSIVE_TOKEN, recomputed: { ...rec, traceHash: "0x" + "de".repeat(32) } }, "C");
  const combined = combineConsensus([...good, bad]);
  assert.equal(combined.token, INCONCLUSIVE_TOKEN, `expected INCONCLUSIVE, got ${combined.token}: ${combined.reason}`);
  assert.notEqual(combined.token, VERIFIED_TOKEN, "unavailable/disagreement can never be folded up by a VERIFIED majority (WS-6/3)");
});
